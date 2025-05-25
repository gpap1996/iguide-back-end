// Streaming file upload handler utility
import { Context } from "hono";
import Busboy from "busboy";
import path from "path";
import { Readable } from "stream";
import { storage, generateUniqueFilename } from "./fileStorage";
import pLimit from "p-limit";

// Add debug logging
const DEBUG = true; // Set to false in production
function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[streamUpload]", ...args);
  }
}

// Interface for file metadata from form upload
export interface UploadedFile {
  fieldname: string;
  filename: string;
  mimetype: string;
  encoding: string;
  fileStream: NodeJS.ReadableStream;
  fileBuffer?: Buffer; // Only populated if buffering is requested
}

// Interface for field data from form upload
export interface FormField {
  fieldname: string;
  value: string;
}

// Results of processing file upload
export interface UploadResult {
  originalName: string;
  storagePath: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
}

// Options for handling concurrent uploads
export interface UploadOptions {
  maxConcurrency?: number;
  projectId: number;
  fileType?: string;
  processBuffered?: boolean; // Whether to buffer the files in memory
  maxFileSize?: number; // Maximum file size in bytes
  allowedMimeTypes?: string[]; // List of allowed MIME types
}

/**
 * Parse a multipart form submission with streaming file handling
 */
export function parseMultipartForm(
  c: Context,
  options: UploadOptions
): Promise<{
  files: UploadedFile[];
  fields: Record<string, string>;
}> {
  debug("Starting multipart form parsing");
  return new Promise((resolve, reject) => {
    const files: UploadedFile[] = [];
    const fields: Record<string, string> = {};
    let fileCount = 0;
    let filesProcessed = 0;
    const processedFiles = new Set<string>(); // Track processed files by ID

    debug("Initializing busboy with request headers");
    const busboy = Busboy({
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      limits: {
        fileSize: options.maxFileSize || 10 * 1024 * 1024,
        files: 10, // Limit number of files
      },
    });

    // Handle file fields
    busboy.on("file", (fieldname, fileStream, info) => {
      debug(`Found file in form: ${info.filename}, mimetype: ${info.mimeType}`);
      fileCount++;
      const { filename, encoding, mimeType } = info;
      const fileId = `${fieldname}-${Date.now()}-${fileCount}`;

      // Check if MIME type is allowed
      if (
        options.allowedMimeTypes &&
        options.allowedMimeTypes.length > 0 &&
        !options.allowedMimeTypes.includes(mimeType)
      ) {
        debug(`Skipping file with unsupported MIME type: ${mimeType}`);
        fileStream.resume();
        filesProcessed++;
        processedFiles.add(fileId);
        checkAllDone();
        return;
      }

      const file: UploadedFile = {
        fieldname,
        filename,
        mimetype: mimeType,
        encoding,
        fileStream,
      };

      // Set up data handling
      if (options.processBuffered) {
        const chunks: Buffer[] = [];
        let totalSize = 0;

        fileStream.on("data", (chunk) => {
          totalSize += chunk.length;
          if (totalSize > (options.maxFileSize || 10 * 1024 * 1024)) {
            fileStream.destroy(new Error("File size exceeds limit"));
            return;
          }
          chunks.push(chunk);
        });

        fileStream.on("end", () => {
          if (!processedFiles.has(fileId)) {
            debug(`Finished receiving file stream for ${filename}`);
            file.fileBuffer = Buffer.concat(chunks);
            debug(
              `Created buffer for ${filename}, total size: ${file.fileBuffer.length} bytes`
            );
            files.push(file);
            processedFiles.add(fileId);
            filesProcessed++;
            debug(`File processed: ${filesProcessed}/${fileCount}`);
            checkAllDone();
          }
        });
      } else {
        fileStream.on("end", () => {
          if (!processedFiles.has(fileId)) {
            debug(`Finished receiving file stream for ${filename}`);
            files.push(file);
            processedFiles.add(fileId);
            filesProcessed++;
            debug(`File processed: ${filesProcessed}/${fileCount}`);
            checkAllDone();
          }
        });
      }

      fileStream.on("error", (err) => {
        if (!processedFiles.has(fileId)) {
          console.error(
            `Error processing file stream for ${filename}: ${err.message}`
          );
          processedFiles.add(fileId);
          filesProcessed++;
          checkAllDone();
        }
      });

      fileStream.on("close", () => {
        debug(`File stream closed for ${filename}`);
        // Only increment if not already processed
        if (!processedFiles.has(fileId)) {
          processedFiles.add(fileId);
          filesProcessed++;
          debug(`File processed: ${filesProcessed}/${fileCount}`);
          checkAllDone();
        }
      });
    });

    // Flag to track if the busboy 'finish' event has fired
    let isFinished = false;

    // Function to check if all processing is complete
    const checkAllDone = () => {
      if (isFinished && filesProcessed === fileCount) {
        debug("All files processed, resolving promise");
        resolve({ files, fields });
      }
    };

    // Handle regular form fields
    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = value;
    });

    // Handle parsing completion
    busboy.on("finish", () => {
      debug("Busboy finished parsing");
      isFinished = true;
      if (filesProcessed === fileCount) {
        debug("All files processed, resolving promise");
        resolve({ files, fields });
      }
      if (fileCount === 0) {
        debug("No files to process, resolving promise");
        resolve({ files, fields });
      }
    });

    // Handle errors
    busboy.on("error", (error) => {
      console.error("Busboy error:", error);
      reject(error);
    });

    // Start parsing
    const startParsing = async () => {
      try {
        if (!c.req.raw.body) {
          reject(new Error("Request body is empty"));
          return;
        }

        if (typeof c.req.raw.body?.getReader === "function") {
          debug("Using ReadableStream approach");
          try {
            const stream = Readable.fromWeb(c.req.raw.body as any);
            stream.pipe(busboy);
            debug("Using Readable.fromWeb for request body streaming");
          } catch (webStreamError) {
            console.error(
              "Error with ReadableStream approach:",
              webStreamError
            );
            try {
              debug("Falling back to buffer-based approach");
              const arrayBuffer = await c.req.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              debug(`Received ${buffer.length} bytes of data`);
              busboy.write(buffer);
              busboy.end();
              debug("Busboy fed with buffer data");
            } catch (bufferError) {
              console.error("Error with buffer approach:", bufferError);
              reject(new Error("Failed to process request body"));
            }
          }
        } else if (typeof (c.req.raw.body as any).pipe === "function") {
          debug("Using direct Node.js stream approach");
          (c.req.raw.body as any).pipe(busboy);
        } else {
          debug("Request body is not a pipeable stream, trying text approach");
          try {
            const text = await c.req.text();
            busboy.write(Buffer.from(text));
            busboy.end();
          } catch (error) {
            console.error("Error reading request body as text:", error);
            reject(error);
          }
        }
      } catch (error) {
        console.error("Error setting up request stream:", error);
        reject(error);
      }
    };

    // Start the parsing process
    startParsing();
  });
}

/**
 * Process uploaded files with controlled concurrency
 */
export async function processUploadedFiles(
  files: UploadedFile[],
  options: UploadOptions,
  processor?: (file: UploadedFile) => Promise<any>
): Promise<UploadResult[]> {
  // Create a concurrency limiter with a reasonable limit
  const limit = pLimit(options.maxConcurrency || 2);

  // If no files to process, return empty array
  if (!files || files.length === 0) {
    return [];
  }

  debug(
    `Processing ${files.length} files with concurrency limit of ${
      options.maxConcurrency || 2
    }`
  );

  // Process files with limited concurrency and timeout
  const uploadPromises = files.map((file) =>
    limit(async () => {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Processing timed out for ${file.filename}`));
        }, 60000); // 60 second timeout per file
      });

      try {
        debug(`Starting to process file: ${file.filename}`);
        const originalName = file.filename;
        const extension = path.extname(originalName);
        const generatedFilename = generateUniqueFilename(originalName);
        const storagePath = `project-${options.projectId}/${generatedFilename}`;

        // Make sure we have either a buffer or a stream
        if (!file.fileBuffer && !file.fileStream) {
          throw new Error(`No data available for file ${originalName}`);
        }

        debug(`Preparing to upload ${originalName}`);

        // Create a readable stream from the fileBuffer if available, otherwise use the original fileStream
        let source: Buffer | NodeJS.ReadableStream;
        if (file.fileBuffer) {
          source = file.fileBuffer;
          debug(
            `Using buffer for ${originalName}, size: ${file.fileBuffer.length} bytes`
          );
        } else {
          source = file.fileStream;
          debug(`Using stream for ${originalName}`);
        }

        // Apply custom processing if provided (e.g., image optimization)
        if (processor) {
          debug(`Applying custom processor to ${originalName}`);
          await processor(file);
          debug(`Custom processing completed for ${originalName}`);
        }

        // Upload to storage and get URL
        debug(`Starting upload of ${originalName} to ${storagePath}`);
        const fileUrl = await storage.saveFile(source, storagePath);
        debug(`Upload completed for ${originalName}: ${fileUrl}`);

        const result = {
          originalName,
          storagePath,
          fileUrl,
          fileSize: file.fileBuffer?.length || 0,
          mimeType: file.mimetype,
        };
        debug(`Successfully processed ${originalName}`);
        return result;
      } catch (error) {
        debug(`Error processing file ${file.filename}:`, error);
        throw error;
      }
    })
  );

  try {
    debug("Waiting for all upload promises to complete");
    const results = await Promise.race([
      Promise.all(uploadPromises),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Overall processing timed out after 5 minutes"));
        }, 300000); // 5 minute overall timeout
      }),
    ]);
    debug("All uploads completed successfully");
    return results as UploadResult[];
  } catch (error) {
    debug("Error in upload process:", error);
    throw error;
  }
}
