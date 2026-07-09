const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sharedDbPath = path.resolve(__dirname, '..', 'shared.db');
const db = new sqlite3.Database(sharedDbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    return;
  }
  
  db.all("SELECT * FROM global_settings WHERE key = 'sections'", (err, rows) => {
    if (err) {
      console.error('Error querying table:', err.message);
      return;
    }
    console.log('Sections setting in database:', JSON.stringify(rows, null, 2));
    db.close();
  });
});
