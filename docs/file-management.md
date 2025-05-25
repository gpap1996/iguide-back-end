# File Management System Documentation

## Overview

The file management system is a robust solution for handling file uploads, storage, and retrieval in the application. It uses Firebase Storage as the primary storage backend and includes features for image optimization, thumbnail generation, and multi-language support.

## System Architecture

### 1. Storage Abstraction

The system uses a storage abstraction layer (`StorageProvider` interface) that allows for different storage backends:

- `FirebaseStorage`: Primary implementation using Firebase Storage

### 2. File Limits and Restrictions

```typescript
FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB per file
  MAX_TOTAL_SIZE: 100 * 1024 * 1024, // 100MB per batch
  MAX_FILES_PER_BATCH: 50, // Maximum files in one upload
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_AUDIO_TYPES: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/m4a"],
  MAX_IMAGE_DIMENSION: 4096, // 4K resolution
  THUMBNAIL_SIZE: 300, // 300px for thumbnails
};
```

## Core Features

### 1. File Upload

- **Single File Upload** (`/files` POST endpoint)

  - Handles one file at a time
  - Supports image optimization
  - Generates thumbnails for images
  - Stores translations metadata

- **Batch Upload** (`/files/mass-upload` POST endpoint)
  - Handles multiple files simultaneously
  - Uses concurrency limiting (1 file at a time)
  - Processes files in parallel with error handling
  - Supports both image and audio files

### 2. File Storage

- **Path Structure**: `project-{projectId}/file-{timestamp}-{originalName}`
- **Storage Features**:
  - Chunked uploads for large files (5MB chunks)
  - Automatic retry mechanism (3 attempts)
  - 30-second upload timeout
  - Public access with 1-year cache control
  - Content type validation

### 3. Image Processing

- **Optimization**:

  - Resizes images to fit within 1920x1080
  - Converts to WebP format
  - Preserves important metadata
  - Auto-rotates based on EXIF data

- **Thumbnails**:
  - 300x300px dimensions
  - Smart cropping
  - WebP format
  - Generated automatically for images

### 4. File Retrieval

- **List Files** (`/files` GET endpoint)

  - Pagination support
  - Search by title
  - Includes translations
  - Returns full URLs for files and thumbnails

- **Dropdown List** (`/files/dropdown` GET endpoint)
  - Simplified file list for dropdowns
  - Includes thumbnails
  - Returns full URLs

### 5. File Deletion

- **Single File** (`/files/:id` DELETE endpoint)

  - Deletes both file and thumbnail
  - Uses database transactions
  - Handles cleanup of physical files

- **Batch Delete** (`/files/delete` POST endpoint)
  - Deletes multiple files
  - Reports success/failure for each file
  - Maintains data consistency

## API Endpoints

### 1. File Upload

#### Single File Upload

```http
POST /files
Content-Type: multipart/form-data

Fields:
- file: The file to upload
- type: "image" or "audio"
- metadata: JSON string containing translations
```

#### Batch Upload

```http
POST /files/mass-upload
Content-Type: multipart/form-data

Fields:
- files: Multiple files
- type: "image" or "audio"
```

### 2. File Retrieval

#### List Files

```http
GET /files?page=1&limit=10&title=search_term
```

Response:

```json
{
  "files": [
    {
      "id": 1,
      "name": "example.jpg",
      "type": "image",
      "path": "project-123/file-1234567890-example.jpg",
      "url": "https://firebasestorage.googleapis.com/...",
      "thumbnailPath": "project-123/thumb-1234567890-example.jpg",
      "thumbnailUrl": "https://firebasestorage.googleapis.com/...",
      "translations": [
        {
          "id": 1,
          "title": "Example Image",
          "description": "Description",
          "language": {
            "locale": "en"
          }
        }
      ]
    }
  ],
  "pagination": {
    "limit": 10,
    "page": 1,
    "totalItems": 100,
    "currentPage": 1,
    "totalPages": 10
  }
}
```

#### Dropdown List

```http
GET /files/dropdown
```

Response:

```json
{
  "items": [
    {
      "id": 1,
      "name": "example.jpg",
      "path": "project-123/file-1234567890-example.jpg",
      "url": "https://firebasestorage.googleapis.com/...",
      "thumbnailPath": "project-123/thumb-1234567890-example.jpg",
      "thumbnailUrl": "https://firebasestorage.googleapis.com/..."
    }
  ]
}
```

### 3. File Deletion

#### Single File

```http
DELETE /files/:id
```

Response:

```json
{
  "success": true,
  "message": "File deleted successfully",
  "deletedId": 1
}
```

#### Batch Delete

```http
POST /files/delete
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

Response:

```json
{
  "success": true,
  "message": "2 files deleted successfully, 1 failed",
  "results": {
    "success": [1, 2],
    "failed": [
      {
        "id": 3,
        "error": "File not found"
      }
    ],
    "totalDeleted": 2,
    "totalFailed": 1
  }
}
```

## Error Handling

### Common Error Responses

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

### Status Codes

- 200: Success
- 400: Bad Request (invalid input)
- 401: Unauthorized
- 404: Not Found
- 500: Internal Server Error

## Security

### Firebase Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*|audio/.*');
      allow delete: if request.auth != null;
    }
  }
}
```

## Best Practices

1. **File Upload**

   - Always validate file size and type before upload
   - Use appropriate content types
   - Handle upload timeouts gracefully

2. **Image Processing**

   - Optimize images before storage
   - Generate thumbnails for better performance
   - Preserve important metadata

3. **File Management**

   - Use transactions for database operations
   - Clean up physical files after database operations
   - Handle errors gracefully

4. **Security**
   - Validate user permissions
   - Check project ownership
   - Use secure file paths

## Troubleshooting

### Common Issues

1. **Upload Failures**

   - Check file size limits
   - Verify content type
   - Check network connectivity
   - Verify Firebase Storage permissions

2. **Deletion Issues**

   - Verify file paths
   - Check Firebase Storage permissions
   - Ensure database consistency

3. **Image Processing**
   - Check image dimensions
   - Verify supported formats
   - Monitor memory usage

## Support

For issues or questions, please contact the development team or create an issue in the project repository.
