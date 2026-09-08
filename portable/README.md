# ComPilot Portable & Offline Version

This folder contains a fully self-contained, standalone build of **ComPilot (Competency Matrix App)** designed to run **100% offline** with **zero external internet or server dependencies**.

---

## 🌟 Key Features of the Offline Version

1. **No External Internet / CDN Dependencies**:
   - All frontend libraries (`Vue.js`, `Tailwind CSS`, `Chart.js`) are served locally from `public/js/`.
   - All images and assets are bundled in `public/`.
   - No internet access, remote CDN links, or external fonts are required.

2. **Self-Contained Local Database**:
   - Uses embedded SQLite files located right in this directory:
     - `shared.db` (Users, groups, settings)
     - `QA.db`, `Planning.db`, `Brachytherapy.db`, `SABR.db`, etc. (Section data and competency progress)
   - Requires no MySQL/Postgres server installation or network database setup.

3. **Pre-Bundled Node Modules**:
   - All backend dependencies (`express`, `sqlite3`, `jsonwebtoken`, `pdfkit`, `adm-zip`, `cors`) are already pre-packaged in the `node_modules` folder inside this directory. No `npm install` is needed.

4. **Zero Impact on Existing App**:
   - All changes, database operations, and data writes stay confined strictly within this `portable/` folder.

---

## 🚀 How to Run

### Option 1: On a machine with Node.js installed
- **Windows**: Double-click [`start.bat`](start.bat) to launch the server and automatically open the application in your default web browser at `http://localhost:3003`.
  - Alternatively, double-click [`start_silent.vbs`](start_silent.vbs) to run the server in the background without a command window.
- **Linux / macOS**: Run `./start.sh` in the terminal or run `node server.js`.

### Option 2: Running from a USB Drive (Air-Gapped / No Node.js Installed)
If you want to run this application on a completely locked-down or air-gapped PC that **does not have Node.js installed**:
1. Download the official standalone Node.js zip for Windows (`node-vXX.X.X-win-x64.zip`) from [nodejs.org](https://nodejs.org).
2. Extract just the single file `node.exe` into this `portable/` folder.
3. Double-click [`start.bat`](start.bat). The batch script will automatically detect the local `node.exe` in the folder and run without needing any system installation or admin privileges.

---

## 🛑 How to Stop the App
- In the command prompt window where `start.bat` is running, press `Ctrl + C` or simply close the window.
- If run silently via `start_silent.vbs`, close the Node.js process in Windows Task Manager or run:
  ```cmd
  taskkill /F /IM node.exe
  ```

---

## 📁 Folder Structure
```
portable/
├── node_modules/         # Bundled Node.js runtime packages
├── public/               # Frontend SPA (HTML, CSS, JS, Logos)
│   └── js/               # Local Vue, Tailwind, and Chart.js libraries
├── scripts/              # Maintenance and helper scripts
├── start.bat             # One-click Windows launcher
├── start_silent.vbs      # Silent background Windows launcher
├── start.sh              # Linux/Mac launcher
├── server.js             # Local Express + SQLite backend
├── shared.db             # User accounts & matrix configuration
├── QA.db                 # QA Section competency data
├── Planning.db           # Planning Section competency data
├── Brachytherapy.db      # Brachytherapy Section competency data
└── SABR.db               # SABR Section competency data
```
