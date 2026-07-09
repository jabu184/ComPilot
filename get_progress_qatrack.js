const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'Planning.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT competency_id, qatrack_records, qatrack_records_detail FROM staff_competency_progress WHERE user_id = 10 AND competency_id IN (5, 6, 7, 8, 9, 10, 11)', [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Progress for user 10:');
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
