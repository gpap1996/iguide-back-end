# Multi-Tenant Firebase Implementation Guide

## Complete Implementation Plan for Travel Guide Backend

### Table of Contents

1. [Current vs. Planned Architecture](#architecture)
2. [Step-by-Step Implementation](#implementation)
3. [Database Schema](#database)
4. [Firebase Manager Service](#firebase-manager)
5. [Authentication Updates](#authentication)
6. [File Upload Updates](#file-upload)
7. [Notification Service](#notifications)
8. [Migration Strategy](#migration)
9. [Testing Strategy](#testing)
10. [Timeline](#timeline)

---

## 📊 Current vs. Planned Architecture {#architecture}

### **Current Architecture (Single Firebase Project)**

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Backend                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Single Firebase Project                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │    Auth     │  │   Storage   │  │     FCM     │ │   │
│  │  │             │  │             │  │             │ │   │
│  │  │ - Admins    │  │ One Bucket  │  │ All Users   │ │   │
│  │  │ - Managers  │  │ All Files   │  │ All Apps    │ │   │
│  │  │ - Users     │  │             │  │             │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   All Travel    │
                    │   Apps Share    │
                    │   Same Project  │
                    └─────────────────┘
```

### **Planned Architecture (Multi-Tenant)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Your Backend                                   │
│                         (Firebase Manager)                                 │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   Dashboard     │  │   Athens App    │  │   Paris App     │            │
│  │   Firebase      │  │   Firebase      │  │   Firebase      │            │
│  │                 │  │                 │  │                 │            │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │            │
│  │ │    Auth     │ │  │ │    Auth     │ │  │ │    Auth     │ │            │
│  │ │ - Admins    │ │  │ │ - App Users │ │  │ │ - App Users │ │            │
│  │ │ - Managers  │ │  │ └─────────────┘ │  │ └─────────────┘ │            │
│  │ └─────────────┘ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │            │
│  │ ┌─────────────┐ │  │ │   Storage   │ │  │ │   Storage   │ │            │
│  │ │   Storage   │ │  │ │ Athens Files│ │  │ │ Paris Files │ │            │
│  │ │ Admin Files │ │  │ └─────────────┘ │  │ └─────────────┘ │            │
│  │ └─────────────┘ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │            │
│  └─────────────────┘  │ │     FCM     │ │  │ │     FCM     │ │            │
│                       │ │ Athens Users│ │  │ │ Paris Users │ │            │
│                       │ └─────────────┘ │  │ └─────────────┘ │            │
│                       └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────────┐
                        │    Each Travel App Gets     │
                        │    Its Own Firebase         │
                        │    Project & Resources      │
                        └─────────────────────────────┘
```

---

## 🚀 Step-by-Step Implementation Plan {#implementation}

### **Phase 1: Database Schema Setup** {#database}

#### Step 1.1: Create Firebase Projects Table

```sql
-- Migration: Create firebase_projects table
CREATE TABLE firebase_projects (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(50) UNIQUE NOT NULL,           -- "athens", "paris", "dashboard"
  project_id VARCHAR(100) NOT NULL,             -- "travel-guide-athens"
  private_key TEXT NOT NULL,                    -- Firebase admin private key
  client_email VARCHAR(255) NOT NULL,           -- Firebase service account email
  storage_bucket VARCHAR(255) NOT NULL,         -- "travel-guide-athens.appspot.com"
  fcm_server_key VARCHAR(500),                  -- FCM server key (optional)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dashboard project (your current Firebase project)
INSERT INTO firebase_projects (app_id, project_id, private_key, client_email, storage_bucket)
VALUES (
  'dashboard',
  'your-current-project-id',
  'your-current-private-key',
  'your-current-client-email',
  'your-current-storage-bucket'
);
```

#### Step 1.2: Create FCM Tokens Table

```sql
-- Migration: Create user FCM tokens table
CREATE TABLE user_fcm_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  app_id VARCHAR(50) NOT NULL,
  fcm_token VARCHAR(500) NOT NULL,
  device_type VARCHAR(20), -- "android", "ios", "web"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES firebase_projects(app_id) ON DELETE CASCADE,
  UNIQUE(user_id, app_id, fcm_token)
);
```

### **Phase 2: Firebase Manager Service** {#firebase-manager}

#### Step 2.1: Create Firebase Manager

```typescript
// src/services/FirebaseManager.ts
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "../db";
import { firebase_projects } from "../db/schema/firebase_projects";
import { eq } from "drizzle-orm";

interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  storageBucket: string;
}

class FirebaseManager {
  private configCache: Map<string, FirebaseConfig> = new Map();
  private appCache: Map<string, App> = new Map();

  // Get Firebase config from database with caching
  async getFirebaseConfig(appId: string): Promise<FirebaseConfig> {
    // Check cache first
    if (this.configCache.has(appId)) {
      return this.configCache.get(appId)!;
    }

    // Fetch from database
    const [project] = await db
      .select()
      .from(firebase_projects)
      .where(eq(firebase_projects.app_id, appId));

    if (!project) {
      throw new Error(`Firebase project not found for app: ${appId}`);
    }

    const config: FirebaseConfig = {
      projectId: project.project_id,
      privateKey: project.private_key,
      clientEmail: project.client_email,
      storageBucket: project.storage_bucket,
    };

    // Cache the config
    this.configCache.set(appId, config);
    return config;
  }

  // Get or initialize Firebase app
  async getApp(appId: string): Promise<App> {
    // Check if app already exists
    const existingApp = getApps().find((app) => app.name === appId);
    if (existingApp) {
      return existingApp;
    }

    // Get config and initialize new app
    const config = await this.getFirebaseConfig(appId);

    const app = initializeApp(
      {
        credential: cert({
          projectId: config.projectId,
          privateKey: config.privateKey.replace(/\\n/g, "\n"),
          clientEmail: config.clientEmail,
        }),
        storageBucket: config.storageBucket,
      },
      appId
    );

    this.appCache.set(appId, app);
    console.log(`✅ Initialized Firebase app: ${appId} (${config.projectId})`);
    return app;
  }

  // Get Firebase Auth for specific app
  async getAuth(appId: string) {
    const app = await this.getApp(appId);
    return getAuth(app);
  }

  // Get Firebase Storage for specific app
  async getStorage(appId: string) {
    const app = await this.getApp(appId);
    return getStorage(app);
  }

  // Get Firebase Messaging for specific app
  async getMessaging(appId: string) {
    const app = await this.getApp(appId);
    return getMessaging(app);
  }

  // Get storage bucket for specific app
  async getBucket(appId: string) {
    const storage = await this.getStorage(appId);
    return storage.bucket();
  }

  // List all initialized apps
  listApps(): string[] {
    return getApps().map((app) => app.name || "default");
  }

  // Clear cache (useful for testing or config updates)
  clearCache() {
    this.configCache.clear();
    this.appCache.clear();
  }
}

export const firebaseManager = new FirebaseManager();
```

#### Step 2.2: Create Database Schema Files

```typescript
// src/db/schema/firebase_projects.ts
import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const firebase_projects = pgTable("firebase_projects", {
  id: serial("id").primaryKey(),
  app_id: varchar("app_id", { length: 50 }).unique().notNull(),
  project_id: varchar("project_id", { length: 100 }).notNull(),
  private_key: text("private_key").notNull(),
  client_email: varchar("client_email", { length: 255 }).notNull(),
  storage_bucket: varchar("storage_bucket", { length: 255 }).notNull(),
  fcm_server_key: varchar("fcm_server_key", { length: 500 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// src/db/schema/user_fcm_tokens.ts
import {
  pgTable,
  serial,
  varchar,
  timestamp,
  foreignKey,
} from "drizzle-orm/pg-core";
import { firebase_projects } from "./firebase_projects";

export const user_fcm_tokens = pgTable(
  "user_fcm_tokens",
  {
    id: serial("id").primaryKey(),
    user_id: varchar("user_id", { length: 255 }).notNull(),
    app_id: varchar("app_id", { length: 50 }).notNull(),
    fcm_token: varchar("fcm_token", { length: 500 }).notNull(),
    device_type: varchar("device_type", { length: 20 }),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    appIdFk: foreignKey({
      columns: [table.app_id],
      foreignColumns: [firebase_projects.app_id],
    }),
  })
);
```

### **Phase 3: Update Middleware for Multi-Tenant Auth** {#authentication}

#### Step 3.1: Enhanced Authentication Middleware

```typescript
// src/middleware/requiresManagerMultiTenant.ts
import { createMiddleware } from "hono/factory";
import { firebaseManager } from "../services/FirebaseManager";
import { HTTPException } from "hono/http-exception";

declare module "hono" {
  interface ContextVariableMap {
    currentUser: {
      user_id: string;
      email: string;
      projectId?: number;
      appId?: string;
    };
  }
}

export const requiresManagerMultiTenant = createMiddleware(async (c, next) => {
  try {
    const jwt = c.req.header("Authorization")?.split(" ")[1];
    const appId = c.req.header("X-App-ID"); // Travel app identifier

    if (!jwt) {
      throw new HTTPException(401, {
        message: "No authorization token provided",
      });
    }

    if (!appId) {
      throw new HTTPException(400, { message: "X-App-ID header is required" });
    }

    // Get Firebase Auth for the specific app
    const auth = await firebaseManager.getAuth(appId);
    const decoded = await auth.verifyIdToken(jwt);

    if (decoded.role !== "manager") {
      throw new HTTPException(401, {
        message: "Unauthorized - Manager role required",
      });
    }

    c.set("currentUser", {
      user_id: decoded.uid,
      email: decoded.email!,
      projectId: decoded.projectId!,
      appId: appId,
    });

    await next();
  } catch (e) {
    console.error("Authentication error:", e);
    throw new HTTPException(401, { message: "Unauthorized" });
  }
});

// Keep existing middleware for dashboard
// src/middleware/requiresManager.ts (unchanged for backward compatibility)
```

### **Phase 4: Update File Upload Routes** {#file-upload}

#### Step 4.1: Multi-Tenant File Upload

```typescript
// src/routes/manager/files/createFileMultiTenant.ts
import { Hono } from "hono";
import { requiresManagerMultiTenant } from "../../../middleware/requiresManagerMultiTenant";
import { firebaseManager } from "../../../services/FirebaseManager";
import { db } from "../../../db";
import { files } from "../../../db/schema/files";
import { file_translations } from "../../../db/schema/file_translations";
import { languages } from "../../../db/schema/languages";
import { and, eq } from "drizzle-orm";
import {
  optimizeImage,
  generateThumbnailMultiTenant,
  IMAGE_CONFIG,
} from "../../../utils/imageOptimization";
import { FILE_LIMITS } from "../../../utils/fileStorage";

export const createFileMultiTenant = new Hono().post(
  "/",
  requiresManagerMultiTenant,
  async (c) => {
    const currentUser = c.get("currentUser");
    const { projectId, appId } = currentUser;

    if (!projectId || !appId) {
      return c.json(
        {
          error: "Missing project ID or app ID",
          details: "Please contact support if this issue persists.",
        },
        400
      );
    }

    try {
      const formData = await c.req.formData();
      const uploadedFile = formData.get("file") as File | null;
      const type = formData.get("type") as string | null;
      const metadataStr = formData.get("metadata") as string | null;

      // ... validation logic (same as current) ...

      // Convert File to buffer
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const originalName = uploadedFile.name;
      const isImage = IMAGE_CONFIG.acceptedMimeTypes.includes(
        uploadedFile.type
      );

      let fileUrl: string;
      let thumbnailUrl: string | undefined;

      try {
        console.log(
          `🚀 Starting file processing for ${originalName} in app: ${appId}`
        );
        const timestamp = Date.now();

        // Get app-specific storage bucket
        const bucket = await firebaseManager.getBucket(appId);

        if (isImage) {
          const optimizedBuffer = await optimizeImage(buffer);
          const storagePath = `project-${projectId}/images/${timestamp}-${originalName}`;

          console.log(
            `📤 Uploading optimized image to ${appId}:${storagePath}`
          );

          // Upload to app-specific bucket
          const file = bucket.file(storagePath);
          await file.save(optimizedBuffer, {
            contentType: uploadedFile.type,
            public: true,
            metadata: {
              cacheControl: "public, max-age=31536000",
            },
          });
          await file.makePublic();

          // Generate file URL for the specific app's bucket
          fileUrl = `https://firebasestorage.googleapis.com/v0/b/${
            bucket.name
          }/o/${encodeURIComponent(storagePath)}?alt=media`;

          console.log(`✅ Image uploaded successfully to ${appId}: ${fileUrl}`);

          try {
            console.log("🖼️ Generating thumbnail");
            thumbnailUrl = await generateThumbnailMultiTenant(
              buffer,
              originalName,
              projectId,
              timestamp,
              appId
            );
            console.log(`✅ Thumbnail generated: ${thumbnailUrl}`);
          } catch (thumbnailError) {
            console.error("❌ Thumbnail generation failed:", thumbnailError);
          }
        } else {
          // Audio file processing
          console.log("🎵 Processing audio file");
          const storagePath = `project-${projectId}/audio/${timestamp}-${originalName}`;

          const file = bucket.file(storagePath);
          await file.save(buffer, {
            contentType: uploadedFile.type,
            public: true,
          });
          await file.makePublic();

          fileUrl = `https://firebasestorage.googleapis.com/v0/b/${
            bucket.name
          }/o/${encodeURIComponent(storagePath)}?alt=media`;
          console.log(
            `✅ Audio file uploaded successfully to ${appId}: ${fileUrl}`
          );
        }

        // Database transaction (same as current implementation)
        console.log("💾 Starting database transaction");
        const result = await db.transaction(async (trx) => {
          const [savedFile] = await trx
            .insert(files)
            .values({
              projectId,
              name: originalName,
              type: type,
              path: fileUrl,
              thumbnailPath: isImage ? thumbnailUrl : undefined,
            })
            .returning();

          if (!savedFile) {
            throw new Error("Failed to save file");
          }

          // Handle translations (same logic as current)
          if (metadata.translations) {
            // ... translation processing logic ...
          }

          return savedFile;
        });

        console.log(`✅ File processing completed for app ${appId}`);
        return c.json({ file: result }, 201);
      } catch (error) {
        console.error(`❌ File processing failed for app ${appId}:`, error);
        throw error;
      }
    } catch (e) {
      console.error("Error creating file:", e);
      return c.json(
        {
          error: "Failed to create file",
          message: e instanceof Error ? e.message : String(e),
        },
        500
      );
    }
  }
);
```

### **Phase 5: Update Image Optimization for Multi-Tenant**

#### Step 5.1: Multi-Tenant Thumbnail Generation

```typescript
// src/utils/imageOptimizationMultiTenant.ts
import sharp from "sharp";
import { firebaseManager } from "../services/FirebaseManager";

export async function generateThumbnailMultiTenant(
  imageBuffer: Buffer,
  originalName: string,
  projectId: number,
  timestamp: number,
  appId: string
): Promise<string> {
  try {
    // Generate thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Get app-specific bucket
    const bucket = await firebaseManager.getBucket(appId);

    const baseName = originalName.split(".")[0];
    const extension = ".jpg"; // Always save thumbnails as JPEG
    const thumbnailPath = `project-${projectId}/images/thumbnails/thumb_${timestamp}_${baseName}${extension}`;

    console.log(`📤 Uploading thumbnail to ${appId}:${thumbnailPath}`);

    // Upload thumbnail to app-specific bucket
    const thumbnailFile = bucket.file(thumbnailPath);
    await thumbnailFile.save(thumbnailBuffer, {
      contentType: "image/jpeg",
      public: true,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
    await thumbnailFile.makePublic();

    // Return app-specific thumbnail URL
    const thumbnailUrl = `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(thumbnailPath)}?alt=media`;

    console.log(`✅ Thumbnail uploaded to ${appId}: ${thumbnailUrl}`);
    return thumbnailUrl;
  } catch (error) {
    console.error(`❌ Thumbnail generation failed for app ${appId}:`, error);
    throw new Error(
      `Failed to generate thumbnail: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
```

### **Phase 6: Push Notifications Service** {#notifications}

#### Step 6.1: Multi-Tenant Notification Service

```typescript
// src/services/NotificationService.ts
import { firebaseManager } from "./FirebaseManager";
import { db } from "../db";
import { user_fcm_tokens } from "../db/schema/user_fcm_tokens";
import { eq, and } from "drizzle-orm";

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

class NotificationService {
  // Send notification to specific user in specific app
  async sendToUser(
    appId: string,
    userId: string,
    payload: NotificationPayload
  ) {
    try {
      // Get user's FCM tokens for this app
      const tokens = await db
        .select()
        .from(user_fcm_tokens)
        .where(
          and(
            eq(user_fcm_tokens.app_id, appId),
            eq(user_fcm_tokens.user_id, userId)
          )
        );

      if (tokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId} in app ${appId}`);
        return { success: 0, failure: 0 };
      }

      // Get Firebase Messaging for this app
      const messaging = await firebaseManager.getMessaging(appId);

      // Send to all user's devices
      const results = await Promise.allSettled(
        tokens.map((tokenRecord) =>
          messaging.send({
            token: tokenRecord.fcm_token,
            notification: {
              title: payload.title,
              body: payload.body,
              imageUrl: payload.imageUrl,
            },
            data: payload.data,
          })
        )
      );

      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      console.log(
        `📱 Sent notification to ${userId} in ${appId}: ${successful} success, ${failed} failed`
      );

      return { success: successful, failure: failed };
    } catch (error) {
      console.error(
        `❌ Failed to send notification to ${userId} in ${appId}:`,
        error
      );
      throw error;
    }
  }

  // Send notification to all users of an app
  async sendToApp(appId: string, payload: NotificationPayload) {
    try {
      // Get all FCM tokens for this app
      const tokens = await db
        .select()
        .from(user_fcm_tokens)
        .where(eq(user_fcm_tokens.app_id, appId));

      if (tokens.length === 0) {
        console.log(`No FCM tokens found for app ${appId}`);
        return { success: 0, failure: 0 };
      }

      // Get Firebase Messaging for this app
      const messaging = await firebaseManager.getMessaging(appId);

      // Send to all app users (in batches of 500 - FCM limit)
      const batchSize = 500;
      let totalSuccess = 0;
      let totalFailure = 0;

      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        const tokenStrings = batch.map((t) => t.fcm_token);

        try {
          const response = await messaging.sendEachForMulticast({
            tokens: tokenStrings,
            notification: {
              title: payload.title,
              body: payload.body,
              imageUrl: payload.imageUrl,
            },
            data: payload.data,
          });

          totalSuccess += response.successCount;
          totalFailure += response.failureCount;
        } catch (batchError) {
          console.error(
            `❌ Batch notification failed for ${appId}:`,
            batchError
          );
          totalFailure += batch.length;
        }
      }

      console.log(
        `📱 Sent app-wide notification to ${appId}: ${totalSuccess} success, ${totalFailure} failed`
      );

      return { success: totalSuccess, failure: totalFailure };
    } catch (error) {
      console.error(
        `❌ Failed to send app-wide notification to ${appId}:`,
        error
      );
      throw error;
    }
  }

  // Register FCM token for user
  async registerToken(
    appId: string,
    userId: string,
    fcmToken: string,
    deviceType?: string
  ) {
    try {
      await db
        .insert(user_fcm_tokens)
        .values({
          app_id: appId,
          user_id: userId,
          fcm_token: fcmToken,
          device_type: deviceType,
        })
        .onConflictDoUpdate({
          target: [
            user_fcm_tokens.user_id,
            user_fcm_tokens.app_id,
            user_fcm_tokens.fcm_token,
          ],
          set: {
            updated_at: new Date(),
            device_type: deviceType,
          },
        });

      console.log(`✅ Registered FCM token for ${userId} in ${appId}`);
    } catch (error) {
      console.error(
        `❌ Failed to register FCM token for ${userId} in ${appId}:`,
        error
      );
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
```

### **Phase 7: API Routes for Notifications**

#### Step 7.1: Notification Routes

```typescript
// src/routes/manager/notifications/sendNotification.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requiresManagerMultiTenant } from "../../../middleware/requiresManagerMultiTenant";
import { notificationService } from "../../../services/NotificationService";

const notificationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  data: z.record(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  targetType: z.enum(["user", "app"]),
  targetUserId: z.string().optional(),
});

export const sendNotification = new Hono().post(
  "/",
  requiresManagerMultiTenant,
  zValidator("json", notificationSchema),
  async (c) => {
    const currentUser = c.get("currentUser");
    const { appId } = currentUser;
    const payload = c.req.valid("json");

    try {
      let result;

      if (payload.targetType === "user") {
        if (!payload.targetUserId) {
          return c.json(
            {
              error: "Target user ID is required for user notifications",
            },
            400
          );
        }

        result = await notificationService.sendToUser(
          appId!,
          payload.targetUserId,
          {
            title: payload.title,
            body: payload.body,
            data: payload.data,
            imageUrl: payload.imageUrl,
          }
        );
      } else {
        result = await notificationService.sendToApp(appId!, {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          imageUrl: payload.imageUrl,
        });
      }

      return c.json({
        message: "Notification sent successfully",
        result,
      });
    } catch (error) {
      console.error("Error sending notification:", error);
      return c.json(
        {
          error: "Failed to send notification",
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
);
```

### **Phase 8: Migration Strategy** {#migration}

#### Step 8.1: Backward Compatibility

```typescript
// src/routes/manager/files/index.ts
import { Hono } from "hono";
import { createFile } from "./createFile"; // Original implementation
import { createFileMultiTenant } from "./createFileMultiTenant"; // New implementation

const fileRoutes = new Hono();

// Route decision based on header presence
fileRoutes.use("/*", async (c, next) => {
  const appId = c.req.header("X-App-ID");

  if (appId && appId !== "dashboard") {
    // Use multi-tenant routes for travel apps
    c.set("useMultiTenant", true);
  } else {
    // Use original routes for dashboard/legacy
    c.set("useMultiTenant", false);
  }

  await next();
});

// Conditional routing
fileRoutes.post("/", async (c) => {
  const useMultiTenant = c.get("useMultiTenant");

  if (useMultiTenant) {
    return createFileMultiTenant.fetch(c.req);
  } else {
    return createFile.fetch(c.req);
  }
});

export { fileRoutes };
```

### **Phase 9: Environment Configuration**

#### Step 9.1: Environment Variables

```bash
# .env - Dashboard Firebase (existing)
FIREBASE_ADMIN_PROJECT_ID=your-dashboard-project
FIREBASE_ADMIN_PRIVATE_KEY=your-dashboard-private-key
FIREBASE_ADMIN_CLIENT_EMAIL=your-dashboard-client-email
FIREBASE_STORAGE_BUCKET=your-dashboard-bucket

# Database connection (existing)
DATABASE_URL=your-database-url

# New travel app Firebase projects will be stored in database
# No need for additional environment variables
```

### **Phase 10: Testing Strategy** {#testing}

#### Step 10.1: Test Setup

```typescript
// tests/firebase-manager.test.ts
import { firebaseManager } from "../src/services/FirebaseManager";
import { db } from "../src/db";
import { firebase_projects } from "../src/db/schema/firebase_projects";

describe("FirebaseManager", () => {
  beforeAll(async () => {
    // Insert test Firebase project
    await db.insert(firebase_projects).values({
      app_id: "test-app",
      project_id: "test-project-id",
      private_key: "test-private-key",
      client_email: "test@test.com",
      storage_bucket: "test-bucket",
    });
  });

  test("should initialize Firebase app for test app", async () => {
    const app = await firebaseManager.getApp("test-app");
    expect(app.name).toBe("test-app");
  });

  test("should get storage for test app", async () => {
    const storage = await firebaseManager.getStorage("test-app");
    expect(storage).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup
    firebaseManager.clearCache();
  });
});
```

---

## 🔄 Migration Timeline {#timeline}

### **Week 1: Database & Core Services**

- [ ] Create database migrations
- [ ] Implement FirebaseManager service
- [ ] Add database schema files
- [ ] Insert dashboard project into firebase_projects table

### **Week 2: Authentication & Middleware**

- [ ] Create multi-tenant authentication middleware
- [ ] Update existing middleware for backward compatibility
- [ ] Test authentication with multiple apps

### **Week 3: File Upload & Storage**

- [ ] Implement multi-tenant file upload
- [ ] Update image optimization for multi-tenant
- [ ] Test file uploads to different Firebase projects

### **Week 4: Notifications & Testing**

- [ ] Implement notification service
- [ ] Create notification API routes
- [ ] Comprehensive testing
- [ ] Documentation updates

### **Week 5: Production Deployment**

- [ ] Deploy database migrations
- [ ] Deploy new code with feature flags
- [ ] Monitor and validate functionality
- [ ] Gradual rollout to travel apps

---

## 🎯 Key Benefits After Implementation

1. **🏠 Isolated Resources**: Each travel app has its own Firebase project
2. **🔒 Enhanced Security**: Complete separation of user data and authentication
3. **📊 Independent Analytics**: Each app can have its own Firebase Analytics
4. **💰 Separate Billing**: Each client can have their own Firebase billing
5. **🚀 Scalability**: Easy to add new travel apps without affecting existing ones
6. **🛡️ Risk Mitigation**: Issues in one app don't affect others
7. **📱 Targeted Notifications**: App-specific push notifications
8. **🔧 Easier Maintenance**: Clear separation of concerns

---

## 📝 Implementation Notes

### **Current Implementation Analysis**

Your current setup uses:

- Single Firebase project for all functionality
- Global Firebase admin initialization in `firebaseAdmin.ts`
- Single authentication middleware for all users
- Shared storage bucket for all files
- Mixed user roles (admin, manager, guest) in one project

### **Key Changes Required**

1. **Database**: Add tables for Firebase project configs and FCM tokens
2. **Firebase Manager**: Service to handle multiple Firebase app instances
3. **Authentication**: Multi-tenant middleware with app-specific auth
4. **File Storage**: Route uploads to app-specific buckets
5. **Notifications**: App-specific FCM messaging
6. **Backward Compatibility**: Keep existing dashboard functionality

### **Migration Approach**

- **Phase-by-phase implementation** to minimize disruption
- **Backward compatibility** maintained for dashboard
- **Feature flags** for gradual rollout
- **Comprehensive testing** at each phase
- **Database migrations** with rollback capability

This implementation provides a robust, scalable multi-tenant architecture while maintaining backward compatibility with your existing dashboard functionality.

---

## 🚨 Important Considerations

### **Security**

- Store Firebase private keys securely in database
- Use environment variables for sensitive dashboard credentials
- Implement proper access controls for Firebase project management
- Regular security audits of multi-tenant access patterns

### **Performance**

- Cache Firebase configurations to avoid database hits
- Monitor Firebase app initialization overhead
- Implement connection pooling for database access
- Use CDN for static file delivery

### **Monitoring**

- Log all Firebase operations with app context
- Monitor storage usage per app
- Track notification delivery rates per app
- Set up alerts for authentication failures

### **Backup & Recovery**

- Regular backups of Firebase project configurations
- Document recovery procedures for each app
- Test disaster recovery scenarios
- Maintain rollback procedures for each deployment phase

---

_This document serves as the complete implementation guide for transitioning from single-tenant to multi-tenant Firebase architecture. Follow the phases sequentially and test thoroughly at each step._
