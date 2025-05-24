import { Hono } from "hono";
import { db } from "../../db";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import * as XLSX from "xlsx"; // SheetJS library for Excel file generation

export const exportFilesToExcel = new Hono().get(
  "/",
  requiresAdmin,
  async (c) => {
    try {
      // Get all available languages first using findMany
      const availableLanguages = await db.query.languages.findMany({
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
          // Access locale through the language relation
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
        id: "id", // Keep these column names consistent for import
        type: "type",
        name: "name",
      };

      // Add language-specific headers
      availableLanguages.forEach((lang) => {
        headers[`title_${lang.locale}`] = `title_${lang.locale}`;
        headers[`description_${lang.locale}`] = `description_${lang.locale}`;
      });

      // Rename keys in excelData to use the friendly headers
      const renamedData = excelData.map((row) => {
        const newRow: Record<string, any> = {};
        for (const key in row) {
          newRow[headers[key] || key] = row[key];
        }
        return newRow;
      });

      // Create a workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(renamedData, {
        header: Object.values(headers),
      });

      // Auto-size columns for better readability
      const colWidths = [];
      for (const key of Object.values(headers)) {
        let maxLength = key.length;
        for (const row of renamedData) {
          const cellValue = row[key]?.toString() || "";
          if (cellValue.length > maxLength) {
            maxLength = cellValue.length;
          }
        }
        colWidths.push({ wch: Math.min(maxLength + 2, 50) }); // Limit width to 50 chars
      }
      worksheet["!cols"] = colWidths; // Improve cell formatting
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cell_address];
          if (!cell) continue;

          // Set header row formatting
          if (R === 0) {
            cell.s = {
              font: { bold: true },
              fill: { fgColor: { rgb: "ECECEC" } },
            };
          }

          // Lock the id, type, and name columns (first 3 columns) by adding gray background
          if (C < 3 && R > 0) {
            cell.s = {
              fill: { fgColor: { rgb: "F2F2F2" } },
            };
          }
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "Files");

      // Generate Excel file properly with Office Open XML format
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        bookSST: true, // Use shared string table for better compatibility
        compression: true,
      });

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
      c.header("Content-Length", excelBuffer.length.toString());

      // Add cache control to prevent caching issues
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
      c.header("Pragma", "no-cache");
      c.header("Expires", "0");

      return c.body(excelBuffer);
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
