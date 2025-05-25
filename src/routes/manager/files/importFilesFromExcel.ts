import { Hono } from "hono";
import { db } from "../../../db";
import { file_translations } from "../../../db/schema/file_translations";
import { files } from "../../../db/schema/files";
import { requiresManager } from "../../../middleware/requiresManager";
import * as XLSX from "xlsx";
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

      // Parse Excel file
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert worksheet to JSON
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (data.length === 0) {
        return c.json({ error: "Excel file is empty" }, 400);
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
      }); // Check for invalid columns in the spreadsheet
      // First row's keys represent all columns
      if (data.length > 0) {
        const allKeys = Object.keys(data[0]);

        // Check for columns that might be typos or mistakes
        const unexpectedColumns = allKeys.filter((key) => {
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
      }

      // Parse the translations to update
      const translationsToUpdate: TranslationUpdate[] = [];
      const errors: string[] = [];
      const fileIds = new Set<number>();

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNumber = i + 2; // +2 because Excel starts at 1 and first row is header

        // Extract fileId from ID column (handle both "id" and "ID (do not edit)" formats)
        const idField =
          row["id"] !== undefined
            ? row["id"]
            : row["ID (do not edit)"] !== undefined
            ? row["ID (do not edit)"]
            : null;

        if (idField === null) {
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

        // Process each language column (title and description)
        for (const lang of availableLanguages) {
          const titleKey = `title_${lang.locale}`;
          const descKey = `description_${lang.locale}`;

          // Check if there are any unrecognized title_* or description_* columns that might be typos
          for (const key of Object.keys(row)) {
            if (
              (key.startsWith("title_") || key.startsWith("description_")) &&
              !availableLanguages.some((l) => key.endsWith(l.locale))
            ) {
              errors.push(
                `Row ${rowNumber}: Column "${key}" contains an invalid locale format`
              );
            }
          }

          // Only add to updates if at least one field has valid content
          if (
            (titleKey in row || descKey in row) &&
            (row[titleKey] !== undefined || row[descKey] !== undefined)
          ) {
            translationsToUpdate.push({
              fileId,
              rowNumber,
              languageId: lang.id,
              title: row[titleKey] || null,
              description: row[descKey] || null,
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
                    projectId,
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
      } // Count updates by file ID for more detailed reporting
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
