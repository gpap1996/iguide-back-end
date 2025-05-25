import { getStorage } from "firebase-admin/storage";
import { getApp } from "firebase-admin/app";
import { Readable } from "stream";
import path from "path";

// Initialize Firebase Storage with the existing Firebase app instance
const storage = getStorage(getApp());
const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
/**
 * Uploads a file to Firebase Storage from a stream
 * @param fileStream The readable stream of the file
 * @param filePath The path where the file will be saved in Firebase Storage
 * @param contentType The MIME type of the file
 */
export async function uploadStreamToFirebase(
  fileStream: Readable,
  filePath: string,
  contentType?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = bucket.file(filePath);
    console.log(`Starting Firebase stream upload for: ${filePath}`);

    // Add timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      reject(new Error(`Upload timed out after 30 seconds for ${filePath}`));
    }, 30000);

    const uploadStream = file.createWriteStream({
      metadata: {
        contentType,
      },
      resumable: false, // Better for smaller files
      public: true,
    });

    fileStream
      .pipe(uploadStream)
      .on("error", (error) => {
        clearTimeout(timeout); // Clear timeout on error
        console.error(`Upload stream error: ${error.message}`);
        reject(`Upload failed: ${error.message}`);
      })
      .on("finish", async () => {
        clearTimeout(timeout); // Clear timeout on success
        // Make the file publicly accessible
        try {
          await file.makePublic();

          // Get the public URL with correct Firebase Storage URL format
          const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
            bucket.name
          }/o/${encodeURIComponent(filePath)}?alt=media`;
          console.log(`Firebase Storage: File available at ${publicUrl}`);
          resolve(publicUrl);
        } catch (error) {
          console.error(`Error making file public: ${error.message}`);
          reject(error);
        }
      });

    // Handle errors on the source stream too
    fileStream.on("error", (error) => {
      clearTimeout(timeout); // Clear timeout on error
      console.error(`Source stream error: ${error.message}`);
      reject(`Source stream error: ${error.message}`);
    });
  });
}

/**
 * Uploads a buffer to Firebase Storage
 * @param buffer The buffer to upload
 * @param filePath The path where the file will be saved in Firebase Storage
 * @param contentType The MIME type of the file
 */
export async function uploadBufferToFirebase(
  buffer: Buffer,
  filePath: string,
  contentType?: string
): Promise<string> {
  console.log(
    `Starting direct buffer upload to Firebase for path: ${filePath}, size: ${buffer.length} bytes`
  );

  try {
    // Try direct file upload first (most reliable for smaller files)
    console.log(`Using direct buffer upload for: ${filePath}`);
    const file = bucket.file(filePath);

    await file.save(buffer, {
      contentType,
      resumable: false, // Non-resumable is more reliable for smaller files
      public: true,
    });

    await file.makePublic();

    // Return the correct Firebase URL format
    const url = `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filePath)}?alt=media`;

    console.log(`Direct buffer upload successful: ${url}`);
    return url;
  } catch (directError) {
    console.error(`Direct buffer upload failed: ${directError.message}`);

    // Fall back to streaming method as a backup
    try {
      console.log(`Falling back to stream-based upload for: ${filePath}`);
      const fileStream = Readable.from(buffer);
      return uploadStreamToFirebase(fileStream, filePath, contentType);
    } catch (streamError) {
      console.error(`Stream upload also failed: ${streamError.message}`);
      throw new Error(
        `Failed to upload file after multiple attempts: ${streamError.message}`
      );
    }
  }
}

/**
 * Deletes a file from Firebase Storage
 * @param filePath The path of the file in Firebase Storage
 */
export async function deleteFileFromFirebase(filePath: string): Promise<void> {
  await bucket
    .file(filePath)
    .delete()
    .catch((error) => {
      console.error(`Error deleting file from Firebase: ${error.message}`);
    });
}

/**
 * Builds a Firebase Storage path for a file
 * @param projectId The project ID
 * @param fileName The filename
 * @param type The type of file (e.g., 'images', 'thumbnails', 'audio')
 */
export function buildFirebasePath(
  projectId: number,
  fileName: string,
  type: string = "files"
): string {
  return `project-${projectId}/${type}/${fileName}`;
}
