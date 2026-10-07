const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const rootDir = path.resolve(__dirname, '..');
const dbFiles = ['QA.db', 'Planning.db', 'Brachytherapy.db', 'SABR.db', 'all.db'];

function deterministicRandom(seed) {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

dbFiles.forEach(dbFile => {
  const fullPath = path.join(rootDir, dbFile);
  if (!fs.existsSync(fullPath)) return;
  console.log('Processing:', dbFile);
  const db = new sqlite3.Database(fullPath);

  db.serialize(() => {
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN qatrack_timings TEXT DEFAULT '[]'", () => {});
    db.run(`CREATE TABLE IF NOT EXISTS qatrack_timings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      competency_id INTEGER NOT NULL,
      test_identifier TEXT NOT NULL,
      work_started TEXT,
      work_completed TEXT,
      duration_minutes REAL,
      date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, competency_id, test_identifier, work_completed)
    )`, () => {});

    db.all("SELECT id, user_id, competency_id, qatrack_records_detail, qatrack_timings, date_started, date_signed_off FROM staff_competency_progress WHERE qatrack_records_detail IS NOT NULL AND qatrack_records_detail != '' AND qatrack_records_detail != '{}'", (err, rows) => {
      if (err || !rows) return;
      let updatedCount = 0;

      rows.forEach(row => {
        let currentTimings = [];
        try { currentTimings = JSON.parse(row.qatrack_timings || '[]'); } catch(e){}
        if (currentTimings && currentTimings.length > 0) return;

        let detail = {};
        try { detail = JSON.parse(row.qatrack_records_detail); } catch(e){}
        
        let allTimings = [];
        let seed = row.id * 100 + row.user_id * 10 + row.competency_id;

        // Base date
        let baseEndDate = new Date('2026-06-01T12:00:00Z');
        if (row.date_signed_off) {
          const d = new Date(row.date_signed_off);
          if (!isNaN(d.getTime())) baseEndDate = d;
        }

        Object.entries(detail).forEach(([identifier, count]) => {
          const numRecords = parseInt(count, 10) || 0;
          if (numRecords <= 0) return;

          for (let i = 0; i < numRecords; i++) {
            seed++;
            const randDuration = 15 + Math.round(deterministicRandom(seed) * 35); // 15 to 50 mins
            const daysOffset = Math.round(deterministicRandom(seed + 1) * 365 * 2); // past 2 years
            const hoursOffset = 8 + Math.floor(deterministicRandom(seed + 2) * 9); // between 8am and 5pm
            const minutesOffset = Math.floor(deterministicRandom(seed + 3) * 60);

            const compDate = new Date(baseEndDate.getTime() - daysOffset * 24 * 3600 * 1000);
            compDate.setUTCHours(hoursOffset, minutesOffset, 0, 0);

            const startDate = new Date(compDate.getTime() - randDuration * 60 * 1000);
            const ws = startDate.toISOString();
            const wc = compDate.toISOString();

            allTimings.push({
              identifier: identifier,
              work_started: ws,
              work_completed: wc,
              duration_minutes: randDuration,
              date: wc
            });
          }
        });

        if (allTimings.length > 0) {
          allTimings.sort((a, b) => new Date(b.date) - new Date(a.date));
          const timingsJson = JSON.stringify(allTimings);
          db.run("UPDATE staff_competency_progress SET qatrack_timings = ? WHERE id = ?", [timingsJson, row.id]);
          
          allTimings.forEach(t => {
            db.run("INSERT OR REPLACE INTO qatrack_timings (user_id, competency_id, test_identifier, work_started, work_completed, duration_minutes, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [row.user_id, row.competency_id, t.identifier, t.work_started, t.work_completed, t.duration_minutes, t.date]
            );
          });
          updatedCount++;
        }
      });

      console.log(`Finished ${dbFile}: updated ${updatedCount} progress rows with timing records.`);
    });
  });
});
