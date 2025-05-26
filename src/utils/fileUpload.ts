import { IncomingMessage } from "http";
import { FILE_LIMITS } from "./fileStorage";
import { optimizeImage } from "./imageOptimization";
import { storage, generateUniqueFilename } from "./fileStorage";

// Interface for uploaded file
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// Interface for parsed form data
export interface ParsedFormData {
  fields: Record<string, string>;
  files: UploadedFile[];
}

/**
 * Parses multipart form data from a buffer and content-type
 * @param buffer The request body as a buffer
 * @param contentType The content-type header
 * @returns ParsedFormData
 */
export function parseMultipartFormBuffer(
  buffer: Buffer,
  contentType: string
): ParsedFormData {
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  const boundary = getBoundary(contentType || "");

  if (!boundary) {
    throw new Error("No boundary found in content-type header");
  }

  const boundaryBuffer = Buffer.from(boundary);
  const parts = splitBuffer(buffer, boundaryBuffer);

  for (const part of parts) {
    if (part.length === 0) continue;

    // Find the double CRLF that separates headers from content
    const doubleCRLF = Buffer.from("\r\n\r\n");
    const headerEndIndex = part.indexOf(doubleCRLF);

    if (headerEndIndex === -1) continue;

    const headerBuffer = part.subarray(0, headerEndIndex);
    const contentBuffer = part.subarray(headerEndIndex + 4);

    // Remove trailing CRLF from content if present
    let finalContentBuffer = contentBuffer;
    if (
      contentBuffer.length >= 2 &&
      contentBuffer[contentBuffer.length - 2] === 0x0d &&
      contentBuffer[contentBuffer.length - 1] === 0x0a
    ) {
      finalContentBuffer = contentBuffer.subarray(0, contentBuffer.length - 2);
    }

    const headerStr = headerBuffer.toString("utf8");

    if (headerStr.includes('filename="')) {
      // This is a file
      const filename = headerStr.match(/filename="([^"]+)"/)?.[1];
      const fieldname = headerStr.match(/name="([^"]+)"/)?.[1];
      const mimetype = headerStr.match(/Content-Type: ([^\r\n]+)/)?.[1];

      if (!filename || !fieldname || !mimetype) {
        continue;
      }

      files.push({
        fieldname,
        originalname: filename,
        encoding: "7bit",
        mimetype: mimetype.trim(),
        buffer: finalContentBuffer,
        size: finalContentBuffer.length,
      });
    } else {
      // This is a field
      const fieldname = headerStr.match(/name="([^"]+)"/)?.[1];
      if (fieldname) {
        fields[fieldname] = finalContentBuffer.toString("utf8");
      }
    }
  }

  return { fields, files };
}

/**
 * Parses multipart form data from an incoming request (Node.js IncomingMessage)
 * @param req The incoming request
 * @returns Promise resolving to parsed form data
 */
export async function parseMultipartForm(
  req: IncomingMessage
): Promise<ParsedFormData> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers["content-type"] || "";
        resolve(parseMultipartFormBuffer(buffer, contentType as string));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Processes uploaded files, optimizing images and uploading to storage
 * @param files Array of uploaded files
 * @param projectId Project ID for file organization
 * @returns Promise resolving to array of processed file URLs
 */
export async function processUploadedFiles(
  files: UploadedFile[],
  projectId: number
): Promise<string[]> {
  const processedFiles: string[] = [];

  // Check batch size limits
  if (files.length > FILE_LIMITS.MAX_FILES_PER_BATCH) {
    throw new Error(
      `Number of files (${files.length}) exceeds maximum allowed (${FILE_LIMITS.MAX_FILES_PER_BATCH})`
    );
  }

  let totalSize = 0;
  for (const file of files) {
    totalSize += file.size;
    if (totalSize > FILE_LIMITS.MAX_TOTAL_SIZE) {
      throw new Error(
        `Total batch size (${totalSize} bytes) exceeds maximum allowed (${FILE_LIMITS.MAX_TOTAL_SIZE} bytes)`
      );
    }
  }

  for (const file of files) {
    try {
      // Validate file size
      if (file.size > FILE_LIMITS.MAX_FILE_SIZE) {
        throw new Error(
          `File ${file.originalname} exceeds maximum size of ${FILE_LIMITS.MAX_FILE_SIZE} bytes`
        );
      }

      // Validate file type
      if (file.mimetype.startsWith("image/")) {
        if (!FILE_LIMITS.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          throw new Error(`Unsupported image type: ${file.mimetype}`);
        }
      } else if (file.mimetype.startsWith("audio/")) {
        if (!FILE_LIMITS.ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
          throw new Error(
            `Only MP3 audio files are supported. Received: ${file.mimetype}`
          );
        }
      } else {
        throw new Error(`Unsupported file type: ${file.mimetype}`);
      }

      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(file.originalname);

      // Process file based on type
      let processedBuffer: Buffer;
      let contentType: string;

      if (file.mimetype.startsWith("image/")) {
        // Optimize image
        processedBuffer = await optimizeImage(file.buffer);
        contentType = file.mimetype;
      } else {
        // Use original buffer for audio files
        processedBuffer = file.buffer;
        contentType = file.mimetype;
      }

      // Upload to storage with proper folder structure
      const fileType = file.mimetype.startsWith("image/") ? "images" : "audio";
      const filePath = `project-${projectId}/${fileType}/${uniqueFilename}`;
      const url = await storage.saveFile(processedBuffer, filePath);

      processedFiles.push(url);
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      throw error;
    }
  }

  return processedFiles;
}

// Helper function to extract boundary from content-type header
function getBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=([^;]+)/);
  return match ? `--${match[1]}` : null;
}

// Helper function to split buffer by boundary
function splitBuffer(buffer: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  let index = 0;

  while (index < buffer.length) {
    const foundIndex = buffer.indexOf(boundary, index);
    if (foundIndex === -1) {
      // No more boundaries found
      if (start < buffer.length) {
        parts.push(buffer.subarray(start));
      }
      break;
    }

    if (foundIndex > start) {
      parts.push(buffer.subarray(start, foundIndex));
    }

    start = foundIndex + boundary.length;
    index = start;
  }

  return parts;
}
