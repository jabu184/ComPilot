const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const linuxDir = path.join(rootDir, 'ComPilot_Portable_Linux');
const tarGzPath = path.join(rootDir, 'ComPilot_Portable_Linux.tar.gz');
const runPath = path.join(rootDir, 'ComPilot_Linux_Offline.run');
const linuxZipPath = path.join(rootDir, 'ComPilot_Portable_Linux.zip');
const tempLinuxZipPath = path.join(rootDir, 'ComPilot_Portable_Linux.tmp.zip');

console.log('1. Synchronizing files to ComPilot_Portable_Linux/...');
fs.copyFileSync(path.join(rootDir, 'server.js'), path.join(linuxDir, 'server.js'));
fs.copyFileSync(path.join(rootDir, 'public', 'index.html'), path.join(linuxDir, 'public', 'index.html'));
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(linuxDir, 'package.json'));
fs.copyFileSync(path.join(rootDir, 'package-lock.json'), path.join(linuxDir, 'package-lock.json'));

const dbFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.db'));
for (const db of dbFiles) {
  fs.copyFileSync(path.join(rootDir, db), path.join(linuxDir, db));
}

console.log('2. Creating ComPilot_Portable_Linux.zip...');
if (fs.existsSync(linuxZipPath)) fs.unlinkSync(linuxZipPath);
if (fs.existsSync(tempLinuxZipPath)) fs.unlinkSync(tempLinuxZipPath);

const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${linuxDir.replace(/'/g, "''")}', '${tempLinuxZipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

fs.renameSync(tempLinuxZipPath, linuxZipPath);

const zipStats = fs.statSync(linuxZipPath);
console.log(`Successfully compiled ComPilot_Portable_Linux.zip (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB, modified: ${zipStats.mtime})`);
console.log('Linux portable zip package built successfully!');

