import { Storage } from "@google-cloud/storage";
import { FILE_LIMITS } from "./fileStorage";

// Initialize Firebase Storage
const storage = new Storage();
const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || "");

// Function to upload a file to Firebase Storage
export async function uploadToFirebase(
  fileBuffer: Buffer,
  filePath: string,
  contentType: string
): Promise<string> {
  try {
    const file = bucket.file(filePath);

    // Upload the file
    await file.save(fileBuffer, {
      contentType,
      public: true,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000", // 1 year cache
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    // Return the public URL
    return `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filePath)}?alt=media`;
  } catch (error) {
    console.error("Error uploading to Firebase Storage:", error);
    throw new Error(
      `Failed to upload file to Firebase Storage: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Function to delete a file from Firebase Storage
export async function deleteFromFirebase(filePath: string): Promise<void> {
  try {
    const file = bucket.file(filePath);
    await file.delete();
  } catch (error) {
    console.error("Error deleting from Firebase Storage:", error);
    throw new Error(
      `Failed to delete file from Firebase Storage: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Function to get a file's public URL
export function getFirebaseFileUrl(filePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${
    bucket.name
  }/o/${encodeURIComponent(filePath)}?alt=media`;
}

// Function to check if a file exists in Firebase Storage
export async function fileExistsInFirebase(filePath: string): Promise<boolean> {
  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error("Error checking file existence in Firebase Storage:", error);
    return false;
  }
}

export { bucket };
