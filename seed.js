const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'competency.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('Seeding Database...');

  // Seed Users
  db.run(`INSERT OR IGNORE INTO users (id, username, full_name, email, designation) VALUES 
    (1, 'jdoe', 'Jane Doe', 'jdoe@hospital.com', 'MPE'),
    (2, 'asmith', 'Alice Smith', 'asmith@hospital.com', 'Clinical Scientist'),
    (3, 'bjones', 'Bob Jones', 'bjones@hospital.com', 'Trainee')
  `);

  // Seed Competencies
  db.run(`INSERT OR IGNORE INTO competencies (id, category, task_name, required_qatrack_count, qatrack_test_identifier) VALUES 
    (1, '3D Printer', 'Advice at Markup', 0, NULL),
    (2, '3D Printer', 'Printing Bolus', 5, '3D_PRINT_QA'),
    (3, 'Electron Treatments', 'Daily QA', 10, 'ELEC_DAILY_QA'),
    (4, 'Electron Treatments', 'Independent Calculations', 0, NULL)
  `);

  // Seed Progress (jdoe is an assessor, asmith is ready for assessment, bjones is training)
  db.run(`INSERT OR IGNORE INTO staff_competency_progress (user_id, competency_id, current_status) VALUES 
    (1, 1, 'x+'),
    (1, 2, 'x+'),
    (1, 3, 'x+'),
    (1, 4, 'x+'),
    
    (2, 1, 'x'),
    (2, 2, 'a'),
    (2, 3, 'x'),
    (2, 4, 't'),
    
    (3, 1, 't'),
    (3, 2, 't'),
    (3, 3, 't')
  `);

  // Some progress records left empty intentionally to test blank grid cells

  console.log('Database seeded successfully!');
  console.log('You can now log in using usernames: jdoe, asmith, or bjones');
});

db.close();