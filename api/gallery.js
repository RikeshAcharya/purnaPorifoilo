// /api/gallery.js
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  const galleryDir = path.join(process.cwd(), 'public', 'gallery');
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

  try {
    // Check if folder exists
    await fs.access(galleryDir);
    const files = await fs.readdir(galleryDir);

    // Gather file stats in parallel
    const imageFiles = await Promise.all(
      files.map(async (file) => {
        const ext = path.extname(file).toLowerCase();
        if (!allowedExtensions.includes(ext)) return null;
        const fullPath = path.join(galleryDir, file);
        const stat = await fs.stat(fullPath);
        return { file, mtime: stat.mtime.getTime() };
      })
    );

    // Filter out nulls and sort newest first
    const valid = imageFiles
      .filter(item => item !== null)
      .sort((a, b) => b.mtime - a.mtime)
      .map(item => `/gallery/${item.file}`);

    res.status(200).json({ images: valid });
  } catch (err) {
    // If folder doesn't exist or other error, return empty array
    res.status(200).json({ images: [] });
  }
}