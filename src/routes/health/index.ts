import { Hono } from "hono";
import { bucket, storage } from "../../utils/firebaseAdmin";

const healthRoutes = new Hono();

// Basic health check
healthRoutes.get("/", (c) => {
  return c.json({ status: "ok" });
});

// Firebase health check
healthRoutes.get("/firebase", async (c) => {
  try {
    // Log Firebase configuration (without sensitive data)
    console.log("Firebase configuration:", {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      bucketName: process.env.FIREBASE_STORAGE_BUCKET,
      hasPrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
      hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    });

    // Log storage and bucket details
    console.log("Storage details:", {
      storageName: storage.app.name,
      bucketName: bucket.name,
    });

    // Test bucket access
    console.log("Testing bucket access...");
    const [exists] = await bucket.exists();
    console.log("Bucket exists check result:", exists);

    if (!exists) {
      throw new Error("Firebase Storage bucket does not exist");
    }

    // Test write permissions with a small test file
    const testFileName = `health-check-${Date.now()}.txt`;
    console.log("Creating test file:", testFileName);
    const testFile = bucket.file(testFileName);

    try {
      console.log("Attempting to save test file...");
      await testFile.save("health check", {
        contentType: "text/plain",
        public: true,
      });
      console.log("Test file saved successfully");

      // Clean up test file
      console.log("Cleaning up test file...");
      await testFile.delete();
      console.log("Test file deleted successfully");

      return c.json({
        status: "ok",
        message: "Firebase Storage is accessible and writable",
        bucket: bucket.name,
        details: {
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          bucketName: process.env.FIREBASE_STORAGE_BUCKET,
        },
      });
    } catch (error) {
      console.error("Error during test file operations:", error);
      throw new Error(`Firebase Storage write test failed: ${error.message}`);
    }
  } catch (error) {
    console.error("Firebase health check failed:", error);
    return c.json(
      {
        status: "error",
        message: error.message,
        bucket: bucket.name,
        details: {
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          bucketName: process.env.FIREBASE_STORAGE_BUCKET,
        },
      },
      500
    );
  }
});

export default healthRoutes;
