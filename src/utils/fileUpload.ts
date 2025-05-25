// This file is now deprecated, as we've moved to the streamUpload.ts implementation
// for better memory efficiency.
// Keeping this file as a reference until all code is migrated to streamUpload.ts
//
// IMPORTANT: DO NOT USE THIS FILE FOR NEW IMPLEMENTATIONS - USE streamUpload.ts INSTEAD

// Re-export from streamUpload for backwards compatibility
import {
  parseMultipartForm,
  UploadedFile,
  UploadResult,
  UploadOptions,
} from "./streamUpload";

export { parseMultipartForm, UploadedFile, UploadResult, UploadOptions };

// Legacy interface definitions kept for backwards compatibility
export interface FileMetadata {
  name: string;
  type: string;
  size: number;
  mimeType: string;
}

export interface OldUploadResult {
  success: boolean;
  path?: string;
  thumbnailPath?: string;
  error?: string;
  originalName: string;
  generatedName: string;
  fileMetadata: FileMetadata;
}

// TODO: Remove this file once all code has been migrated to streamUpload.ts        // Deprecated implementation removed
// Use streamUpload.ts instead for all file upload operations
