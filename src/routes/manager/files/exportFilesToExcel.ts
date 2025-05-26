import { Hono } from "hono";
import { db } from "../../../db";
import { requiresManager } from "../../../middleware/requiresManager";
import ExcelJS from "exceljs";

export const exportFilesToExcel = new Hono().get(
  "/",
  requiresManager,
  async (c) => {
    try {
      const currentUser = c.get("currentUser");
      if (!currentUser?.projectId) {
        return c.json({ error: "Project ID not found for current user" }, 400);
      }

      const projectId = Number(currentUser.projectId);
      // Get all available languages first using findMany
      const availableLanguages = await db.query.languages.findMany({
        where: (languages, { eq }) => eq(languages.projectId, projectId),
        orderBy: (languages, { asc }) => [asc(languages.locale)],
        columns: {
          id: true,
          locale: true,
        },
      });

      if (!availableLanguages.length) {
        return c.json({ error: "No languages found in the database" }, 404);
      }

      console.log(
        `Found ${availableLanguages.length} languages: ${availableLanguages
          .map((l) => l.locale)
          .join(", ")}`
      );

      // Get all files with their translations using relationships
      const filesWithTranslations = await db.query.files.findMany({
        where: (files, { eq }) => eq(files.projectId, projectId),
        columns: {
          id: true,
          type: true,
          name: true,
          path: true,
          thumbnailPath: true,
        },
        with: {
          translations: {
            columns: {
              id: true,
              title: true,
              description: true,
              languageId: true,
            },
            with: {
              language: {
                columns: {
                  locale: true,
                },
              },
            },
          },
        },
        orderBy: (files, { desc }) => [desc(files.createdAt)],
      });

      // Transform the data into a flat structure suitable for Excel
      const excelData = filesWithTranslations.map((file) => {
        const baseRecord: Record<string, any> = {
          id: file.id,
          type: file.type,
          name: file.name,
        };

        // Initialize translation fields with empty values for all languages
        availableLanguages.forEach((lang) => {
          baseRecord[`title_${lang.locale}`] = "";
          baseRecord[`description_${lang.locale}`] = "";
        });

        // Fill in the translations where they exist
        file.translations.forEach((translation) => {
          const locale = translation.language?.locale;
          if (locale) {
            if (translation.title) {
              baseRecord[`title_${locale}`] = translation.title;
            }
            if (translation.description) {
              baseRecord[`description_${locale}`] = translation.description;
            }
          }
        });

        return baseRecord;
      });

      // Create headers with more descriptive names for better readability
      const headers: Record<string, string> = {
        id: "id",
        type: "type",
        name: "name",
      };

      // Add language-specific headers
      availableLanguages.forEach((lang) => {
        headers[`title_${lang.locale}`] = `title_${lang.locale}`;
        headers[`description_${lang.locale}`] = `description_${lang.locale}`;
      });

      // Create a new workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Files");

      // Add headers
      const headerRow = worksheet.addRow(Object.values(headers));
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECECEC" },
      };

      // Add data rows
      excelData.forEach((row) => {
        const dataRow = worksheet.addRow(Object.values(row));

        // Lock the first three columns (ID, Type, Name)
        for (let i = 1; i <= 3; i++) {
          const cell = dataRow.getCell(i);
          if (cell) {
            cell.protection = { locked: true };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF2F2F2" },
            };
          }
        }

        // Explicitly unlock all other cells
        for (let i = 4; i <= Object.keys(headers).length; i++) {
          const cell = dataRow.getCell(i);
          if (cell) {
            cell.protection = { locked: false };
          }
        }
      });

      // Auto-size columns
      const columnCount = Object.keys(headers).length;
      for (let i = 1; i <= columnCount; i++) {
        const column = worksheet.getColumn(i);
        if (!column) continue;

        let maxLength = 0;
        // Get header length
        const headerCell = worksheet.getCell(1, i);
        if (headerCell && headerCell.value) {
          maxLength = String(headerCell.value).length;
        }

        // Get max length from data
        for (let row = 2; row <= excelData.length + 1; row++) {
          const cell = worksheet.getCell(row, i);
          if (cell && cell.value) {
            const value = String(cell.value);
            maxLength = Math.max(maxLength, value.length);
          }
        }

        column.width = Math.min(maxLength + 2, 50);
      }

      // Enable worksheet protection with specific permissions
      worksheet.protect("", {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
      });

      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();

      // Set headers for file download with proper encoding for all browsers
      const name = "files-export.xlsx";
      const encodedName = encodeURIComponent(name);

      c.header(
        "Content-Disposition",
        `attachment; name="${name}"; name*=UTF-8''${encodedName}`
      );
      c.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      c.header("Content-Length", Buffer.byteLength(buffer).toString());

      // Add cache control to prevent caching issues
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
      c.header("Pragma", "no-cache");
      c.header("Expires", "0");

      return c.body(buffer);
    } catch (error) {
      console.error("Error exporting files to Excel:", error);
      return c.json(
        {
          error: "Failed to export files to Excel",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);
