import { Hono } from "hono";
import { requiresAdmin } from "../../../middleware/requiresAdmin";
import { db } from "../../../db";
import { projects } from "../../../db/schema";
import { bucket } from "../../../utils/firebaseAdmin";
import { eq } from "drizzle-orm";

export const createProject = new Hono().post(
  "/",
  requiresAdmin,

  async (c) => {
    let tempFileName: string | undefined = undefined; // Defined here to be accessible in the later block
    try {
      const formData = await c.req.formData();
      const name = formData.get("name") as string;
      const description = formData.get("description") as string | undefined;
      const statusString = formData.get("status") as string | undefined;
      const file = formData.get("file") as File | null;

      // Manual validation
      if (!name) {
        return c.json({ error: "Name is required" }, 400);
      }
      const status =
        statusString === undefined ? true : statusString === "true";

      let imageUrl: string | undefined = undefined;

      if (file) {
        const fileExtension = file.name.split(".").pop();
        tempFileName = `projects/temp/${Date.now()}.${fileExtension}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const fileRef = bucket.file(tempFileName);
        await fileRef.save(buffer, {
          metadata: {
            contentType: file.type,
          },
        });
        const [signedUrl] = await fileRef.getSignedUrl({
          action: "read",
          expires: "03-01-2500",
        });
        imageUrl = signedUrl;
      }

      const projectData: typeof projects.$inferInsert = {
        name,
        description: description || null,
        status,
        imageUrl: imageUrl || null,
      };

      const [result] = await db
        .insert(projects)
        .values(projectData)
        .returning();

      // If a file was uploaded and we used a temporary path, rename/move it now that we have the project ID.
      if (imageUrl && result && result.id && tempFileName) {
        const finalFileName = `project-${result.id}/${Date.now()}.${file?.name
          .split(".")
          .pop()}`;
        const oldFileRef = bucket.file(tempFileName); // Assuming tempFileName is accessible here
        const newFileRef = bucket.file(finalFileName);

        try {
          await oldFileRef.move(newFileRef);
          const [finalSignedUrl] = await newFileRef.getSignedUrl({
            action: "read",
            expires: "03-01-2500",
          });
          // Update the project with the final URL
          const [updatedResult] = await db
            .update(projects)
            .set({ imageUrl: finalSignedUrl })
            .where(eq(projects.id, result.id))
            .returning();
          return c.json({ result: updatedResult }, 201);
        } catch (moveError) {
          console.error("Error moving file to final destination:", moveError);
          // Optionally, clean up the temp file if move fails and decide on error strategy
          // For now, return the project with the temporary URL, but log the error
          return c.json(
            {
              result,
              warning: "File uploaded to temporary path, move failed.",
            },
            201
          );
        }
      } else {
        return c.json({ result }, 201); // 201 for created resource
      }
    } catch (e) {
      console.error("Error creating project:", e);
      // If file upload was part of the error, consider cleanup
      return c.json(
        {
          error: "Failed to create project",
          message: e instanceof Error ? e.message : String(e),
        },
        500
      );
    }
  }
);
