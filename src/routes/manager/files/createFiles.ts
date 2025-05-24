import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { files } from "@/db/schema/files";
import { requiresAdmin } from "@/middleware/requiresAdmin";
import { optimizeImage, generateThumbnail } from "@/utils/imageOptimization";

// Create multiple files endpoint
export const createFiles = new Hono().post("/", requiresAdmin, async (c) => {
  console.log("Mass upload endpoint hit");
  try {
    const body = await c.req.formData();
    const fileEntries = body.getAll("files");
    const type = body.get("type")?.toString();

    if (!fileEntries || fileEntries.length === 0) {
      return c.json({ error: "No files provided" }, 400);
    }

    if (!type) {
      return c.json({ error: "No type provided" }, 400);
    }

    // Validate file type
    if (type !== "image" && type !== "audio") {
      return c.json(
        { error: "Invalid file type. Only 'image' and 'audio' are allowed" },
        400
      );
    }

    const uploadDir = "./files";

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (const fileEntry of fileEntries) {
      if (!(fileEntry instanceof File)) {
        errors.push({
          name: "Unknown file",
          error: "Invalid file provided",
        });
        continue;
      }

      try {
        const originalName = fileEntry.name;
        const extension = path.extname(originalName);

        // Validate file extension based on type
        if (
          type === "image" &&
          !/\.(jpg|jpeg|png|webp|gif)$/i.test(originalName)
        ) {
          errors.push({
            name: originalName,
            error:
              "Invalid image file format. Allowed formats: jpg, jpeg, png, webp, gif",
          });
          continue;
        }

        if (type === "audio" && !/\.(mp3|wav|ogg|m4a)$/i.test(originalName)) {
          errors.push({
            name: originalName,
            error:
              "Invalid audio file format. Allowed formats: mp3, wav, ogg, m4a",
          });
          continue;
        }

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const generatedFileName = `${timestamp}-${randomString}${extension}`;

        const arrayBuffer = await fileEntry.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let finalBuffer = buffer;
        let thumbnailPath;

        // Process images
        if (type === "image") {
          finalBuffer = await optimizeImage(buffer);
          thumbnailPath = await generateThumbnail(buffer, originalName);
        }

        const filePath = path.join(uploadDir, generatedFileName);
        const url = `/files/${generatedFileName}`;

        // Write file to disk
        fs.writeFileSync(filePath, finalBuffer);

        // Save file to database
        const [savedFile] = await db
          .insert(files)
          .values({
            name: originalName,
            type: type,
            path: url,
            thumbnailPath: type === "image" ? thumbnailPath : undefined,
          })
          .returning();

        results.push(savedFile);
      } catch (error) {
        errors.push({
          name: fileEntry.name,
          error:
            error instanceof Error ? error.message : "Failed to process file",
        });
      }
    }

    return c.json({
      success: true,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      total: {
        processed: results.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    console.error("Error in mass file upload:", error);
    return c.json(
      {
        error: "Failed to process files",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
