import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MAX_DIMENSION = 1024;
const IMAGE_REF_PATTERN = /\[Image: (attachments\/[^\]]+)\]/g;

export interface ProcessedImage {
  content: string;
  relativePath: string;
}

export interface ImageAttachment {
  relativePath: string;
  mediaType: string;
}

/**
 * Download an image from a URL, resize it, and return base64 + media type.
 * Used by channel handlers (e.g. Telegram) to process images before storage.
 */
export async function processImageFromUrl(
  url: string,
): Promise<{ data: string; mediaType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Image download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());

  const resized = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { data: resized.toString('base64'), mediaType: 'image/jpeg' };
}

/**
 * Process a raw image buffer: resize, save to group dir, return content string.
 */
export async function processImage(
  buffer: Buffer,
  groupDir: string,
  caption: string,
): Promise<ProcessedImage | null> {
  if (!buffer || buffer.length === 0) return null;

  const resized = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  const attachDir = path.join(groupDir, 'attachments');
  fs.mkdirSync(attachDir, { recursive: true });

  const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
  const filePath = path.join(attachDir, filename);
  fs.writeFileSync(filePath, resized);

  const relativePath = `attachments/${filename}`;
  const content = caption
    ? `[Image: ${relativePath}] ${caption}`
    : `[Image: ${relativePath}]`;

  return { content, relativePath };
}

/**
 * Save base64 image data to the group directory.
 * Returns the relative path and a content string with the [Image: ...] reference.
 */
export function saveImageData(
  base64Data: string,
  groupDir: string,
  caption: string,
): ProcessedImage {
  const attachDir = path.join(groupDir, 'attachments');
  fs.mkdirSync(attachDir, { recursive: true });

  const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
  const filePath = path.join(attachDir, filename);
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

  const relativePath = `attachments/${filename}`;
  const content = caption
    ? `[Image: ${relativePath}] ${caption}`
    : `[Image: ${relativePath}]`;

  return { content, relativePath };
}

export function parseImageReferences(
  messages: Array<{ content: string }>,
): ImageAttachment[] {
  const refs: ImageAttachment[] = [];
  for (const msg of messages) {
    let match: RegExpExecArray | null;
    IMAGE_REF_PATTERN.lastIndex = 0;
    while ((match = IMAGE_REF_PATTERN.exec(msg.content)) !== null) {
      // Always JPEG — processImage() normalizes all images to .jpg
      refs.push({ relativePath: match[1], mediaType: 'image/jpeg' });
    }
  }
  return refs;
}
