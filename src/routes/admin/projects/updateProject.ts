import { Hono } from "hono";
import { requiresAdmin } from "../../../middleware/requiresAdmin";
import { db } from "../../../db";
import { projects } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { bucket } from "../../../utils/firebaseAdmin";

export const updateProject = new Hono().put(
  "/:id",
  requiresAdmin,
  async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid Project ID" }, 400);
    }

    try {
      const formData = await c.req.formData();
      const name = formData.get("name") as string | undefined;
      const description = formData.get("description") as string | undefined;
      const statusString = formData.get("status") as string | undefined;
      const imageUrlToDelete = formData.get("imageUrl") as string | undefined; // To handle explicit null/empty to delete image
      const file = formData.get("file") as File | null;

      const [existingProject] = await db
        .select({ id: projects.id, imageUrl: projects.imageUrl })
        .from(projects)
        .where(eq(projects.id, id));

      if (!existingProject) {
        return c.json({ error: "Project not found" }, 404);
      }

      const updateData: Partial<typeof projects.$inferInsert> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (statusString !== undefined)
        updateData.status = statusString === "true";

      let newImageUrl: string | null = existingProject.imageUrl; // Keep existing if not changed

      // Case 1: New file uploaded
      if (file) {
        // Delete old file if it exists
        if (existingProject.imageUrl) {
          try {
            const oldFileName = existingProject.imageUrl
              .split("/")
              .pop()
              ?.split("?")[0];
            // We need a more robust way to get the GCS object name from the signed URL.
            // Assuming URL is projects/{projectId}/{filename}
            const gcsObjectName = `projects-${id}/${decodeURIComponent(
              oldFileName || ""
            )}`;
            if (oldFileName)
              await bucket
                .file(gcsObjectName)
                .delete()
                .catch((e) =>
                  console.warn(
                    "Failed to delete old file from GCS, object might not exist or URL format is unexpected:",
                    e
                  )
                );
          } catch (e) {
            console.warn("Could not parse or delete old file:", e);
          }
        }

        const fileExtension = file.name.split(".").pop();
        const fileName = `projects-${id}/${Date.now()}.${fileExtension}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileRef = bucket.file(fileName);
        await fileRef.save(buffer, { metadata: { contentType: file.type } });
        const [signedUrl] = await fileRef.getSignedUrl({
          action: "read",
          expires: "03-01-2500",
        });
        newImageUrl = signedUrl;
      }
      // Case 2: imageUrl explicitly set to empty or null (and no new file)
      else if (imageUrlToDelete === "null" || imageUrlToDelete === "") {
        if (existingProject.imageUrl) {
          try {
            const oldFileName = existingProject.imageUrl
              .split("/")
              .pop()
              ?.split("?")[0];
            const gcsObjectName = `projects-${id}/${decodeURIComponent(
              oldFileName || ""
            )}`;
            if (oldFileName)
              await bucket
                .file(gcsObjectName)
                .delete()
                .catch((e) =>
                  console.warn(
                    "Failed to delete file based on null imageUrl:",
                    e
                  )
                );
          } catch (e) {
            console.warn(
              "Could not parse or delete old file when imageUrl set to null:",
              e
            );
          }
        }
        newImageUrl = null;
      }
      // If newImageUrl has changed (new upload or deletion), update it in DB data.
      if (newImageUrl !== existingProject.imageUrl) {
        updateData.imageUrl = newImageUrl;
      }

      if (Object.keys(updateData).length === 0) {
        return c.json(
          { message: "No changes provided", result: existingProject },
          200
        );
      }

      updateData.updatedAt = new Date(); // Manually set updatedAt

      const [result] = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, id))
        .returning();

      return c.json({ result }, 200);
    } catch (e) {
      console.error("Error updating project:", e);
      return c.json(
        {
          error: "Failed to update project",
          message: e instanceof Error ? e.message : String(e),
        },
        500
      );
    }
  }
);
