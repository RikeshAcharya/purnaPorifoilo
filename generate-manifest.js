const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'gallery');
console.log('Looking in:', dir);

if (!fs.existsSync(dir)) {
  console.log('Folder does not exist.');
  process.exit();
}

const files = fs.readdirSync(dir);
console.log(`Total items in folder: ${files.length}`);
files.forEach(f => console.log(' -', f));

const extAllowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const images = [];

files.forEach(file => {
  const fullPath = path.join(dir, file);
  const stat = fs.statSync(fullPath);

  if (stat.isDirectory()) {
    console.log(`Skipping subfolder: ${file}`);
    return;
  }

  const ext = path.extname(file).toLowerCase();
  if (extAllowed.includes(ext)) {
    images.push({ file, mtime: stat.mtime.getTime() });
    console.log(`✔ Added: ${file}`);
  } else {
    console.log(`✘ Excluded (extension '${ext}' not allowed): ${file}`);
  }
});

if (images.length === 0) {
  console.log('\nNo valid images found. Please check:');
  console.log('- Are images directly inside public/gallery? (not inside subfolders)');
  console.log('- Do they have one of these extensions: .jpg, .jpeg, .png, .gif, .webp, .svg');
} else {
  images.sort((a, b) => b.mtime - a.mtime);
  const urls = images.map(img => '/gallery/' + img.file);
  fs.writeFileSync('gallery-list.json', JSON.stringify({ images: urls }, null, 2));
  console.log(`\n✅ gallery-list.json updated with ${urls.length} images.`);
}