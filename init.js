const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'competency.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('Initializing Database...');

  // Users Table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    designation TEXT NOT NULL
  )`);

  // Competencies Table
  db.run(`CREATE TABLE IF NOT EXISTS competencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    task_name TEXT NOT NULL,
    required_qatrack_count INTEGER DEFAULT 0,
    qatrack_test_identifier TEXT,
    display_order INTEGER DEFAULT 0,
    requires_instructions BOOLEAN DEFAULT 1,
    requires_quiz BOOLEAN DEFAULT 0
  )`);

  // Staff Competency Progress Table
  db.run(`CREATE TABLE IF NOT EXISTS staff_competency_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    competency_id INTEGER,
    current_status TEXT DEFAULT 't',
    instructions_read BOOLEAN DEFAULT 0,
    quiz_passed BOOLEAN DEFAULT 0,
    quiz_score INTEGER DEFAULT NULL,
    qatrack_records INTEGER DEFAULT NULL,
    date_started DATE DEFAULT CURRENT_DATE,
    date_signed_off DATE,
    assessor_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(competency_id) REFERENCES competencies(id) ON DELETE CASCADE,
    FOREIGN KEY(assessor_id) REFERENCES users(id),
    UNIQUE(user_id, competency_id)
  )`);

  // Quizzes Table
  db.run(`CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competency_id INTEGER,
    passing_score_percent INTEGER DEFAULT 80,
    FOREIGN KEY(competency_id) REFERENCES competencies(id) ON DELETE CASCADE
  )`);

  // Quiz Questions Table
  db.run(`CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`);

  // Competency Evidence Table
  db.run(`CREATE TABLE IF NOT EXISTS competency_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    progress_id INTEGER,
    evidence_type TEXT NOT NULL,
    evidence_value TEXT NOT NULL,
    description TEXT,
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(progress_id) REFERENCES staff_competency_progress(id) ON DELETE CASCADE
  )`);

  // Competency Audit Log Table
  db.run(`CREATE TABLE IF NOT EXISTS competency_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    target_user_id INTEGER NOT NULL,
    competency_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    actioned_by_id INTEGER NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT
  )`);

  console.log('Database schema created successfully.');
});

db.close();