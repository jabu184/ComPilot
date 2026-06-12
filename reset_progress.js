const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const sharedDbPath = path.resolve(__dirname, 'shared.db');

if (!fs.existsSync(sharedDbPath)) {
  console.error('shared.db not found. Please run the main app first to initialize.');
  process.exit(1);
}

const sharedDb = new sqlite3.Database(sharedDbPath);

const query = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const execute = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// These are the tables that contain user progress, quiz attempts, logs, and audit trails
const tablesToClear = [
  'staff_competency_progress',
  'viva_evaluations',
  'self_evaluations',
  'patient_plan_logs',
  'competency_audit_log',
  'file_uploads'
];

async function clearDatabaseProgress() {
  try {
    console.log('Starting progress & results wipe (Core structures will be kept)...');
    
    let sections = [];
    try {
      const res = await query(sharedDb, "SELECT value FROM global_settings WHERE key = 'sections'");
      if (res.length > 0) sections = JSON.parse(res[0].value);
    } catch (err) {
      console.log("Could not read sections from shared.db, using defaults.");
    }
    
    if (sections.length === 0) {
      sections = [{name: 'QA'}, {name: 'Planning'}, {name: 'Brachytherapy'}, {name: 'SABR'}];
    }

    const dbNames = sections.map(s => s.name);

    for (const dbName of dbNames) {
      const safeName = dbName.replace(/[^a-zA-Z0-9]/g, '_');
      const dbPath = path.resolve(__dirname, `${safeName}.db`);
      
      if (!fs.existsSync(dbPath)) {
        console.log(`Skipping ${safeName}.db (does not exist)`);
        continue;
      }

      console.log(`\nCleaning database: ${safeName}.db`);
      const db = new sqlite3.Database(dbPath);

      for (const table of tablesToClear) {
        try {
          const tableExists = await query(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);
          if (tableExists.length > 0) {
            await execute(db, `DELETE FROM ${table}`);
            await execute(db, `DELETE FROM sqlite_sequence WHERE name=?`, [table]); // Reset Auto-increments
            console.log(` - Cleared table: ${table}`);
          }
        } catch (err) {
          console.error(` - Error clearing ${table} in ${safeName}.db: ${err.message}`);
        }
      }
      db.close();
    }

    // Clean up physical file uploads directory 
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      console.log('\nEmptying physical file uploads directory...');
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      console.log(' - Cleared public/uploads directory.');
    }

    console.log('\nDatabase progress wipe completed successfully!');
  } catch (err) {
    console.error('An error occurred:', err);
  } finally {
    sharedDb.close();
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('WARNING: This will delete ALL user progress, case logs, and quiz results across all sections. Are you sure? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    clearDatabaseProgress().then(() => rl.close());
  } else {
    console.log('Operation aborted.');
    rl.close();
  }
});