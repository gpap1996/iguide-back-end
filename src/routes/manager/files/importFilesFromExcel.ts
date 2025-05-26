import { Hono } from "hono";
import { db } from "../../../db";
import { file_translations } from "../../../db/schema/file_translations";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";
import ExcelJS from "exceljs";
import { eq, and, inArray } from "drizzle-orm";

// Define interface for translation updates
interface TranslationUpdate {
  fileId: number;
  languageId: number;
  title: string | null;
  description: string | null;
  rowNumber: number; // Track row number for better error reporting
}

export const importFilesFromExcel = new Hono().post(
  "/",
  requiresManager,
  async (c) => {
    try {
      const currentUser = c.get("currentUser");
      if (!currentUser?.projectId) {
        return c.json({ error: "Project ID not found for current user" }, 400);
      }
      const projectId = Number(currentUser.projectId);
      // Get form data with Excel file
      const formData = await c.req.formData();
      const excelFile = formData.get("file") as File | null;

      if (!excelFile) {
        return c.json({ error: "No file uploaded" }, 400);
      }

      // Check file type
      if (
        !excelFile.name.endsWith(".xlsx") &&
        !excelFile.name.endsWith(".xls")
      ) {
        return c.json(
          {
            error:
              "Invalid file format. Only Excel files (.xlsx, .xls) are allowed",
          },
          400
        );
      }

      // Convert File to ArrayBuffer
      const arrayBuffer = await excelFile.arrayBuffer();

      // Parse Excel file using ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.getWorksheet(1); // Get first worksheet
      if (!worksheet) {
        return c.json({ error: "Excel file is empty" }, 400);
      }

      // Get headers from first row
      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell) => {
        if (cell.value) {
          headers.push(String(cell.value));
        }
      });

      if (headers.length === 0) {
        return c.json({ error: "No headers found in Excel file" }, 400);
      }

      // Get available languages from database
      const availableLanguages = await db.query.languages.findMany({
        where: (languages, { eq }) => eq(languages.projectId, projectId),
        columns: {
          id: true,
          locale: true,
        },
      });

      if (!availableLanguages.length) {
        return c.json({ error: "No languages found in the database" }, 404);
      }

      // Map locale to language ID for quicker lookups
      const localeToLanguageIdMap = new Map<string, number>();
      availableLanguages.forEach((lang) => {
        localeToLanguageIdMap.set(lang.locale, lang.id);
      });

      // Check for invalid columns in the spreadsheet
      const unexpectedColumns = headers.filter((key) => {
        // Skip ID, Type, Name columns which are protected
        if (key === "id" || key === "type" || key === "name") return false;

        // Check if translation column follows correct pattern: title_XX or description_XX
        if (!key.startsWith("title_") && !key.startsWith("description_"))
          return true;

        // Get locale part (after underscore)
        const locale = key.split("_")[1];

        // Check if this locale exists in our database
        return !availableLanguages.some((lang) => lang.locale === locale);
      });

      if (unexpectedColumns.length > 0) {
        return c.json(
          {
            error: "Invalid column names detected",
            details:
              `The following columns are not recognized: ${unexpectedColumns.join(
                ", "
              )}. ` +
              `Make sure to use the export format without modifications.`,
          },
          400
        );
      }

      // Parse the translations to update
      const translationsToUpdate: TranslationUpdate[] = [];
      const errors: string[] = [];
      const fileIds = new Set<number>();

      // Process each row (skip header row)
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowData: Record<string, any> = {};

        // Get cell values
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        // Extract fileId from ID column
        const idField = rowData["id"];
        if (idField === undefined) {
          errors.push(`Row ${rowNumber}: Missing ID column`);
          continue;
        }

        const fileId = parseInt(String(idField), 10);
        if (isNaN(fileId)) {
          errors.push(`Row ${rowNumber}: Invalid file ID: ${idField}`);
          continue;
        }

        // Collect unique file IDs to validate in bulk
        fileIds.add(fileId);

        // Track if any translations are found for this file
        let translationsFound = false;
        let translationCount = 0;

        // Process each language column (title and description)
        for (const lang of availableLanguages) {
          const titleKey = `title_${lang.locale}`;
          const descKey = `description_${lang.locale}`;

          // Only add to updates if at least one field has valid content
          if (
            (titleKey in rowData || descKey in rowData) &&
            (rowData[titleKey] !== undefined || rowData[descKey] !== undefined)
          ) {
            translationCount++;
            translationsToUpdate.push({
              fileId,
              rowNumber,
              languageId: lang.id,
              title: rowData[titleKey] || null,
              description: rowData[descKey] || null,
            });
            translationsFound = true;
          }
        }

        if (!translationsFound) {
          errors.push(
            `Row ${rowNumber}: No valid translations found for file ID ${fileId}`
          );
        }
      }

      // Get file types for validation after collecting all IDs
      const fileTypes = await db
        .select({ id: files.id, type: files.type })
        .from(files)
        .where(inArray(files.id, Array.from(fileIds)));

      const fileTypeMap = new Map(fileTypes.map((f) => [f.id, f.type]));

      // Validate audio files have at most one translation
      const audioFileTranslations = new Map<number, Set<number>>();
      for (const translation of translationsToUpdate) {
        const fileType = fileTypeMap.get(translation.fileId);
        if (fileType === "audio") {
          if (!audioFileTranslations.has(translation.fileId)) {
            audioFileTranslations.set(translation.fileId, new Set());
          }
          audioFileTranslations
            .get(translation.fileId)
            ?.add(translation.languageId);
        }
      }

      // Check for audio files with more than one translation
      for (const [fileId, languageIds] of audioFileTranslations.entries()) {
        if (languageIds.size > 1) {
          const affectedRows = translationsToUpdate
            .filter((t) => t.fileId === fileId)
            .map((t) => t.rowNumber);
          errors.push(
            `Audio file (ID: ${fileId}) has ${
              languageIds.size
            } translations, but audio files can have at most 1 (affects rows: ${affectedRows.join(
              ", "
            )})`
          );
        }
      }

      if (errors.length > 0) {
        return c.json(
          {
            error: "Validation errors",
            details: errors,
          },
          400
        );
      }

      if (translationsToUpdate.length === 0) {
        return c.json({ message: "No translations to update" }, 200);
      }

      // Validate all file IDs exist in the database
      const fileIdsArray = Array.from(fileIds);
      const existingFiles = await db
        .select({ id: files.id })
        .from(files)
        .where(inArray(files.id, fileIdsArray));

      const existingFileIds = new Set(existingFiles.map((f) => f.id));
      const missingFileIds: { id: number; rows: number[] }[] = [];

      // Check which file IDs don't exist in the database
      for (const fileId of fileIdsArray) {
        if (!existingFileIds.has(fileId)) {
          // Find all rows with this missing ID
          const affectedRows = translationsToUpdate
            .filter((t) => t.fileId === fileId)
            .map((t) => t.rowNumber);

          missingFileIds.push({
            id: fileId,
            rows: affectedRows,
          });
        }
      }

      // If any file IDs are missing, return error
      if (missingFileIds.length > 0) {
        const errorDetails = missingFileIds.map(
          (entry) =>
            `File ID ${
              entry.id
            } does not exist (affects rows: ${entry.rows.join(", ")})`
        );

        return c.json(
          {
            error: "Invalid file IDs detected",
            details: errorDetails,
          },
          400
        );
      }

      try {
        // Use a transaction to ensure all updates succeed or fail together
        const results = await db.transaction(async (tx) => {
          // First, delete all existing translations for audio files that are being updated
          const audioFileIds = Array.from(audioFileTranslations.keys());
          if (audioFileIds.length > 0) {
            await tx
              .delete(file_translations)
              .where(inArray(file_translations.fileId, audioFileIds));
          }

          return await Promise.all(
            translationsToUpdate.map(async (translation) => {
              try {
                // Check if translation exists
                const existingTranslation = await tx
                  .select()
                  .from(file_translations)
                  .where(
                    and(
                      eq(file_translations.fileId, translation.fileId),
                      eq(file_translations.languageId, translation.languageId)
                    )
                  )
                  .limit(1);

                if (existingTranslation.length > 0) {
                  // Update existing translation
                  return tx
                    .update(file_translations)
                    .set({
                      title: translation.title,
                      description: translation.description,
                      updatedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(file_translations.fileId, translation.fileId),
                        eq(file_translations.languageId, translation.languageId)
                      )
                    );
                } else {
                  // Insert new translation
                  return tx.insert(file_translations).values({
                    fileId: translation.fileId,
                    languageId: translation.languageId,
                    title: translation.title,
                    description: translation.description,
                  });
                }
              } catch (error) {
                // Add row number to error for better reporting
                throw new Error(
                  `Error processing row ${translation.rowNumber}: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`
                );
              }
            })
          );
        });
      } catch (error) {
        // Transaction failed - all changes rolled back
        console.error("Transaction failed during import:", error);
        return c.json(
          {
            error: "Failed to update translations",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }

      // Count updates by file ID for more detailed reporting
      const fileUpdateCounts = new Map<number, number>();
      for (const translation of translationsToUpdate) {
        const count = fileUpdateCounts.get(translation.fileId) || 0;
        fileUpdateCounts.set(translation.fileId, count + 1);
      }

      // Create summary for response
      const updateSummary = Array.from(fileUpdateCounts.entries()).map(
        ([fileId, count]) => ({
          fileId,
          translationCount: count,
        })
      );

      return c.json({
        message: "File imported successfully",
        updates: translationsToUpdate.length,
        summary: {
          filesUpdated: fileUpdateCounts.size,
          totalTranslations: translationsToUpdate.length,
          details: updateSummary,
        },
      });
    } catch (error) {
      console.error("Error importing from Excel:", error);
      return c.json(
        {
          error: "Failed to import from Excel",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
