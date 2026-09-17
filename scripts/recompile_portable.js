const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const portableDir = path.join(rootDir, 'portable');
const zipPath = path.join(rootDir, 'ComPilot_Portable_Offline.zip');
const tempZipPath = path.join(rootDir, 'ComPilot_Portable_Offline.tmp.zip');

console.log('1. Synchronizing files to portable/...');
fs.copyFileSync(path.join(rootDir, 'server.js'), path.join(portableDir, 'server.js'));
fs.copyFileSync(path.join(rootDir, 'public', 'index.html'), path.join(portableDir, 'public', 'index.html'));
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(portableDir, 'package.json'));
fs.copyFileSync(path.join(rootDir, 'package-lock.json'), path.join(portableDir, 'package-lock.json'));

const dbFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.db'));
for (const db of dbFiles) {
  fs.copyFileSync(path.join(rootDir, db), path.join(portableDir, db));
}

console.log('2. Compiling ComPilot_Portable_Offline.zip...');
if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${portableDir.replace(/'/g, "''")}', '${tempZipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
fs.renameSync(tempZipPath, zipPath);

const stats = fs.statSync(zipPath);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`Successfully compiled ComPilot_Portable_Offline.zip (${sizeMB} MB, modified: ${stats.mtime})`);
