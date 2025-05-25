// Firebase Admin initialization for central access to Firebase services
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

// Check that required environment variables are present
if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
  console.error(
    "ERROR: FIREBASE_ADMIN_PROJECT_ID environment variable is missing"
  );
}

if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  console.error(
    "ERROR: FIREBASE_ADMIN_PRIVATE_KEY environment variable is missing"
  );
}

if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
  console.error(
    "ERROR: FIREBASE_ADMIN_CLIENT_EMAIL environment variable is missing"
  );
}

if (!process.env.FIREBASE_STORAGE_BUCKET) {
  console.error(
    "ERROR: FIREBASE_STORAGE_BUCKET environment variable is missing"
  );
}

// Initialize the Firebase Admin app if it hasn't been initialized yet
let app: App;
if (!getApps().length) {
  try {
    // Format the private key properly
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    console.log("Firebase Admin initialized successfully");
    console.log("Storage bucket:", process.env.FIREBASE_STORAGE_BUCKET);
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
    throw error;
  }
} else {
  app = getApps()[0];
}

// Export Firebase services
export const auth = getAuth(app);
export const storage = getStorage(app);

// Get bucket reference with explicit name
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  throw new Error("FIREBASE_STORAGE_BUCKET environment variable is not set");
}

export const bucket = storage.bucket(bucketName);

// Enhanced debugging for Firebase Storage bucket
try {
  console.log("Firebase configuration:", {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    bucketName: bucketName,
    hasPrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  });

  // Test bucket access with more detailed error handling
  bucket
    .exists()
    .then(([exists]) => {
      if (exists) {
        console.log(`Firebase Storage bucket verified: ${bucket.name}`);
        // Try to list files to verify permissions
        return bucket.getFiles({ maxResults: 1 }).then(([files]) => {
          console.log(
            `Successfully listed files in bucket. Found ${files.length} files.`
          );
        });
      } else {
        console.error(`Firebase Storage bucket does not exist: ${bucket.name}`);
        console.error(
          "Please create the bucket manually in the Firebase Console"
        );
      }
    })
    .catch((error: Error) => {
      console.error("Error checking bucket existence:", error);
      console.error(
        "Please verify your Firebase configuration and permissions"
      );
    });
} catch (error) {
  console.error("Error in Firebase initialization:", error);
}

export default app;
