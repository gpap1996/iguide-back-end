import { Hono } from "hono";
import fs from "fs";
import { requiresAdmin } from "../../middleware/requiresAdmin";
import path from "path";

export const createMedia = new Hono().post("/", requiresAdmin, async (c) => {
  const body = await c.req.formData();
  const files = body.getAll("files"); // Note: Changed from "file" to "files"

  if (!files || files.length === 0) {
    return c.json({ error: "No files provided" }, 400);
  }

  const uploadResults = [];
  const uploadDir = "./media";

  // Create media directory if it doesn't exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  for (const file of files) {
    if (!(file instanceof File)) {
      continue; // Skip invalid files
    }

    // Get file details
    const originalName = file.name;
    const extension = path.extname(originalName);
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileName = `${timestamp}-${randomString}${extension}`;

    // Convert file to ArrayBuffer and then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save the file
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    uploadResults.push({
      success: true,
      fileName,
      originalName,
      size: file.size,
      type: file.type,
      path: `/media/${fileName}`,
    });
  }

  return c.json({
    success: true,
    totalFiles: uploadResults.length,
    files: uploadResults,
  });
});
