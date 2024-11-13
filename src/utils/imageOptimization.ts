import sharp from "sharp";
import path from "path";

const IMAGE_CONFIG = {
  maxWidth: 1200,
  jpegQuality: 80,
  thumbnailWidth: 100,
};

export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: IMAGE_CONFIG.maxWidth,
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({
      quality: IMAGE_CONFIG.jpegQuality,
      mozjpeg: true,
    })
    .toBuffer();
}

export async function generateThumbnail(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  const extension = path.extname(originalName);
  const thumbnailFileName = `thumb-${timestamp}-${randomString}${extension}`;
  const thumbnailPath = path.join("./media", thumbnailFileName);

  await sharp(buffer)
    .resize({
      width: IMAGE_CONFIG.thumbnailWidth,
      fit: "contain",
    })
    .jpeg({ quality: 70 })
    .toFile(thumbnailPath);

  return `/media/${thumbnailFileName}`;
}
