const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../apps/web/dist');
const dstDir = path.resolve(__dirname, '../public');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-web-dist] Source directory does not exist: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      if (entry.name === 'index.html') {
        fs.copyFileSync(srcPath, path.join(dest, 'app.html'));
        console.log(`[copy-web-dist] Copied ${entry.name} -> public/app.html (preserving Codex product website in public/index.html)`);
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
      console.log(`[copy-web-dist] Copied ${entry.name} -> ${destPath}`);
    }
  }
}

console.log(`[copy-web-dist] Syncing ${srcDir} to ${dstDir}...`);
copyRecursiveSync(srcDir, dstDir);
console.log('[copy-web-dist] Web bundle successfully synced to public directory.');
