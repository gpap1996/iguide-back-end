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
