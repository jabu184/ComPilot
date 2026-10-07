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

console.log('2. Creating ComPilot_Portable_Linux.tar.gz...');
if (fs.existsSync(tarGzPath)) fs.unlinkSync(tarGzPath);
execSync(`tar -czf ComPilot_Portable_Linux.tar.gz ComPilot_Portable_Linux`, { cwd: rootDir, stdio: 'inherit' });

console.log('3. Generating self-extracting bundle: ComPilot_Linux_Offline.run...');

const header = `#!/usr/bin/env bash
# ==============================================================================
# ComPilot Portable Linux Self-Extracting Bundle
# ==============================================================================
set -e

TARGET_DIR="\${COMPILOT_DIR:-ComPilot_Portable_Linux}"

echo "========================================================="
echo "   ComPilot - Clinical Competency Matrix (Linux)         "
echo "========================================================="

if [ ! -d "$TARGET_DIR" ]; then
    echo "Extracting portable package to ./$TARGET_DIR ..."
    mkdir -p "$TARGET_DIR"
    PAYLOAD_LINE=$(awk '/^__COMPILOT_PAYLOAD_START__/ {print NR + 1; exit 0; }' "$0")
    tail -n +"$PAYLOAD_LINE" "$0" | tar -xz -C "$TARGET_DIR" --strip-components=1
    chmod +x "$TARGET_DIR/node" "$TARGET_DIR/start.sh" "$TARGET_DIR/stop.sh" 2>/dev/null || true
    echo "Extraction complete."
else
    echo "Found existing directory ./$TARGET_DIR"
fi

echo "Launching ComPilot..."
cd "$TARGET_DIR"
exec ./start.sh "$@"

exit 0
__COMPILOT_PAYLOAD_START__
`;

const headerBuffer = Buffer.from(header.replace(/\r\n/g, '\n'), 'utf8');
const tarBuffer = fs.readFileSync(tarGzPath);

const fd = fs.openSync(runPath, 'w');
fs.writeSync(fd, headerBuffer);
fs.writeSync(fd, tarBuffer);
fs.closeSync(fd);

console.log(`Created self-extracting single file: ${runPath}`);
console.log(`Total size: ${(headerBuffer.length + tarBuffer.length) / (1024 * 1024)} MB`);

console.log('4. Creating ComPilot_Portable_Linux.zip...');
if (fs.existsSync(tempLinuxZipPath)) fs.unlinkSync(tempLinuxZipPath);

const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${linuxDir.replace(/'/g, "''")}', '${tempLinuxZipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

if (fs.existsSync(linuxZipPath)) fs.unlinkSync(linuxZipPath);
fs.renameSync(tempLinuxZipPath, linuxZipPath);

const zipStats = fs.statSync(linuxZipPath);
console.log(`Created Linux zip file: ${linuxZipPath} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
console.log('All Linux portable packages built successfully!');
