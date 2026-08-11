const fs = require('fs');
const path = require('path');

const galleryDir = path.join(__dirname, 'gallery');
const outputFile = path.join(__dirname, 'gallery-list.json');
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

// Make sure gallery folder exists, or create it
if (!fs.existsSync(galleryDir)) {
  console.log('⚠️  gallery folder not found, creating it...');
  fs.mkdirSync(galleryDir, { recursive: true });
}

const files = fs.readdirSync(galleryDir);
const images = [];

files.forEach(file => {
  const fullPath = path.join(galleryDir, file);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) return;
  const ext = path.extname(file).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    images.push({
      file: file,
      mtime: stat.mtime.getTime()
    });
  }
});

// Sort newest first
images.sort((a, b) => b.mtime - a.mtime);
const urls = images.map(img => `gallery/${img.file}`);

fs.writeFileSync(outputFile, JSON.stringify({ images: urls }, null, 2));
console.log(`✅ gallery-list.json generated with ${urls.length} images.`);

// Make sure index.html exists (Vercel needs this)
if (!fs.existsSync(path.join(__dirname, 'index.html'))) {
  console.error('❌ index.html not found!');
  process.exit(1); // This would fail Vercel - but we don't want that
}