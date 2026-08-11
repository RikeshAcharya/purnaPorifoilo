// generate-gallery.js
const fs = require('fs');
const path = require('path');

const galleryDir = path.join(__dirname, 'gallery'); // images are in a folder named 'gallery'
const outputFile = path.join(__dirname, 'gallery-list.json');

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

if (!fs.existsSync(galleryDir)) {
  console.log('❌ Gallery folder not found. Create a "gallery" folder next to index.html.');
  process.exit(1);
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

// Generate URLs relative to index.html (assuming gallery is a subfolder)
const urls = images.map(img => `gallery/${img.file}`);

fs.writeFileSync(outputFile, JSON.stringify({ images: urls }, null, 2));
console.log(`✅ gallery-list.json generated with ${urls.length} images.`);