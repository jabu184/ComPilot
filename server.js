const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3003;
const SECRET_KEY = 'super-secret-key-for-development'; // Replace in production

const sharedDbPath = path.resolve(__dirname, 'shared.db');
const sharedDb = new sqlite3.Database(sharedDbPath, (err) => {
  if (err) {
    console.error('Error connecting to shared database:', err.message);
  } else {
    console.log('Connected to the shared SQLite database: shared.db');
    sharedDb.serialize(() => {
      sharedDb.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, full_name TEXT, email TEXT, designation TEXT, is_admin INTEGER DEFAULT 0, is_superuser INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, password TEXT DEFAULT '', active_in TEXT DEFAULT '["QA", "Planning", "Brachytherapy", "SABR"]', date_in_post TEXT DEFAULT NULL)`, () => {
        sharedDb.get("SELECT count(*) as count FROM users", (err, row) => {
          if (row && row.count === 0) {
            const qaDbPath = path.resolve(__dirname, 'QA.db');
            if (fs.existsSync(qaDbPath)) {
              console.log("Migrating users from QA.db to shared.db...");
              sharedDb.run(`ATTACH DATABASE '${qaDbPath}' AS qa`, () => {
                sharedDb.run(`INSERT INTO users (id, username, full_name, email, designation, is_admin, is_active, password, active_in, date_in_post) SELECT id, username, full_name, email, designation, is_admin, is_active, password, '["QA", "Planning", "Brachytherapy", "SABR"]', NULL FROM qa.users`, (err) => {
                  if (err) {
                    sharedDb.run(`INSERT INTO users (id, username, full_name, email, designation, is_admin, is_active, active_in, date_in_post) SELECT id, username, full_name, email, designation, is_admin, is_active, '["QA", "Planning", "Brachytherapy", "SABR"]', NULL FROM qa.users`, () => {
                      sharedDb.run("UPDATE users SET is_superuser = 1 WHERE is_admin = 1", () => {});
                    });
                  } else {
                    sharedDb.run("UPDATE users SET is_superuser = 1 WHERE is_admin = 1", () => {});
                  }
                });
                sharedDb.run(`INSERT INTO user_groups (name) SELECT name FROM qa.user_groups`, () => {
                  sharedDb.run(`DETACH DATABASE qa`);
                });
              });
            } else {
              sharedDb.run(`INSERT INTO users (id, username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in, date_in_post) VALUES 
                (1, 'admin', 'System Administrator', 'admin@example.com', 'MPE', 1, 1, 1, 'woody', '["QA", "Planning", "Brachytherapy", "SABR"]', NULL)
              `);
            }
          } else {
             sharedDb.run("ALTER TABLE users ADD COLUMN is_superuser INTEGER DEFAULT 0", () => {
               sharedDb.run("UPDATE users SET is_superuser = 1 WHERE is_admin = 1", () => {});
             });
             sharedDb.run("ALTER TABLE users ADD COLUMN password TEXT DEFAULT ''", () => {});
             sharedDb.run("ALTER TABLE users ADD COLUMN active_in TEXT DEFAULT '[\"QA\", \"Planning\", \"Brachytherapy\", \"SABR\"]'", () => {});
             sharedDb.run("ALTER TABLE users ADD COLUMN date_in_post TEXT DEFAULT NULL", () => {});
          }
        });
      });
      sharedDb.run("CREATE TABLE IF NOT EXISTS user_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, display_order INTEGER DEFAULT 0)", () => {
        sharedDb.get("SELECT count(*) as count FROM user_groups", (err, row) => {
          if (row && row.count === 0 && !fs.existsSync(path.resolve(__dirname, 'QA.db'))) {
            sharedDb.run("INSERT INTO user_groups (name, display_order) VALUES ('MPE', 0), ('Clinical Scientist', 1), ('Trainee Clinical Scientist', 2), ('Dosimetrist', 3)");
          } else {
            sharedDb.run("ALTER TABLE user_groups ADD COLUMN display_order INTEGER DEFAULT 0", () => {});
          }
        });
      });
      sharedDb.run("CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value TEXT)", () => {
        sharedDb.get("SELECT count(*) as count FROM global_settings", (err, row) => {
          if (row && row.count === 0) {
            sharedDb.run("INSERT INTO global_settings (key, value) VALUES ('default_renewal_period', '36')");
            const defaultSections = JSON.stringify([{name: 'QA', active: true}, {name: 'Planning', active: true}, {name: 'Brachytherapy', active: true}, {name: 'SABR', active: true}]);
            sharedDb.run("INSERT INTO global_settings (key, value) VALUES ('sections', ?)", [defaultSections]);
          } else {
            // Ensure sections key exists for legacy DBs
            sharedDb.get("SELECT value FROM global_settings WHERE key = 'sections'", (err, r) => {
              if (!r) {
                const defaultSections = JSON.stringify([{name: 'QA', active: true}, {name: 'Planning', active: true}, {name: 'Brachytherapy', active: true}, {name: 'SABR', active: true}]);
                sharedDb.run("INSERT INTO global_settings (key, value) VALUES ('sections', ?)", [defaultSections]);
              }
            });
          }
        });
      });
    });
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- STATIC FRONTEND ---
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to serve index.html from the public folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- DATABASE CONNECTION ---
const dbs = {};
const initDb = (db) => {
  db.serialize(() => {
    // CREATE BASE TABLES IF THEY DO NOT EXIST (Needed for dynamically created databases)
    db.run(`CREATE TABLE IF NOT EXISTS competencies (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, task_name TEXT, required_qatrack_count INTEGER DEFAULT 0, qatrack_test_identifier TEXT, requires_instructions INTEGER DEFAULT 1, requires_quiz INTEGER DEFAULT 0, requires_prerequisite_competencies INTEGER DEFAULT 0, prerequisite_competencies TEXT DEFAULT '[]', display_order INTEGER DEFAULT 0, reading_prerequisites TEXT DEFAULT '[]', renewal_period_months INTEGER DEFAULT 36, requires_pre_eval INTEGER DEFAULT 0, requires_post_eval INTEGER DEFAULT 0, qatrack_requirements TEXT DEFAULT '[]', allow_file_uploads INTEGER DEFAULT 0, required_plan_count INTEGER DEFAULT 0)`, () => {
      db.get("SELECT count(*) as count FROM competencies", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO competencies (id, category, task_name, required_qatrack_count, qatrack_test_identifier, requires_instructions, requires_quiz, requires_prerequisite_competencies, prerequisite_competencies, reading_prerequisites, renewal_period_months) VALUES 
            (1, 'General', 'Department Induction', 0, NULL, 1, 1, 0, '[]', '[{"id":"doc1","name":"Health and Safety Guidelines"}]', 36),
            (2, 'Equipment', 'Basic Operation', 5, 'BASIC_QA', 1, 0, 1, '[1]', '[{"id":"doc2","name":"Operating Manual"}]', 36)
          `, (err) => { if(err) console.warn('InitDB Seed Competencies:', err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS staff_competency_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, competency_id INTEGER, current_status TEXT DEFAULT 't', instructions_read INTEGER DEFAULT 0, quiz_passed INTEGER DEFAULT 0, date_started TEXT DEFAULT CURRENT_DATE, date_signed_off TEXT, assessor_id INTEGER, date_reviewed TEXT, reviewer_id INTEGER, quiz_score INTEGER, qatrack_records INTEGER, qatrack_records_detail TEXT DEFAULT '{}', qatrack_manual_override INTEGER DEFAULT 0, readings_completed TEXT DEFAULT '[]', quizzes_completed TEXT DEFAULT '{}', UNIQUE(user_id, competency_id))`, () => {
      db.get("SELECT count(*) as count FROM staff_competency_progress", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO staff_competency_progress (user_id, competency_id, current_status, readings_completed) VALUES 
            (2, 1, 'x', '["doc1"]'), (2, 2, 'x', '["doc2"]'),
            (3, 1, 'c', '["doc1"]'),  (3, 2, 'a', '["doc2"]'),
            (4, 1, 't', '[]'),        (4, 2, 't', '[]')
          `, (err) => { if(err) console.warn('InitDB Seed Progress:', err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, competency_id INTEGER, passing_score_percent INTEGER DEFAULT 80, name TEXT DEFAULT 'Competency Quiz', is_viva INTEGER DEFAULT 0)`, () => {
      db.get("SELECT count(*) as count FROM quizzes", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO quizzes (id, competency_id, passing_score_percent, name) VALUES (1, 1, 100, 'Induction Quiz')`, (err) => { if(err) console.warn('InitDB Seed Quizzes:', err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS viva_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainee_id INTEGER NOT NULL,
      competency_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      assigned_assessor_id INTEGER NOT NULL,
      trainee_answers TEXT NOT NULL,
      assessor_answers TEXT,
      is_passed INTEGER,
      status TEXT DEFAULT 'Assessor_Pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )`, () => {
      db.all("PRAGMA table_info(viva_evaluations)", (err, cols) => {
        if (cols && cols.length > 0) {
          const hasStatus = cols.some(c => c.name === 'status');
          if (!hasStatus) db.run("ALTER TABLE viva_evaluations ADD COLUMN status TEXT DEFAULT 'Assessor_Pending'");
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS quiz_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER, question_text TEXT, question_type TEXT DEFAULT 'multiple_choice', option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_option TEXT)`, () => {
      db.get("SELECT count(*) as count FROM quiz_questions", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO quiz_questions (quiz_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_option) VALUES 
            (1, 'Where is the designated fire assembly point?', 'multiple_choice', 'Main Car Park', 'Front Reception', 'Basement', 'Roof Area', 'A'),
            (1, 'Who is the primary Radiation Protection Supervisor?', 'multiple_choice', 'Jane Doe', 'Alice Smith', 'Bob Jones', 'The Admin', 'A')
          `, (err) => { if(err) console.warn('InitDB Seed Quiz Questions:', err.message); });
        }
      });
    });
    
    db.run("CREATE TABLE IF NOT EXISTS category_order (category TEXT UNIQUE, display_order INTEGER)", () => {
      db.get("SELECT count(*) as count FROM category_order", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO category_order (category, display_order) SELECT DISTINCT category, 0 FROM competencies`, (err) => { if(err) console.warn('InitDB Seed Category Order:', err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS self_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      competency_id INTEGER NOT NULL,
      evaluation_type TEXT NOT NULL, -- 'pre' or 'post'
      score_a INTEGER NOT NULL,
      score_b INTEGER NOT NULL,
      score_c INTEGER NOT NULL,
      submission_date TEXT DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      db.get("SELECT count(*) as count FROM self_evaluations", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO self_evaluations (user_id, competency_id, evaluation_type, score_a, score_b, score_c, submission_date) SELECT user_id, competency_id, evaluation_type, score_a, score_b, score_c, submission_date FROM self_evaluation_submissions`, (err) => { if(err) console.warn("Self eval migration skip:", err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS patient_plan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainee_id INTEGER NOT NULL,
      competency_id INTEGER NOT NULL,
      patient_reference TEXT NOT NULL,
      log_date TEXT,
      trainee_comments TEXT NOT NULL,
      assigned_assessor_id INTEGER NOT NULL,
      assessor_comments TEXT,
      score INTEGER,
      status TEXT DEFAULT 'Pending_Review',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    )`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS competency_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP, target_user_id INTEGER, competency_id INTEGER, action_type TEXT, actioned_by_id INTEGER, previous_status TEXT, new_status TEXT, notes TEXT)`, () => {});
    
    db.run("CREATE TABLE IF NOT EXISTS competency_groups (competency_id INTEGER, group_name TEXT, UNIQUE(competency_id, group_name))", () => {
      db.get("SELECT count(*) as count FROM competency_groups", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO competency_groups (competency_id, group_name) VALUES 
            (1, 'MPE'), (1, 'Clinical Scientist'), (1, 'Trainee Clinical Scientist'), (1, 'Dosimetrist'),
            (2, 'MPE'), (2, 'Clinical Scientist'), (2, 'Trainee Clinical Scientist')
          `, (err) => { if(err) console.warn('InitDB Seed Competency Groups:', err.message); });
        }
      });
    });

    // BACKWARDS COMPATIBILITY ALTERS (For existing pre-schema databases)
    db.all("PRAGMA table_info(competencies)", (err, columns) => {
      const hasRequiresInstructions = columns && columns.some(c => c.name === 'requires_instructions');
      if (!hasRequiresInstructions) {
        db.run("UPDATE staff_competency_progress SET current_status = 'c' WHERE current_status = 'x'", () => {});
        db.run("UPDATE staff_competency_progress SET current_status = 'x' WHERE current_status = 'x+'", () => {});
      }
    });
    db.run("ALTER TABLE competencies ADD COLUMN display_order INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN requires_instructions INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN requires_quiz INTEGER DEFAULT 0", () => {});
    db.run("CREATE TABLE IF NOT EXISTS competency_quizzes (competency_id INTEGER, quiz_id INTEGER, UNIQUE(competency_id, quiz_id))", () => {
      db.all(`PRAGMA table_info(quizzes)`, (err, columns) => {
        const hasCompId = columns && columns.some(c => c.name === 'competency_id');
        if (hasCompId) {
          console.log("Migrating quizzes table to new library format...");
          db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run(`INSERT OR IGNORE INTO competency_quizzes (competency_id, quiz_id) SELECT competency_id, id FROM quizzes WHERE competency_id IS NOT NULL`);
            db.run("ALTER TABLE quizzes RENAME TO quizzes_old");
            db.run("CREATE TABLE quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, passing_score_percent INTEGER DEFAULT 80)");
            db.run("INSERT INTO quizzes (id, name, passing_score_percent) SELECT id, name, passing_score_percent FROM quizzes_old");
            db.run("DROP TABLE quizzes_old");
            db.all("PRAGMA table_info(quizzes)", (err, cols) => {
              const hasIsViva = cols && cols.some(c => c.name === 'is_viva');
              if (!hasIsViva) db.run("ALTER TABLE quizzes ADD COLUMN is_viva INTEGER DEFAULT 0", () => {});
            });
            db.run("COMMIT", (err) => {
              if (!err) console.log("Quizzes table migrated successfully.");
            });
          });
        }
      });
    });
    db.run("ALTER TABLE competencies ADD COLUMN requires_prerequisite_competencies INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN prerequisite_competencies TEXT DEFAULT '[]'", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN quiz_score INTEGER DEFAULT NULL", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN qatrack_records INTEGER DEFAULT NULL", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN qatrack_manual_override INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN renewal_period_months INTEGER DEFAULT 36", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN reading_prerequisites TEXT DEFAULT '[]'", () => {
      db.all("SELECT id, requires_instructions, reading_prerequisites FROM competencies", (err, rows) => {
        if (rows) {
          rows.forEach(row => {
            if (row.requires_instructions === 1 && (!row.reading_prerequisites || row.reading_prerequisites === '[]')) {
              db.run("UPDATE competencies SET reading_prerequisites = ? WHERE id = ?", [JSON.stringify([{id: 'default_reading', name: 'Protocol Instructions'}]), row.id]);
            }
          });
        }
      });
    });
    db.run("ALTER TABLE quiz_questions ADD COLUMN question_type TEXT DEFAULT 'multiple_choice'", () => {});
    db.run("ALTER TABLE quizzes ADD COLUMN name TEXT DEFAULT 'Competency Quiz'", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN readings_completed TEXT DEFAULT '[]'", () => {
      db.all("SELECT id, instructions_read FROM staff_competency_progress WHERE instructions_read = 1", (err, rows) => {
        if (rows) {
          rows.forEach(row => {
            db.run("UPDATE staff_competency_progress SET readings_completed = ? WHERE id = ?", [JSON.stringify(['default_reading']), row.id]);
          });
        }
      });
    });
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN quizzes_completed TEXT DEFAULT '{}'", () => {
      db.all("SELECT id, quiz_passed, quiz_score, competency_id FROM staff_competency_progress WHERE quiz_passed = 1", (err, rows) => {
        if (rows) {
          rows.forEach(row => {
            db.get("SELECT id FROM quizzes WHERE competency_id = ?", [row.competency_id], (err, qz) => {
              if (qz) {
                const qc = {};
                qc[qz.id] = { passed: true, score: row.quiz_score };
                db.run("UPDATE staff_competency_progress SET quizzes_completed = ? WHERE id = ?", [JSON.stringify(qc), row.id]);
              }
            });
          });
        }
      });
    });
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN signoff_comment TEXT", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN date_reviewed TEXT", () => {});
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN reviewer_id INTEGER", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN target_users TEXT DEFAULT '[]'", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN description TEXT", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN required_plan_count INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN requires_pre_eval INTEGER DEFAULT 0", () => {
        db.run("UPDATE competencies SET requires_pre_eval = 1 WHERE self_evaluation_timing = 'pre' OR self_evaluation_timing = 'any'", (err) => {});
    });
    db.run("ALTER TABLE competencies ADD COLUMN requires_post_eval INTEGER DEFAULT 0", () => {
        db.run("UPDATE competencies SET requires_post_eval = 1 WHERE self_evaluation_timing = 'post' OR self_evaluation_timing = 'any'", (err) => {});
    });
    db.run("ALTER TABLE competencies ADD COLUMN qatrack_requirements TEXT DEFAULT '[]'", () => {
        db.all("SELECT id, required_qatrack_count, qatrack_test_identifier FROM competencies WHERE required_qatrack_count > 0 AND qatrack_test_identifier IS NOT NULL", (err, rows) => {
            if (rows) {
                rows.forEach(row => {
                    db.run("UPDATE competencies SET qatrack_requirements = ? WHERE id = ?", [JSON.stringify([{count: row.required_qatrack_count, identifier: row.qatrack_test_identifier}]), row.id]);
                });
            }
        });
    });
    db.run("ALTER TABLE staff_competency_progress ADD COLUMN qatrack_records_detail TEXT DEFAULT '{}'", () => {});
    db.run("ALTER TABLE competencies ADD COLUMN allow_file_uploads INTEGER DEFAULT 0", () => {});
    db.run(`CREATE TABLE IF NOT EXISTS file_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      competency_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      upload_date TEXT DEFAULT CURRENT_TIMESTAMP
    )`, () => {});
    db.all("PRAGMA table_info(quizzes)", (err, cols) => {
      const hasIsViva = cols && cols.some(c => c.name === 'is_viva');
      if (!hasIsViva) db.run("ALTER TABLE quizzes ADD COLUMN is_viva INTEGER DEFAULT 0", () => {});
    });
    db.all("PRAGMA table_info(patient_plan_logs)", (err, cols) => {
      const hasLogDate = cols && cols.some(c => c.name === 'log_date');
      if (!hasLogDate) db.run("ALTER TABLE patient_plan_logs ADD COLUMN log_date TEXT", () => {});
    });
  });
};

const getDb = (name) => {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  if (!dbs[safeName]) {
    const dbPath = path.resolve(__dirname, `${safeName}.db`);
    dbs[safeName] = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Error connecting to database ${safeName}:`, err.message);
      } else {
        console.log(`Connected to the SQLite database: ${safeName}.db`);
        initDb(dbs[safeName]);
      }
    });
  }
  return dbs[safeName];
};

app.use((req, res, next) => {
  const dbName = req.headers['x-database'] || 'QA';
  req.db = getDb(dbName);
  next();
});

// Helper functions to run DB queries with Promises
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

const getSections = async () => {
  const res = await query(sharedDb, "SELECT value FROM global_settings WHERE key = 'sections'");
  if (res.length > 0) return JSON.parse(res[0].value);
  return [{name: 'QA', active: true}, {name: 'Planning', active: true}, {name: 'Brachytherapy', active: true}, {name: 'SABR', active: true}];
};

function getFolderSize(dirPath) {
  let size = 0;
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += stats.size;
      }
    });
  }
  return size;
}

const syncCompetencyInternal = async (db, user_id, username, competency_id) => {
    const compQuery = await query(db, `SELECT * FROM competencies WHERE id = ?`, [competency_id]);
    if (compQuery.length === 0) return { error: 'Competency not found' };
    const comp = compQuery[0];
    let rp = [];
    try { 
      rp = JSON.parse(comp.reading_prerequisites || '[]'); 
      while(typeof rp === 'string') rp = JSON.parse(rp);
      if (!Array.isArray(rp)) rp = [];
    } catch(e) {}

    let progress = null;
    let rc = [];
    let qc = {};

    const progressQuery = await query(db, `SELECT * FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressQuery.length > 0) {
      progress = progressQuery[0];
      try { rc = JSON.parse(progress.readings_completed || '[]'); while(typeof rc === 'string') rc = JSON.parse(rc); if (!Array.isArray(rc)) rc = []; } catch(e) {}
      try { qc = JSON.parse(progress.quizzes_completed || '{}'); while(typeof qc === 'string') qc = JSON.parse(qc); if (!qc || typeof qc !== 'object' || Array.isArray(qc)) qc = {}; } catch(e) {}
    } else {
      progress = { current_status: 't', qatrack_records: null, qatrack_manual_override: 0 };
    }
      
    let requirementsMet = true;
    let missingReason = '';

    if (comp.requires_instructions) {
      for (let r of rp) {
        if (!rc.includes(r.id)) { requirementsMet = false; missingReason = `Reading prerequisite '${r.name}' not completed.`; break; }
      }
    }
    
    if (requirementsMet && comp.requires_quiz) {
        const qzs = await query(db, `SELECT q.id, q.name, q.is_viva FROM quizzes q JOIN competency_quizzes cq ON q.id = cq.quiz_id WHERE cq.competency_id = ?`, [competency_id]);
        for (let qz of qzs) {
          if (qz.is_viva) {
              const passedVivas = await query(db, `SELECT id FROM viva_evaluations WHERE trainee_id = ? AND competency_id = ? AND quiz_id = ? AND status = 'Completed' AND is_passed = 1`, [user_id, competency_id, qz.id]);
              if (passedVivas.length === 0) { requirementsMet = false; missingReason = `Viva Assessment '${qz.name}' not passed.`; break; }
          } else {
              if (!qc[qz.id] || !qc[qz.id].passed) { requirementsMet = false; missingReason = `Quiz '${qz.name}' not passed.`; break; }
          }
        }
    }
    
    if (requirementsMet && comp.requires_prerequisite_competencies) {
      let pc = [];
      try { pc = JSON.parse(comp.prerequisite_competencies || '[]'); while(typeof pc === 'string') pc = JSON.parse(pc); if (!Array.isArray(pc)) pc = []; } catch(e) {}
      for (let pcId of pc) {
        const pcProg = await query(db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, pcId]);
        if (pcProg.length === 0 || (pcProg[0].current_status !== 'c' && pcProg[0].current_status !== 'x')) { requirementsMet = false; missingReason = `Prerequisite competencies not fully met.`; break; }
      }
    }

    if (requirementsMet && comp.requires_pre_eval) {
      const evaluations = await query(db, `SELECT * FROM self_evaluations WHERE user_id = ? AND competency_id = ? AND evaluation_type = 'pre'`, [user_id, competency_id]);
      if (evaluations.length === 0) { requirementsMet = false; missingReason = 'Pre-training self-evaluation not completed.'; }
    }

    let qatrack_records_detail = {};
    try { qatrack_records_detail = JSON.parse(progress.qatrack_records_detail || '{}'); } catch(e) {}

    let reqs = [];
    try { reqs = JSON.parse(comp.qatrack_requirements || '[]'); } catch(e) {}
    if (reqs.length === 0 && comp.required_qatrack_count > 0 && comp.qatrack_test_identifier) { reqs = [{ count: comp.required_qatrack_count, identifier: comp.qatrack_test_identifier }]; }
    let hasQATrackChecks = reqs.length > 0;
    
    if (hasQATrackChecks) {
      for (const req of reqs) {
        const qaData = await fetchQATrackInstances(username, req.identifier);
        qatrack_records_detail[req.identifier] = qaData.count;
        if (qaData.count == null || qaData.count < req.count) { requirementsMet = false; if (!missingReason) missingReason = `QATrack+ missing data for ${req.identifier}: Found ${qaData.count || 0}, requires ${req.count}.`; }
      }
    }

    if (requirementsMet && comp.required_plan_count > 0) {
      const planLogs = await query(db, `SELECT id FROM patient_plan_logs WHERE trainee_id = ? AND competency_id = ? AND status = 'Completed' AND score >= 3`, [user_id, competency_id]);
      if (planLogs.length < comp.required_plan_count) { requirementsMet = false; missingReason = `Requires ${comp.required_plan_count} successful case logs (found ${planLogs.length}).`; }
    }

    let initialized = false;
    const detailStr = JSON.stringify(qatrack_records_detail);
    if (progressQuery.length === 0) { await execute(db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, qatrack_records_detail) VALUES (?, ?, 't', ?)`, [user_id, competency_id, detailStr]); initialized = true; } else if (hasQATrackChecks) { await execute(db, `UPDATE staff_competency_progress SET qatrack_records_detail = ? WHERE user_id = ? AND competency_id = ?`, [detailStr, user_id, competency_id]); }
      
    if (progress.current_status === 't' && requirementsMet) { await execute(db, `UPDATE staff_competency_progress SET current_status = 'm' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]); await execute(db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'PROMOTED_TO_M', ?, 't', 'm', 'System auto-promotion (Prerequisites met)')`, [user_id, competency_id, user_id]); return { success: true, promoted: true }; } else if ((progress.current_status === 'm' || progress.current_status === 'a') && !requirementsMet) { await execute(db, `UPDATE staff_competency_progress SET current_status = 't' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]); await execute(db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'DEMOTED_TO_T', ?, ?, 't', 'System auto-demotion (Prerequisites no longer met)')`, [user_id, competency_id, user_id, progress.current_status]); return { success: true, demoted: true, reason: missingReason }; }

    return { success: true, promoted: false, reason: missingReason || 'Milestones incomplete.', initialized };
};

app.get('/api/public/summary', async (req, res) => {
  try {
    const dbName = req.headers['x-database'] || 'QA';
    const dbInstance = getDb(dbName);
    const users = await query(sharedDb, 'SELECT id, username, full_name, designation, active_in FROM users WHERE is_active = 1');
    const competencies = await query(dbInstance, 'SELECT id, category, task_name, display_order, target_users, description FROM competencies ORDER BY display_order ASC, id ASC');
    const competencyGroups = await query(dbInstance, 'SELECT * FROM competency_groups');
    const progress = await query(dbInstance, 'SELECT user_id, competency_id, current_status, date_signed_off, date_reviewed FROM staff_competency_progress');
    const categoryOrder = await query(dbInstance, 'SELECT category, display_order FROM category_order ORDER BY display_order ASC');
    const userGroups = await query(sharedDb, 'SELECT * FROM user_groups ORDER BY display_order ASC, id ASC');
    
    const vivas = await query(dbInstance, `SELECT competency_id, trainee_answers, assessor_answers FROM viva_evaluations WHERE status = 'Completed'`);
    const compStats = {};
    vivas.forEach(v => {
      let tAnswers = {};
      let aAnswers = {};
      try { tAnswers = JSON.parse(v.trainee_answers || '{}'); } catch(e){}
      try { aAnswers = JSON.parse(v.assessor_answers || '{}'); } catch(e){}
      let totalDelta = 0; let count = 0;
      for (const qId in aAnswers) {
        if (tAnswers[qId] !== undefined) {
          totalDelta += ((parseInt(aAnswers[qId], 10) || 0) - (parseInt(tAnswers[qId], 10) || 0));
          count++;
        }
      }
      if (count > 0) {
        if (!compStats[v.competency_id]) compStats[v.competency_id] = { sumDelta: 0, count: 0 };
        compStats[v.competency_id].sumDelta += totalDelta;
        compStats[v.competency_id].count += count;
      }
    });

    const compTargetGroups = {};
    competencyGroups.forEach(cg => {
      if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
      compTargetGroups[cg.competency_id].push(cg.group_name);
    });

    competencies.forEach(c => {
      c.target_groups = compTargetGroups[c.id] || [];
      try { 
        let tu = JSON.parse(c.target_users || '[]'); 
        while(typeof tu === 'string') tu = JSON.parse(tu);
        c.target_users = Array.isArray(tu) ? tu : [];
      } catch(e) { c.target_users = []; }
      if (compStats[c.id] && compStats[c.id].count > 0) {
        c.avg_delta = compStats[c.id].sumDelta / compStats[c.id].count;
      } else {
        c.avg_delta = null;
      }
    });

    const activeUsers = [];
    for (const user of users) {
       let activeIn = [];
       try { activeIn = JSON.parse(user.active_in || '[]'); } catch(e){}
       if (activeIn.includes(dbName)) {
           activeUsers.push(user);
       }
    }
    
    res.json({
      users: activeUsers,
      competencies,
      progress,
      categoryOrder,
      userGroups
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/sections', async (req, res) => {
  try {
    const sections = await getSections();
    res.json(sections);
  } catch(error) { res.status(500).json({ error: error.message }); }
});

// --- AUTHENTICATION ---
// Basic login endpoint: Authenticates by username for this development phase.
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const dbName = req.headers['x-database'] || 'QA';
  try {
    const users = await query(sharedDb, 'SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = users[0];
    if ((user.password || '') !== (password || '')) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.is_active === 0) {
      return res.status(403).json({ error: 'Account is archived. Please contact an administrator.' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, designation: user.designation, is_admin: user.is_admin, is_superuser: user.is_superuser, dbName }, 
      SECRET_KEY, 
      { expiresIn: '8h' }
    );
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/switch-db', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const newDbName = req.headers['x-database'] || 'QA';

  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, async (err, userPayload) => {
    if (err) return res.sendStatus(403);
    
    try {
      const users = await query(sharedDb, 'SELECT * FROM users WHERE id = ?', [userPayload.id]);
      if (users.length === 0) return res.status(401).json({ error: 'User not found' });
      
      const user = users[0];
      if (user.is_active === 0) return res.status(403).json({ error: 'Account is archived.' });
      
      let activeIn = [];
      try { activeIn = JSON.parse(user.active_in || '[]'); } catch(e) {}
      if (!activeIn.includes(newDbName)) {
        return res.status(403).json({ error: 'Not authorized for this section.' });
      }

      const newToken = jwt.sign(
        { id: user.id, username: user.username, designation: user.designation, is_admin: user.is_admin, is_superuser: user.is_superuser, dbName: newDbName }, 
        SECRET_KEY, 
        { expiresIn: '8h' }
      );
      res.json({ token: newToken, user });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"
  const dbName = req.headers['x-database'] || 'QA';
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    if (user.dbName && user.dbName !== dbName) return res.status(403).json({ error: 'Token is for a different database. Please log in again.' });
    req.user = user;
    next();
  });
};

// Authorization Middleware: Require Admin flag
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.is_admin) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Requires Admin privileges.' });
  }
};

// Authorization Middleware: Require Superuser flag
const requireSuperuser = (req, res, next) => {
  if (req.user && req.user.is_superuser) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Requires Superuser privileges.' });
  }
};

const getQATrackConfig = async () => {
  const settings = await query(sharedDb, "SELECT key, value FROM global_settings WHERE key IN ('qatrack_api_url', 'qatrack_api_token')");
  let apiUrl = process.env.QATRACK_API_URL || 'http://192.168.68.101:8000/api';
  let apiToken = process.env.QATRACK_API_TOKEN || '6bf9e19b16c5d82adcee9b565ca2cba4012d8836';
  settings.forEach(s => {
    if (s.key === 'qatrack_api_url' && s.value) apiUrl = s.value;
    if (s.key === 'qatrack_api_token' && s.value) apiToken = s.value;
  });
  apiUrl = apiUrl.replace(/\/+$/, '');
  return { apiUrl, apiToken };
};

// --- QATRACK+ LIVE ENDPOINT ---
const fetchQATrackInstances = async (username, test_identifier) => {
  console.log(`[QATrack+] Fetching instances for user: ${username}, test: ${test_identifier}`);
  try {
    const { apiUrl, apiToken } = await getQATrackConfig();
    // Request only completed & reviewed items from the API
    const url = `${apiUrl}/qc/testlistinstances/?created_by__username=${username}&test_list__slug=${test_identifier}&all_reviewed=true&in_progress=false`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[QATrack+] API responded with status: ${response.status} ${response.statusText}`);
      return { count: 0, results: [] };
    }

    const data = await response.json();
      
      // Fallback filter: DRF might ignore 'all_reviewed' if it's not explicitly registered in QATrack's FilterSet.
      // We filter the returned results array to ensure they are actually approved/reviewed.
      const approvedResults = (data.results || []).filter(instance => 
        instance.all_reviewed === true && instance.in_progress === false
      );

      // Calculate a safe count
      // If the API ignored our filter, data.count will include unreviewed items. 
      let safeCount = data.count;
      if (data.results && approvedResults.length < data.results.length) {
        safeCount = approvedResults.length;
      }

      return { count: safeCount, results: approvedResults };
  } catch (error) {
    console.error(`[QATrack+] Connection error:`, error.message);
    return { count: 0, results: [] };
  }
};

// We leave this unauthenticated or mock-authenticated so it acts like an external API
app.get('/api/qa/testlistinstances/', async (req, res) => {
  const { username, test_identifier } = req.query;
  const data = await fetchQATrackInstances(username, test_identifier);
  res.json(data);
});

// --- GROUPS ---
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await query(sharedDb, 'SELECT * FROM user_groups ORDER BY display_order ASC, id ASC');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/groups', authenticateToken, requireSuperuser, async (req, res) => {
  const { name } = req.body;
  try {
    const maxOrderRes = await query(sharedDb, 'SELECT MAX(display_order) as maxOrder FROM user_groups');
    const nextOrder = (maxOrderRes[0].maxOrder || 0) + 1;
    await execute(sharedDb, 'INSERT INTO user_groups (name, display_order) VALUES (?, ?)', [name, nextOrder]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/groups/:id', authenticateToken, requireSuperuser, async (req, res) => {
  try {
    const group = await query(sharedDb, 'SELECT name FROM user_groups WHERE id = ?', [req.params.id]);
    if (group.length > 0) {
      const groupName = group[0].name;
      const sections = await getSections();
      for (const section of sections) {
        const dbInstance = getDb(section.name);
        await execute(dbInstance, 'DELETE FROM competency_groups WHERE group_name = ?', [groupName]);
      }
    }
    await execute(sharedDb, 'DELETE FROM user_groups WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/groups/reorder', authenticateToken, requireSuperuser, async (req, res) => {
  const { orderedIds } = req.body;
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await execute(sharedDb, `UPDATE user_groups SET display_order = ? WHERE id = ?`, [i, orderedIds[i]]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/groups/:id', authenticateToken, requireSuperuser, async (req, res) => {
  const { name } = req.body;
  try {
    const oldGroup = await query(sharedDb, 'SELECT name FROM user_groups WHERE id = ?', [req.params.id]);
    if (oldGroup.length > 0) {
      const oldName = oldGroup[0].name;
      const sections = await getSections();
      for (const section of sections) {
        const dbInstance = getDb(section.name);
        await execute(dbInstance, 'UPDATE competency_groups SET group_name = ? WHERE group_name = ?', [name, oldName]);
      }
      await execute(sharedDb, 'UPDATE users SET designation = ? WHERE designation = ?', [name, oldName]);
    }
    await execute(sharedDb, 'UPDATE user_groups SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- CORE API ENDPOINTS ---

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await query(sharedDb, 'SELECT id, username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in, date_in_post FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/competencies', authenticateToken, async (req, res) => {
  try {
    const competencies = await query(req.db, 'SELECT *, renewal_period_months, requires_pre_eval, requires_post_eval, required_plan_count FROM competencies ORDER BY display_order ASC, id ASC');
    const competencyGroups = await query(req.db, 'SELECT * FROM competency_groups');
    
    const groupsByComp = {};
    competencyGroups.forEach(cg => {
      if (!groupsByComp[cg.competency_id]) groupsByComp[cg.competency_id] = [];
      groupsByComp[cg.competency_id].push(cg.group_name);
    });
    
    const competencyQuizzes = await query(req.db, 'SELECT cq.competency_id, cq.quiz_id, q.is_viva FROM competency_quizzes cq JOIN quizzes q ON cq.quiz_id = q.id');
    const quizzesByComp = {};
    const hasVivaByComp = {};
    competencyQuizzes.forEach(cq => {
        if (!quizzesByComp[cq.competency_id]) quizzesByComp[cq.competency_id] = [];
        quizzesByComp[cq.competency_id].push(cq.quiz_id);
        if (cq.is_viva) hasVivaByComp[cq.competency_id] = true;
    });

    const vivas = await query(req.db, `SELECT competency_id, trainee_answers, assessor_answers FROM viva_evaluations WHERE status = 'Completed'`);
    const compStats = {};
    vivas.forEach(v => {
      let tAnswers = {};
      let aAnswers = {};
      try { tAnswers = JSON.parse(v.trainee_answers || '{}'); } catch(e){}
      try { aAnswers = JSON.parse(v.assessor_answers || '{}'); } catch(e){}
      let totalDelta = 0; let count = 0;
      for (const qId in aAnswers) {
        if (tAnswers[qId] !== undefined) {
          totalDelta += ((parseInt(aAnswers[qId], 10) || 0) - (parseInt(tAnswers[qId], 10) || 0));
          count++;
        }
      }
      if (count > 0) {
        if (!compStats[v.competency_id]) compStats[v.competency_id] = { sumDelta: 0, count: 0 };
        compStats[v.competency_id].sumDelta += totalDelta;
        compStats[v.competency_id].count += count;
      }
    });

    competencies.forEach(c => {
      c.target_groups = groupsByComp[c.id] || [];
      c.quiz_ids = quizzesByComp[c.id] || [];
      c.has_viva = hasVivaByComp[c.id] || false;
      try { 
        let rp = JSON.parse(c.reading_prerequisites || '[]'); 
        while(typeof rp === 'string') rp = JSON.parse(rp);
        c.reading_prerequisites = Array.isArray(rp) ? rp : [];
      } catch(e) { c.reading_prerequisites = []; }
      try { 
        let pc = JSON.parse(c.prerequisite_competencies || '[]'); 
        while(typeof pc === 'string') pc = JSON.parse(pc);
        c.prerequisite_competencies = Array.isArray(pc) ? pc : [];
      } catch(e) { c.prerequisite_competencies = []; }
      c.requires_prerequisite_competencies = !!c.requires_prerequisite_competencies;
      try { 
        let tu = JSON.parse(c.target_users || '[]'); 
        while(typeof tu === 'string') tu = JSON.parse(tu);
        c.target_users = Array.isArray(tu) ? tu : [];
      } catch(e) { c.target_users = []; }
      
      try {
        let qr = JSON.parse(c.qatrack_requirements || '[]');
        while(typeof qr === 'string') qr = JSON.parse(qr);
        c.qatrack_requirements = Array.isArray(qr) ? qr : [];
      } catch(e) { c.qatrack_requirements = []; }
      
      // Migration fallback for frontend if missing
      if (!c.qatrack_requirements.length && c.required_qatrack_count > 0 && c.qatrack_test_identifier) {
        c.qatrack_requirements = [{count: c.required_qatrack_count, identifier: c.qatrack_test_identifier}];
      }
      if (compStats[c.id] && compStats[c.id].count > 0) {
        c.avg_delta = compStats[c.id].sumDelta / compStats[c.id].count;
      } else {
        c.avg_delta = null;
      }
    });
    
    res.json(competencies);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/competencies', authenticateToken, requireAdmin, async (req, res) => {
  const { category, task_name, qatrack_requirements, requires_instructions, requires_quiz, quiz_ids, requires_prerequisite_competencies, prerequisite_competencies, target_groups, target_users, reading_prerequisites, renewal_period_months, description, requires_pre_eval, requires_post_eval, allow_file_uploads, required_plan_count } = req.body;
  try {
    const rpStr = JSON.stringify(reading_prerequisites || []);
    const pcStr = JSON.stringify(prerequisite_competencies || []);
    const tuStr = JSON.stringify(target_users || []);
    const qaStr = JSON.stringify(qatrack_requirements || []);
    const planCount = parseInt(required_plan_count, 10) || 0;
    await execute(req.db, 
      `INSERT INTO competencies (category, task_name, qatrack_requirements, requires_instructions, requires_quiz, requires_prerequisite_competencies, prerequisite_competencies, reading_prerequisites, renewal_period_months, target_users, description, requires_pre_eval, requires_post_eval, allow_file_uploads, required_plan_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, task_name, qaStr, requires_instructions ? 1 : 0, requires_quiz ? 1 : 0, requires_prerequisite_competencies ? 1 : 0, pcStr, rpStr, renewal_period_months || 36, tuStr, description || null, requires_pre_eval ? 1 : 0, requires_post_eval ? 1 : 0, allow_file_uploads ? 1 : 0, planCount]
    );
    const result = await query(req.db, `SELECT last_insert_rowid() AS id`);
    const comp_id = result[0].id;
    if (target_groups && target_groups.length > 0) {
      for (const g of target_groups) {
        await execute(req.db, `INSERT INTO competency_groups (competency_id, group_name) VALUES (?, ?)`, [comp_id, g]);
      }
    }
    if (requires_quiz && quiz_ids && quiz_ids.length > 0) {
      for (const quiz_id of quiz_ids) {
        await execute(req.db, `INSERT INTO competency_quizzes (competency_id, quiz_id) VALUES (?, ?)`, [comp_id, quiz_id]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/competencies/reorder', authenticateToken, requireAdmin, async (req, res) => {
  const { orderedIds } = req.body;
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await execute(req.db, `UPDATE competencies SET display_order = ? WHERE id = ?`, [i, orderedIds[i]]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/competencies/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { category, task_name, qatrack_requirements, requires_instructions, requires_quiz, quiz_ids, requires_prerequisite_competencies, prerequisite_competencies, target_groups, target_users, reading_prerequisites, renewal_period_months, description, requires_pre_eval, requires_post_eval, allow_file_uploads, required_plan_count } = req.body;
  try {
    const rpStr = JSON.stringify(reading_prerequisites || []);
    const pcStr = JSON.stringify(prerequisite_competencies || []);
    const tuStr = JSON.stringify(target_users || []);
    const qaStr = JSON.stringify(qatrack_requirements || []);
    const planCount = parseInt(required_plan_count, 10) || 0;
    await execute(req.db, 
      `UPDATE competencies SET category = ?, task_name = ?, qatrack_requirements = ?, requires_instructions = ?, requires_quiz = ?, requires_prerequisite_competencies = ?, prerequisite_competencies = ?, reading_prerequisites = ?, renewal_period_months = ?, target_users = ?, description = ?, requires_pre_eval = ?, requires_post_eval = ?, allow_file_uploads = ?, required_plan_count = ? WHERE id = ?`,
      [category, task_name, qaStr, requires_instructions ? 1 : 0, requires_quiz ? 1 : 0, requires_prerequisite_competencies ? 1 : 0, pcStr, rpStr, renewal_period_months || 36, tuStr, description || null, requires_pre_eval ? 1 : 0, requires_post_eval ? 1 : 0, allow_file_uploads ? 1 : 0, planCount, req.params.id]
    );
    await execute(req.db, `DELETE FROM competency_groups WHERE competency_id = ?`, [req.params.id]);
    if (target_groups && target_groups.length > 0) {
      for (const g of target_groups) {
        await execute(req.db, `INSERT INTO competency_groups (competency_id, group_name) VALUES (?, ?)`, [req.params.id, g]);
      }
    }
    await execute(req.db, `DELETE FROM competency_quizzes WHERE competency_id = ?`, [req.params.id]);
    if (requires_quiz && quiz_ids && quiz_ids.length > 0) {
      for (const quiz_id of quiz_ids) {
        await execute(req.db, `INSERT INTO competency_quizzes (competency_id, quiz_id) VALUES (?, ?)`, [req.params.id, quiz_id]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/competencies/:id', authenticateToken, requireAdmin, async (req, res) => {
  const compId = req.params.id;
  try {
    const fileUploads = await query(req.db, `SELECT file_path FROM file_uploads WHERE competency_id = ?`, [compId]);
    for (const file of fileUploads) {
      try {
        const absolutePath = path.join(__dirname, 'public', decodeURIComponent(file.file_path));
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
        }
      } catch (e) {
        console.warn(`Could not delete file ${file.file_path}:`, e.message);
      }
    }
    await execute(req.db, `DELETE FROM competencies WHERE id = ?`, [compId]);
    await execute(req.db, `DELETE FROM competency_groups WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM staff_competency_progress WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM competency_quizzes WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM viva_evaluations WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM self_evaluations WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM patient_plan_logs WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM competency_audit_log WHERE competency_id = ?`, [compId]);
    await execute(req.db, `DELETE FROM file_uploads WHERE competency_id = ?`, [compId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- USER MANAGEMENT ---
app.post('/api/users', authenticateToken, requireSuperuser, async (req, res) => {
  const { username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in, date_in_post } = req.body;
  try {
    await execute(sharedDb, `INSERT INTO users (username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in, date_in_post) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [username, full_name, email, designation, is_admin ? 1 : 0, is_superuser ? 1 : 0, is_active !== false ? 1 : 0, password || '', JSON.stringify(active_in || []), date_in_post || null]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireSuperuser, async (req, res) => {
  const { username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in, date_in_post } = req.body;
  try {
    await execute(sharedDb, `UPDATE users SET username=?, full_name=?, email=?, designation=?, is_admin=?, is_superuser=?, is_active=?, password=?, active_in=?, date_in_post=? WHERE id=?`, [username, full_name, email, designation, is_admin ? 1 : 0, is_superuser ? 1 : 0, is_active !== false ? 1 : 0, password || '', JSON.stringify(active_in || []), date_in_post || null, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireSuperuser, async (req, res) => {
  try {
    const userId = req.params.id;
    const sections = await getSections();
    for (const section of sections) {
      const dbInstance = getDb(section.name);
      const userUploads = await query(dbInstance, `SELECT * FROM file_uploads WHERE user_id = ?`, [userId]);
      for (const file of userUploads) {
        try {
          const absolutePath = path.join(__dirname, 'public', decodeURIComponent(file.file_path));
          if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        } catch (e) {
          console.warn(`Could not delete file ${file.file_path}:`, e.message);
        }
      }
      await execute(dbInstance, `DELETE FROM file_uploads WHERE user_id = ?`, [userId]);
      await execute(dbInstance, `DELETE FROM staff_competency_progress WHERE user_id = ?`, [userId]);
      await execute(dbInstance, `DELETE FROM viva_evaluations WHERE trainee_id = ?`, [userId]);
      await execute(dbInstance, `DELETE FROM self_evaluations WHERE user_id = ?`, [userId]);
      await execute(dbInstance, `DELETE FROM patient_plan_logs WHERE trainee_id = ?`, [userId]);
      await execute(dbInstance, `DELETE FROM competency_audit_log WHERE target_user_id = ?`, [userId]);
    }
    await execute(sharedDb, `DELETE FROM users WHERE id=?`, [userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/progress/overall', authenticateToken, async (req, res) => {
  try {
    const users = await query(sharedDb, 'SELECT id, designation, active_in FROM users WHERE is_active = 1');
    const sections = await getSections();
    const allDbNames = sections.map(s => s.name);
    
    let userStatsMap = {};
    users.forEach(u => {
      let activeIn = [];
      try { activeIn = JSON.parse(u.active_in || '[]'); } catch(e){}
      userStatsMap[u.id] = { totalApplicable: 0, completed: 0 };
      u.active_in = activeIn;
    });

    for (const dbName of allDbNames) {
      const dbInstance = getDb(dbName);
      const competencies = await query(dbInstance, 'SELECT id, category, target_users FROM competencies');
      const competencyGroups = await query(dbInstance, 'SELECT * FROM competency_groups');
      const progress = await query(dbInstance, 'SELECT user_id, competency_id, current_status FROM staff_competency_progress');
      
      const compTargetGroups = {};
      competencyGroups.forEach(cg => {
        if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
        compTargetGroups[cg.competency_id].push(cg.group_name);
      });

      for (const user of users) {
         if (!user.active_in.includes(dbName)) continue;
         const applicableCompIds = competencies.filter(c => {
             let tu = [];
             try { tu = JSON.parse(c.target_users || '[]'); } catch(e) {}
             return (compTargetGroups[c.id] || []).includes(user.designation) || tu.includes(user.id);
         }).map(c => c.id);
         const completed = progress.filter(p => p.user_id === user.id && applicableCompIds.includes(p.competency_id) && ['c', 'x'].includes(p.current_status)).length;
         
         userStatsMap[user.id].totalApplicable += applicableCompIds.length;
         userStatsMap[user.id].completed += completed;
      }
    }

    const overallProgress = {};
    for (const [userId, stats] of Object.entries(userStatsMap)) {
      overallProgress[userId] = stats.totalApplicable > 0 ? Math.round((stats.completed / stats.totalApplicable) * 100) : 0;
    }

    res.json(overallProgress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-evaluations', authenticateToken, async (req, res) => {
  try {
    const evals = await query(req.db, `SELECT * FROM self_evaluations WHERE user_id = ?`, [req.user.id]);
    res.json(evals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/category_order', authenticateToken, async (req, res) => {
  try {
    const cats = await query(req.db, 'SELECT category, display_order FROM category_order ORDER BY display_order ASC');
    res.json(cats);
  } catch (error) { res.status(500).json({error: error.message}); }
});

app.post('/api/category_order', authenticateToken, requireAdmin, async (req, res) => {
  const { categories } = req.body;
  try {
    await execute(req.db, 'DELETE FROM category_order');
    for(let i=0; i<categories.length; i++) {
      await execute(req.db, 'INSERT INTO category_order (category, display_order) VALUES (?, ?)', [categories[i], i]);
    }
    res.json({success: true});
  } catch(error) { res.status(500).json({error: error.message}); }
});

app.post('/api/categories', authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    try {
        const maxOrderRes = await query(req.db, 'SELECT MAX(display_order) as maxOrder FROM category_order');
        const nextOrder = (maxOrderRes[0].maxOrder === null ? -1 : maxOrderRes[0].maxOrder) + 1;
        await execute(req.db, 'INSERT INTO category_order (category, display_order) VALUES (?, ?)', [name, nextOrder]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/categories/rename', authenticateToken, requireAdmin, async (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'Old and new names are required.' });
    try {
        await execute(req.db, 'UPDATE competencies SET category = ? WHERE category = ?', [newName, oldName]);
        await execute(req.db, 'UPDATE category_order SET category = ? WHERE category = ?', [newName, oldName]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/categories/:name', authenticateToken, requireAdmin, async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    try {
        await execute(req.db, 'DELETE FROM category_order WHERE category = ?', [name]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/progress', authenticateToken, async (req, res) => {
  try {
    const progress = await query(req.db, 'SELECT * FROM staff_competency_progress');
    progress.forEach(p => {
      try { 
        let rc = JSON.parse(p.readings_completed || '[]'); 
        while(typeof rc === 'string') rc = JSON.parse(rc);
        p.readings_completed = Array.isArray(rc) ? rc : []; 
      } catch(e) { p.readings_completed = []; }
      try { 
        let qc = JSON.parse(p.quizzes_completed || '{}'); 
        while(typeof qc === 'string') qc = JSON.parse(qc);
        p.quizzes_completed = (qc && typeof qc === 'object' && !Array.isArray(qc)) ? qc : {}; 
      } catch(e) { p.quizzes_completed = {}; }
      try { 
        let qd = JSON.parse(p.qatrack_records_detail || '{}'); 
        while(typeof qd === 'string') qd = JSON.parse(qd);
        p.qatrack_records_detail = (qd && typeof qd === 'object' && !Array.isArray(qd)) ? qd : {}; 
      } catch(e) { p.qatrack_records_detail = {}; }
    });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- QUIZZES ---
app.get('/api/quizzes/library', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const quizzes = await query(req.db, `SELECT * FROM quizzes ORDER BY name`);
    const vivas = await query(req.db, `SELECT quiz_id, trainee_answers, assessor_answers FROM viva_evaluations WHERE status = 'Completed'`);
    const quizStatsMap = {};
    vivas.forEach(v => {
      let tAnswers = {}, aAnswers = {};
      try { tAnswers = JSON.parse(v.trainee_answers || '{}'); } catch(e){}
      try { aAnswers = JSON.parse(v.assessor_answers || '{}'); } catch(e){}
      let totalDelta = 0, totalTrainee = 0, totalAssessor = 0, count = 0;
      for (const qId in aAnswers) {
        if (tAnswers[qId] !== undefined) {
          const tScore = parseInt(tAnswers[qId], 10) || 0;
          const aScore = parseInt(aAnswers[qId], 10) || 0;
          totalDelta += (aScore - tScore);
          totalTrainee += tScore;
          totalAssessor += aScore;
          count++;
        }
      }
      if (count > 0) {
        if (!quizStatsMap[v.quiz_id]) quizStatsMap[v.quiz_id] = { sumDelta: 0, sumTrainee: 0, sumAssessor: 0, count: 0, evals: 0 };
        quizStatsMap[v.quiz_id].sumDelta += totalDelta;
        quizStatsMap[v.quiz_id].sumTrainee += totalTrainee;
        quizStatsMap[v.quiz_id].sumAssessor += totalAssessor;
        quizStatsMap[v.quiz_id].count += count;
        quizStatsMap[v.quiz_id].evals += 1;
      }
    });
    quizzes.forEach(q => {
      if (quizStatsMap[q.id] && quizStatsMap[q.id].count > 0) {
        q.avg_trainee = quizStatsMap[q.id].sumTrainee / quizStatsMap[q.id].count;
        q.avg_assessor = quizStatsMap[q.id].sumAssessor / quizStatsMap[q.id].count;
        q.avg_delta = quizStatsMap[q.id].sumDelta / quizStatsMap[q.id].count;
        q.evals_count = quizStatsMap[q.id].evals;
      } else {
        q.avg_trainee = null;
        q.avg_assessor = null;
        q.avg_delta = null;
        q.evals_count = 0;
      }
    });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/quizzes/library/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const qz = await query(req.db, `SELECT * FROM quizzes WHERE id = ?`, [req.params.id]);
        if (qz.length === 0) return res.status(404).json({error: 'Quiz not found'});
        const questions = await query(req.db, `SELECT * FROM quiz_questions WHERE quiz_id = ?`, [req.params.id]);
        const result = { ...qz[0], questions };
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/quizzes/library', authenticateToken, requireAdmin, async (req, res) => {
    const { name, passing_score_percent, questions, is_viva } = req.body;
    try {
        const result = await execute(req.db, `INSERT INTO quizzes (name, passing_score_percent, is_viva) VALUES (?, ?, ?)`, [name, passing_score_percent, is_viva ? 1 : 0]);
        const quiz_id = result.lastID;
        if (questions && questions.length > 0) {
            for (let qs of questions) {
                await execute(req.db, `INSERT INTO quiz_questions (quiz_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [quiz_id, qs.question_text, qs.question_type || 'multiple_choice', qs.option_a, qs.option_b, qs.option_c, qs.option_d, qs.correct_option]);
            }
        }
        res.json({ success: true, id: quiz_id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/quizzes/library/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name, passing_score_percent, questions, is_viva } = req.body;
    const quiz_id = req.params.id;
    try {
        await execute(req.db, `UPDATE quizzes SET name = ?, passing_score_percent = ?, is_viva = ? WHERE id = ?`, [name, passing_score_percent, is_viva ? 1 : 0, quiz_id]);
        await execute(req.db, `DELETE FROM quiz_questions WHERE quiz_id = ?`, [quiz_id]);
        if (questions && questions.length > 0) {
            for (let qs of questions) {
                await execute(req.db, `INSERT INTO quiz_questions (quiz_id, question_text, question_type, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [quiz_id, qs.question_text, qs.question_type || 'multiple_choice', qs.option_a, qs.option_b, qs.option_c, qs.option_d, qs.correct_option]);
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/quizzes/library/:id', authenticateToken, requireAdmin, async (req, res) => {
    const quiz_id = parseInt(req.params.id, 10);
    try {
        await execute(req.db, `DELETE FROM quizzes WHERE id = ?`, [quiz_id]);
        await execute(req.db, `DELETE FROM quiz_questions WHERE quiz_id = ?`, [quiz_id]);
        await execute(req.db, `DELETE FROM competency_quizzes WHERE quiz_id = ?`, [quiz_id]);
        await execute(req.db, `DELETE FROM viva_evaluations WHERE quiz_id = ?`, [quiz_id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/competency/:id/quiz', authenticateToken, async (req, res) => {
  try {
    const qzs = await query(req.db, `SELECT q.* FROM quizzes q JOIN competency_quizzes cq ON q.id = cq.quiz_id WHERE cq.competency_id = ?`, [req.params.id]);
    const result = [];
    for (let qz of qzs) {
      const questions = await query(req.db, `SELECT id, question_text, question_type, option_a, option_b, option_c, option_d FROM quiz_questions WHERE quiz_id = ?`, [qz.id]);
      result.push({ ...qz, questions }); // correct_option intentionally omitted for trainees
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/competency/:id/submit-quiz', authenticateToken, async (req, res) => {
  const { quiz_id, answers } = req.body;
  const user_id = req.user.id;
  try {
    const qz = await query(req.db, `SELECT q.* FROM quizzes q JOIN competency_quizzes cq ON q.id = cq.quiz_id WHERE q.id = ? AND cq.competency_id = ?`, [quiz_id, req.params.id]);
    if (qz.length === 0) return res.status(404).json({ error: "Quiz missing." });
    const quiz = qz[0];
    const questions = await query(req.db, `SELECT * FROM quiz_questions WHERE quiz_id = ?`, [quiz.id]);
    
    let correct = 0;
    for (let q of questions) {
      if (q.question_type === 'short_answer') {
        if ((answers[q.id] || '').toString().trim().toLowerCase() === (q.correct_option || '').toString().trim().toLowerCase()) correct++;
      } else {
        if (answers[q.id] === q.correct_option) correct++;
      }
    }
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= quiz.passing_score_percent;
  
    const check = await query(req.db, `SELECT id, quizzes_completed FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, req.params.id]);
    let quizzes_completed = {};
    if (check.length === 0) {
      quizzes_completed[quiz_id] = { passed, score, answers };
      await execute(req.db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, quizzes_completed) VALUES (?, ?, 't', ?)`, [user_id, req.params.id, JSON.stringify(quizzes_completed)]);
    } else {
      try { 
        quizzes_completed = JSON.parse(check[0].quizzes_completed || '{}'); 
        while(typeof quizzes_completed === 'string') quizzes_completed = JSON.parse(quizzes_completed);
        if (!quizzes_completed || typeof quizzes_completed !== 'object' || Array.isArray(quizzes_completed)) quizzes_completed = {};
      } catch(e) {}
      
      const existing = quizzes_completed[quiz_id];
      if (!existing || !existing.passed || passed) {
        quizzes_completed[quiz_id] = { passed, score, answers };
        await execute(req.db, `UPDATE staff_competency_progress SET quizzes_completed = ? WHERE user_id = ? AND competency_id = ?`, [JSON.stringify(quizzes_completed), user_id, req.params.id]);
      }
    }
    
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'QUIZ_ATTEMPT', ?, ?)`, [user_id, req.params.id, user_id, `Attempted quiz '${quiz.name}'. Score: ${score}%. Passed: ${passed}`]);
    res.json({ score, passed, passing_score: quiz.passing_score_percent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/competency/:id/qatrack-evidence', authenticateToken, async (req, res) => {
  const competency_id = parseInt(req.params.id, 10);
  const target_user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
  
  try {
    const compQuery = await query(req.db, `SELECT required_qatrack_count, qatrack_test_identifier, qatrack_requirements FROM competencies WHERE id = ?`, [competency_id]);
    if (compQuery.length === 0) return res.status(404).json({ error: 'Competency not found' });
    
    const comp = compQuery[0];
    let reqs = [];
    try { reqs = JSON.parse(comp.qatrack_requirements || '[]'); } catch(e) {}
    
    if (reqs.length === 0 && comp.required_qatrack_count > 0 && comp.qatrack_test_identifier) {
      reqs = [{ count: comp.required_qatrack_count, identifier: comp.qatrack_test_identifier }];
    }

    if (reqs.length === 0) {
      return res.json([]);
    }

    const userQuery = await query(sharedDb, `SELECT username FROM users WHERE id = ?`, [target_user_id]);
    if (userQuery.length === 0) return res.status(404).json({ error: 'User not found' });
    const target_username = userQuery[0].username;

    const allEvidence = [];

    for (const req of reqs) {
      const qaData = await fetchQATrackInstances(target_username, req.identifier);
      
      const sortedResults = (qaData.results || []).sort((a, b) => new Date(b.work_completed) - new Date(a.work_completed));
      const recentInstances = sortedResults.slice(0, req.count);
      const recentEvidence = [];
      const allDates = sortedResults.map(r => r.work_completed);
      
      for (const instance of recentInstances) {
        let reviewerName = 'System/Unknown';
        if (instance.reviewed_by) {
          if (!global.qaReviewerCache) global.qaReviewerCache = {};
          if (global.qaReviewerCache[instance.reviewed_by]) {
            reviewerName = global.qaReviewerCache[instance.reviewed_by];
          } else {
            try {
              const { apiToken } = await getQATrackConfig();
              const rRes = await fetch(instance.reviewed_by, {
                headers: {
                  'Authorization': `Token ${apiToken}`,
                  'Accept': 'application/json'
                }
              });
              if (rRes.ok) {
                const rData = await rRes.json();
                reviewerName = rData.username || rData.first_name + ' ' + rData.last_name || instance.reviewed_by;
                global.qaReviewerCache[instance.reviewed_by] = reviewerName;
              }
            } catch (e) {}
          }
        }
        recentEvidence.push({
          date: instance.work_completed,
          reviewed_by: reviewerName,
          url: instance.site_url || instance.url
        });
      }

      allEvidence.push({
        identifier: req.identifier,
        required: req.count,
        found: qaData.count,
        evidence: recentEvidence,
        all_dates: allDates
      });
    }

    res.json(allEvidence);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/competency/:id/evaluations', authenticateToken, async (req, res) => {
  const competency_id = parseInt(req.params.id, 10);
  const user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
  try {
    const evaluations = await query(req.db, `SELECT * FROM self_evaluations WHERE user_id = ? AND competency_id = ? ORDER BY submission_date DESC`, [user_id, competency_id]);
    res.json(evaluations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/competency/:id/evaluations', authenticateToken, async (req, res) => {
  const competency_id = parseInt(req.params.id, 10);
  const user_id = parseInt(req.user.id, 10);
  const { evaluation_type, score_a, score_b, score_c } = req.body;

  const sA = parseInt(score_a, 10);
  const sB = parseInt(score_b, 10);
  const sC = parseInt(score_c, 10);

  if (!['pre', 'post'].includes(evaluation_type) || ![1,2,3,4,5].includes(sA) || ![1,2,3,4,5].includes(sB) || ![1,2,3,4,5].includes(sC)) {
    return res.status(400).json({ error: 'Invalid evaluation data provided.' });
  }
  try {
    await execute(req.db, `INSERT INTO self_evaluations (user_id, competency_id, evaluation_type, score_a, score_b, score_c) VALUES (?, ?, ?, ?, ?, ?)`, [user_id, competency_id, evaluation_type, sA, sB, sC]);
    
    let promotedToA = false;
    if (evaluation_type === 'post' && sA >= 3 && sB >= 3 && sC >= 3) {
      const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      if (progressCheck.length > 0 && progressCheck[0].current_status === 'm') {
        await execute(req.db, `UPDATE staff_competency_progress SET current_status = 'a' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
        await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'REQUESTED_ASSESSMENT', ?, 'm', 'a', 'User automatically requested assessment by passing post-training evaluation')`, [user_id, competency_id, user_id]);
        promotedToA = true;
      }
    }

    res.json({ success: true, promotedToA });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/competency/:id/upload', authenticateToken, async (req, res) => {
  const competency_id = parseInt(req.params.id, 10);
  const user_id = req.user.id;
  const dbName = req.headers['x-database'] || 'QA';
  const { file_name, file_data } = req.body;
  if (!file_name || !file_data) return res.status(400).json({error: 'Missing file'});
  try {
    const uploadDir = path.join(__dirname, 'public', 'uploads', dbName, `competency_${competency_id}`, `user_${user_id}`);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const base64Data = file_data.replace(/^data:.*,/, '');
    const filePath = path.join(uploadDir, file_name);
    fs.writeFileSync(filePath, base64Data, 'base64');
    const webPath = `/uploads/${encodeURIComponent(dbName)}/competency_${competency_id}/user_${user_id}/${encodeURIComponent(file_name)}`;
    await execute(req.db, `DELETE FROM file_uploads WHERE user_id = ? AND competency_id = ? AND file_name = ?`, [user_id, competency_id, file_name]);
    await execute(req.db, `INSERT INTO file_uploads (user_id, competency_id, file_name, file_path) VALUES (?, ?, ?, ?)`, [user_id, competency_id, file_name, webPath]);
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/competency/:id/files', authenticateToken, async (req, res) => {
  const competency_id = parseInt(req.params.id, 10);
  const target_user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
  try {
    const files = await query(req.db, `SELECT * FROM file_uploads WHERE user_id = ? AND competency_id = ? ORDER BY upload_date DESC`, [target_user_id, competency_id]);
    res.json(files);
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/competency/:comp_id/files/:file_id', authenticateToken, async (req, res) => {
  const comp_id = parseInt(req.params.comp_id, 10);
  const file_id = parseInt(req.params.file_id, 10);
  const user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
  try {
    const files = await query(req.db, `SELECT * FROM file_uploads WHERE id = ? AND competency_id = ? AND user_id = ?`, [file_id, comp_id, user_id]);
    if (files.length > 0) {
      const absolutePath = path.join(__dirname, 'public', decodeURIComponent(files[0].file_path));
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
      await execute(req.db, `DELETE FROM file_uploads WHERE id = ?`, [file_id]);
    }
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// --- PATIENT PLANNING CASE LOGBOOK & ASSESSOR GATEWAY ---
app.get('/api/competencies/:id/eligible-assessors', authenticateToken, async (req, res) => {
  try {
    const progress = await query(req.db, `SELECT user_id FROM staff_competency_progress WHERE competency_id = ? AND current_status IN ('x', 'x+')`, [req.params.id]);
    if (progress.length === 0) return res.json([]);
    const userIds = progress.map(p => p.user_id);
    const placeholders = userIds.map(() => '?').join(',');
    const users = await query(sharedDb, `SELECT id, full_name, designation, is_admin, is_superuser FROM users WHERE is_active = 1 AND id IN (${placeholders})`, userIds);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/planning-logs/submit', authenticateToken, async (req, res) => {
  const { competency_id, patient_reference, log_date, trainee_comments, assigned_assessor_id, is_draft } = req.body;
  const trainee_id = req.user.id;
  if (!competency_id || !patient_reference) return res.status(400).json({ error: "Missing required fields" });
  try {
    const status = is_draft ? 'Draft' : 'Pending_Review';
    let assessor_id = assigned_assessor_id || 0;
    if (!is_draft && !assessor_id) return res.status(400).json({ error: "Missing assessor" });
    
    if (!is_draft) {
      const check = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [assessor_id, competency_id]);
      if (check.length === 0 || !['x', 'x+'].includes(check[0].current_status)) return res.status(400).json({ error: "Selected assessor is not eligible for this competency." });
    }
    await execute(req.db, `INSERT INTO patient_plan_logs (trainee_id, competency_id, patient_reference, log_date, trainee_comments, assigned_assessor_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [trainee_id, competency_id, patient_reference, log_date || null, trainee_comments || '', assessor_id, status]);
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, ?, ?, ?)`, [trainee_id, competency_id, is_draft ? 'CASE_LOG_DRAFTED' : 'CASE_LOG_SUBMITTED', trainee_id, is_draft ? `Saved draft case log for patient ${patient_reference}` : `Submitted case log for patient ${patient_reference} to assessor ID ${assessor_id}`]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/planning-logs/:id', authenticateToken, async (req, res) => {
  const { patient_reference, log_date, trainee_comments, assigned_assessor_id, is_draft } = req.body;
  const trainee_id = req.user.id;
  const logId = req.params.id;
  try {
    const log = await query(req.db, `SELECT * FROM patient_plan_logs WHERE id = ? AND trainee_id = ?`, [logId, trainee_id]);
    if (log.length === 0) return res.status(404).json({ error: "Log not found" });
    if (!['Draft', 'Pending_Review'].includes(log[0].status)) return res.status(400).json({ error: "Cannot edit an assessed log." });
    const status = is_draft ? 'Draft' : 'Pending_Review';
    let assessor_id = assigned_assessor_id || 0;
    if (!is_draft && !assessor_id) return res.status(400).json({ error: "Missing assessor" });
    if (!is_draft) {
      const check = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [assessor_id, log[0].competency_id]);
      if (check.length === 0 || !['x', 'x+'].includes(check[0].current_status)) return res.status(400).json({ error: "Selected assessor is not eligible for this competency." });
    }
    await execute(req.db, `UPDATE patient_plan_logs SET patient_reference = ?, log_date = ?, trainee_comments = ?, assigned_assessor_id = ?, status = ? WHERE id = ?`, [patient_reference, log_date || null, trainee_comments || '', assessor_id, status, logId]);
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, ?, ?, ?)`, [trainee_id, log[0].competency_id, is_draft ? 'CASE_LOG_DRAFT_UPDATED' : 'CASE_LOG_SUBMITTED', trainee_id, is_draft ? `Updated draft case log ${patient_reference}` : `Submitted case log ${patient_reference} to assessor ID ${assessor_id}`]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/planning-logs/:id', authenticateToken, async (req, res) => {
  const trainee_id = req.user.id;
  const logId = req.params.id;
  try {
    const log = await query(req.db, `SELECT * FROM patient_plan_logs WHERE id = ? AND trainee_id = ?`, [logId, trainee_id]);
    if (log.length === 0) return res.status(404).json({ error: "Log not found" });
    if (!['Draft', 'Pending_Review'].includes(log[0].status)) return res.status(400).json({ error: "Cannot delete an assessed log." });
    await execute(req.db, `DELETE FROM patient_plan_logs WHERE id = ?`, [logId]);
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'CASE_LOG_DELETED', ?, ?)`, [trainee_id, log[0].competency_id, trainee_id, `Deleted case log ${log[0].patient_reference}`]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my-planning-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await query(req.db, `SELECT * FROM patient_plan_logs WHERE trainee_id = ? ORDER BY created_at DESC`, [req.user.id]);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/competency/:id/planning-logs', authenticateToken, async (req, res) => {
  const target_user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : req.user.id;
  try {
    const logs = await query(req.db, `SELECT * FROM patient_plan_logs WHERE trainee_id = ? AND competency_id = ? ORDER BY created_at DESC`, [target_user_id, req.params.id]);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/assessor/feedback-queue', authenticateToken, async (req, res) => {
  try {
    const logs = await query(req.db, `SELECT p.*, c.task_name, c.category FROM patient_plan_logs p JOIN competencies c ON p.competency_id = c.id WHERE p.assigned_assessor_id = ? AND p.status = 'Pending_Review' ORDER BY p.created_at ASC`, [req.user.id]);
    const users = await query(sharedDb, `SELECT id, full_name FROM users`);
    const userMap = {}; users.forEach(u => userMap[u.id] = u.full_name);
    logs.forEach(l => l.trainee_name = userMap[l.trainee_id] || 'Unknown');
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/planning-logs/review/:id', authenticateToken, async (req, res) => {
  const { score, assessor_comments } = req.body;
  const logId = req.params.id;
  try {
    const log = await query(req.db, `SELECT * FROM patient_plan_logs WHERE id = ?`, [logId]);
    if (log.length === 0) return res.status(404).json({ error: "Log not found" });
    if (log[0].assigned_assessor_id !== req.user.id && !req.user.is_superuser) return res.status(403).json({ error: "Unauthorized" });
    const status = score >= 3 ? 'Completed' : 'Needs_Amendment';
    await execute(req.db, `UPDATE patient_plan_logs SET score = ?, assessor_comments = ?, status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, [score, assessor_comments || null, status, logId]);
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'CASE_LOG_REVIEWED', ?, ?)`, [log[0].trainee_id, log[0].competency_id, req.user.id, `Reviewed case log ${log[0].patient_reference}. Score: ${score}. Status: ${status}`]);
    
    const trainee = await query(sharedDb, `SELECT username FROM users WHERE id = ?`, [log[0].trainee_id]);
    if (trainee.length > 0) {
      await syncCompetencyInternal(req.db, log[0].trainee_id, trainee[0].username, log[0].competency_id);
    }
    
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- STRUCTURED VIVA ASSESSMENTS ---
app.post('/api/viva/submit-self', authenticateToken, async (req, res) => {
  const { competency_id, quiz_id, assigned_assessor_id, trainee_answers } = req.body;
  const trainee_id = req.user.id;
  try {
    const check = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [assigned_assessor_id, competency_id]);
    if (check.length === 0 || !['x', 'x+'].includes(check[0].current_status)) return res.status(400).json({ error: "Selected assessor is not eligible." });
    
    const adminCheck = await query(sharedDb, `SELECT is_admin, is_superuser FROM users WHERE id = ?`, [assigned_assessor_id]);
    if (adminCheck.length === 0 || (!adminCheck[0].is_admin && !adminCheck[0].is_superuser)) {
        return res.status(400).json({ error: "Selected user is not an Assessor." });
    }

    await execute(req.db, `INSERT INTO viva_evaluations (trainee_id, competency_id, quiz_id, assigned_assessor_id, trainee_answers) VALUES (?, ?, ?, ?, ?)`, 
      [trainee_id, competency_id, quiz_id, assigned_assessor_id, JSON.stringify(trainee_answers)]);
      
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'VIVA_SUBMITTED', ?, ?)`, 
      [trainee_id, competency_id, trainee_id, `Submitted Viva Self-Assessment for quiz ID ${quiz_id} to assessor ID ${assigned_assessor_id}`]);
      
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/assessor/viva-queue', authenticateToken, async (req, res) => {
  try {
    const vivas = await query(req.db, `SELECT v.*, q.name as quiz_name, c.task_name, c.category FROM viva_evaluations v JOIN quizzes q ON v.quiz_id = q.id JOIN competencies c ON v.competency_id = c.id WHERE v.assigned_assessor_id = ? AND v.status = 'Assessor_Pending' ORDER BY v.created_at ASC`, [req.user.id]);
    const users = await query(sharedDb, `SELECT id, full_name FROM users`);
    const userMap = {}; users.forEach(u => userMap[u.id] = u.full_name);
    for (let v of vivas) {
      v.trainee_name = userMap[v.trainee_id] || 'Unknown';
      v.questions = await query(req.db, `SELECT id, question_text FROM quiz_questions WHERE quiz_id = ?`, [v.quiz_id]);
    }
    res.json(vivas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/viva/submit-review/:id', authenticateToken, async (req, res) => {
  const { assessor_answers, is_passed } = req.body;
  const vivaId = req.params.id;
  try {
    const viva = await query(req.db, `SELECT * FROM viva_evaluations WHERE id = ?`, [vivaId]);
    if (viva.length === 0) return res.status(404).json({ error: "Viva not found" });
    if (viva[0].assigned_assessor_id !== req.user.id && !req.user.is_superuser) return res.status(403).json({ error: "Unauthorized" });
    
    const status = is_passed === 1 ? 'Completed' : 'Needs_Retake';
    await execute(req.db, `UPDATE viva_evaluations SET assessor_answers = ?, is_passed = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [JSON.stringify(assessor_answers), is_passed, status, vivaId]);
      
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'VIVA_REVIEWED', ?, ?)`, 
      [viva[0].trainee_id, viva[0].competency_id, req.user.id, `Reviewed Viva ID ${vivaId}. Status: ${status}`]);
      
    const trainee = await query(sharedDb, `SELECT username FROM users WHERE id = ?`, [viva[0].trainee_id]);
    if (trainee.length > 0) {
      await syncCompetencyInternal(req.db, viva[0].trainee_id, trainee[0].username, viva[0].competency_id);
    }
      
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/viva/summary/:user_id/:competency_id', authenticateToken, async (req, res) => {
  const { user_id, competency_id } = req.params;
  try {
    const evals = await query(req.db, `SELECT v.*, q.name as quiz_name FROM viva_evaluations v JOIN quizzes q ON v.quiz_id = q.id WHERE v.trainee_id = ? AND v.competency_id = ? ORDER BY v.created_at DESC`, [user_id, competency_id]);
    for (let ev of evals) {
      ev.questions = await query(req.db, `SELECT id, question_text FROM quiz_questions WHERE quiz_id = ?`, [ev.quiz_id]);
      try { ev.trainee_answers = JSON.parse(ev.trainee_answers || '{}'); } catch(e) { ev.trainee_answers = {}; }
      try { ev.assessor_answers = JSON.parse(ev.assessor_answers || '{}'); } catch(e) { ev.assessor_answers = {}; }
      ev.variance_analysis = ev.questions.map(q => {
        const tScore = parseInt(ev.trainee_answers[q.id], 10) || 0;
        const aScore = parseInt(ev.assessor_answers[q.id], 10) || 0;
        const variance = aScore - tScore;
        let flag = 'Calibrated Alignment';
        if (variance <= -3) flag = 'Imposter Alert';
        else if (variance >= 3) flag = 'Overconfidence Danger';
        return { question_id: q.id, question_text: q.question_text, trainee_score: tScore, assessor_score: aScore, variance, flag };
      });
    }
    res.json(evals);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MILESTONE TRACKING & AUTOMATION ---
app.post('/api/competency/milestone', authenticateToken, async (req, res) => {
  const { competency_id, milestone, value, reading_id } = req.body;
  const user_id = req.user.id;
  
  try {
    const check = await query(req.db, `SELECT id, readings_completed FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    let readings_completed = [];
    if (check.length === 0) {
      if (milestone === 'reading' && value) readings_completed.push(reading_id);
      await execute(req.db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, readings_completed) VALUES (?, ?, 't', ?)`, [user_id, competency_id, JSON.stringify(readings_completed)]);
    } else {
      try { 
        readings_completed = JSON.parse(check[0].readings_completed || '[]'); 
        while(typeof readings_completed === 'string') readings_completed = JSON.parse(readings_completed);
        if (!Array.isArray(readings_completed)) readings_completed = [];
      } catch(e) {}
      if (milestone === 'reading') {
        if (value && !readings_completed.includes(reading_id)) readings_completed.push(reading_id);
        else if (!value) readings_completed = readings_completed.filter(id => id !== reading_id);
        await execute(req.db, `UPDATE staff_competency_progress SET readings_completed = ? WHERE user_id = ? AND competency_id = ?`, [JSON.stringify(readings_completed), user_id, competency_id]);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/competency/sync', authenticateToken, async (req, res) => {
  const { competency_id } = req.body;
  const user_id = req.user.id;
  const username = req.user.username; // Derived from JWT payload

  try {
    const result = await syncCompetencyInternal(req.db, req.user.id, req.user.username, req.body.competency_id);
    if (result.error) return res.status(404).json(result);
    return res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/competency/request-assessment', authenticateToken, async (req, res) => {
  const { competency_id } = req.body;
  const user_id = req.user.id;
  try {
    const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressCheck.length > 0 && progressCheck[0].current_status === 'm') {
      const compQuery = await query(req.db, `SELECT requires_post_eval FROM competencies WHERE id = ?`, [competency_id]);
      if (compQuery.length > 0 && compQuery[0].requires_post_eval) {
        const evaluations = await query(req.db, `SELECT * FROM self_evaluations WHERE user_id = ? AND competency_id = ? AND evaluation_type = 'post' ORDER BY submission_date DESC LIMIT 1`, [user_id, competency_id]);
        if (evaluations.length === 0 || evaluations[0].score_a < 3 || evaluations[0].score_b < 3 || evaluations[0].score_c < 3) {
          return res.status(400).json({ error: 'You must pass the Post-Training Self-Evaluation (score 3+ on all dimensions) before requesting assessment.' });
        }
      }

      await execute(req.db, `UPDATE staff_competency_progress SET current_status = 'a' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'REQUESTED_ASSESSMENT', ?, 'm', 'a', 'User requested assessment')`, [user_id, competency_id, user_id]);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Not eligible to request assessment' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/competency/revert-assessment', authenticateToken, async (req, res) => {
  const { competency_id } = req.body;
  const user_id = req.user.id;
  try {
    const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressCheck.length > 0 && progressCheck[0].current_status === 'a') {
      await execute(req.db, `UPDATE staff_competency_progress SET current_status = 'm' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'REVERTED_TO_M', ?, 'a', 'm', 'User manually reverted assessment request')`, [user_id, competency_id, user_id]);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Cannot revert from current status' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RENEWAL MANAGEMENT ---
app.post('/api/competency/renew', authenticateToken, async (req, res) => {
  const { competency_id } = req.body;
  const user_id = req.user.id;
  try {
    const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressCheck.length > 0 && (progressCheck[0].current_status === 'm' || progressCheck[0].current_status === 'c' || progressCheck[0].current_status === 'x')) {
      await execute(req.db, `UPDATE staff_competency_progress SET date_reviewed = CURRENT_DATE, reviewer_id = ? WHERE user_id = ? AND competency_id = ?`, [user_id, user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'RENEWED', ?, 'User confirmed ongoing competence')`, [user_id, competency_id, user_id]);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Cannot renew: Not fully signed off.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/competency/request-reassessment', authenticateToken, async (req, res) => {
  const { competency_id } = req.body;
  const user_id = req.user.id;
  try {
    const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressCheck.length > 0 && (progressCheck[0].current_status === 'm' || progressCheck[0].current_status === 'c' || progressCheck[0].current_status === 'x')) {
      const prev = progressCheck[0].current_status;
      await execute(req.db, `UPDATE staff_competency_progress SET current_status = 't', date_signed_off = NULL, assessor_id = NULL, signoff_comment = NULL, date_reviewed = NULL, reviewer_id = NULL WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'REQUESTED_REASSESSMENT', ?, ?, 't', 'User requested re-assessment')`, [user_id, competency_id, user_id, prev]);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Cannot request reassessment: Not fully signed off.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ASSESSOR SIGN-OFF ---
app.post('/api/competency/signoff', authenticateToken, async (req, res) => {
  const { trainee_id, competency_id, action_type, comment } = req.body; // action_type: 'm', 'c', or 'x'
  const assessor_id = req.user.id;

  try {
    const assessorCheck = await query(req.db, 
      `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`,
      [assessor_id, competency_id]
    );
    if (assessorCheck.length === 0 || assessorCheck[0].current_status !== 'x') {
      return res.status(403).json({ error: "Access Denied: Assessor lacks 'x' authorization for this task." });
    }

    const traineeCheck = await query(req.db, 
      `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`,
      [trainee_id, competency_id]
    );
    if (traineeCheck.length === 0 || traineeCheck[0].current_status !== 'a') {
      return res.status(400).json({ error: "Cannot sign off: Trainee has not fulfilled all prerequisites." });
    }

    let q = `UPDATE staff_competency_progress SET current_status = ?, date_signed_off = CURRENT_DATE, assessor_id = ?, date_reviewed = NULL, reviewer_id = NULL`;
    let params = [action_type, assessor_id];
    if (action_type === 'c' || action_type === 'x') {
      q += `, signoff_comment = ?`;
      params.push(comment || null);
    } else {
      q += `, signoff_comment = NULL`;
    }
    q += ` WHERE user_id = ? AND competency_id = ?`;
    params.push(trainee_id, competency_id);

    await execute(req.db, q, params);
    await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'FINAL_SIGN_OFF', ?, 'a', ?, ?)`, [trainee_id, competency_id, assessor_id, action_type, `Signed off by assessor ID ${assessor_id}. Comment: ${comment || 'None'}`]);

    res.json({ success: true, message: "Competency signed off and audited successfully." });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error during sign-off execution." });
  }
});

// --- ADMIN OVERRIDES ---
app.post('/api/progress/admin-force-status', authenticateToken, requireSuperuser, async (req, res) => {
  const { user_id, competency_id, status, signoff_comment, date_override } = req.body;
  const admin_id = req.user.id;

  if (!['t', 'm', 'a', 'c', 'x'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const progressCheck = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    const previousStatus = progressCheck.length > 0 ? progressCheck[0].current_status : 't';
    
    if (progressCheck.length === 0) {
      const dateExpr = date_override ? '?' : 'CURRENT_DATE';
      const q = `INSERT INTO staff_competency_progress (user_id, competency_id, current_status${(status === 'c' || status === 'x') ? ', date_signed_off, assessor_id, signoff_comment' : ''}) VALUES (?, ?, ?${(status === 'c' || status === 'x') ? `, ${dateExpr}, ?, ?` : ''})`;
      const params = [user_id, competency_id, status];
      if (status === 'c' || status === 'x') {
        if (date_override) params.push(date_override);
        params.push(admin_id, signoff_comment || null);
      }
      await execute(req.db, q, params);
    } else {
      let q = `UPDATE staff_competency_progress SET current_status = ?`;
      let params = [status];
      if (status === 't' || status === 'm' || status === 'a') {
        q += `, date_signed_off = NULL, assessor_id = NULL, signoff_comment = NULL, date_reviewed = NULL, reviewer_id = NULL`;
      } else if ((status === 'c' || status === 'x') && (previousStatus === 't' || previousStatus === 'm' || previousStatus === 'a')) {
        const dateExpr = date_override ? '?' : 'CURRENT_DATE';
        q += `, date_signed_off = ${dateExpr}, assessor_id = ?, signoff_comment = ?, date_reviewed = NULL, reviewer_id = NULL`;
        if (date_override) params.push(date_override);
        params.push(admin_id, signoff_comment || null);
      } else if (status === 'c' || status === 'x') {
        q += `, signoff_comment = ?`;
        params.push(signoff_comment || null);
        if (date_override) {
          q += `, date_signed_off = ?, date_reviewed = NULL, reviewer_id = NULL`;
          params.push(date_override);
        }
      }
      q += ` WHERE user_id = ? AND competency_id = ?`;
      params.push(user_id, competency_id);
      
      await execute(req.db, q, params);
    }
    
    await execute(req.db, 
      `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'ADMIN_FORCE_STATUS', ?, ?, ?, 'Admin forced status change')`,
      [user_id, competency_id, admin_id, previousStatus, status]
    );
    res.json({ success: true, message: "Status successfully updated." });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error during status force." });
  }
});

app.post('/api/progress/admin-update', authenticateToken, requireSuperuser, async (req, res) => {
  const { user_id, competency_id, readings_completed } = req.body;
  const admin_id = req.user.id;

  try {
    const rcStr = JSON.stringify(readings_completed || []);
    const check = await query(req.db, `SELECT id FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (check.length === 0) {
      await execute(req.db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, readings_completed) VALUES (?, ?, 't', ?)`, 
        [user_id, competency_id, rcStr]);
    } else {
      await execute(req.db, `UPDATE staff_competency_progress SET readings_completed = ? WHERE user_id = ? AND competency_id = ?`, 
        [rcStr, user_id, competency_id]);
    }
    await execute(req.db, 
      `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'ADMIN_OVERRIDE', ?, 'Admin updated prerequisites manually')`,
      [user_id, competency_id, admin_id]
    );
    res.json({ success: true, message: "Progress updated manually." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/progress/admin-reset-quiz', authenticateToken, requireSuperuser, async (req, res) => {
  const { user_id, competency_id, quiz_id } = req.body;
  const admin_id = req.user.id;
  try {
    if (quiz_id) {
      await execute(req.db, `DELETE FROM viva_evaluations WHERE trainee_id = ? AND competency_id = ? AND quiz_id = ?`, [user_id, competency_id, quiz_id]);
    } else {
      await execute(req.db, `DELETE FROM viva_evaluations WHERE trainee_id = ? AND competency_id = ?`, [user_id, competency_id]);
    }

    const check = await query(req.db, `SELECT id, current_status, quizzes_completed FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (check.length > 0) {
      let qc = {};
      try { 
        qc = JSON.parse(check[0].quizzes_completed || '{}'); 
        while(typeof qc === 'string') qc = JSON.parse(qc);
        if (!qc || typeof qc !== 'object' || Array.isArray(qc)) qc = {};
      } catch(e) {}
      if (quiz_id) {
        delete qc[quiz_id];
      } else {
        qc = {};
      }
      
      let new_status = check[0].current_status;
      if (['m', 'a', 'c', 'x'].includes(new_status)) {
        new_status = 't';
        await execute(req.db, `UPDATE staff_competency_progress SET quizzes_completed = ?, current_status = ?, date_signed_off = NULL, assessor_id = NULL, signoff_comment = NULL, date_reviewed = NULL, reviewer_id = NULL WHERE user_id = ? AND competency_id = ?`, [JSON.stringify(qc), new_status, user_id, competency_id]);
      } else {
        await execute(req.db, `UPDATE staff_competency_progress SET quizzes_completed = ? WHERE user_id = ? AND competency_id = ?`, [JSON.stringify(qc), user_id, competency_id]);
      }
    }
    await execute(req.db, 
      `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'ADMIN_QUIZ_RESET', ?, 'Admin reset quiz progress')`,
      [user_id, competency_id, admin_id]
    );
    res.json({ success: true, message: "Quiz progress reset." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/progress/admin-reset-eval', authenticateToken, requireSuperuser, async (req, res) => {
  const { user_id, competency_id, eval_type } = req.body;
  const admin_id = req.user.id;
  try {
    const check = await query(req.db, `SELECT id, current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    
    if (eval_type === 'pre') {
      await execute(req.db, `DELETE FROM self_evaluations WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    } else {
      await execute(req.db, `DELETE FROM self_evaluations WHERE user_id = ? AND competency_id = ? AND evaluation_type = 'post'`, [user_id, competency_id]);
    }
    
    if (check.length > 0) {
      let current_status = check[0].current_status;
      let new_status = current_status;
      
      if (eval_type === 'pre') {
        if (['m', 'a', 'c', 'x'].includes(current_status)) new_status = 't';
      } else if (eval_type === 'post') {
        if (['a', 'c', 'x'].includes(current_status)) new_status = 'm';
      }
      
      if (new_status !== current_status) {
        let q = `UPDATE staff_competency_progress SET current_status = ?`;
        if (new_status === 't' || new_status === 'm' || new_status === 'a') {
          q += `, date_signed_off = NULL, assessor_id = NULL, signoff_comment = NULL, date_reviewed = NULL, reviewer_id = NULL`;
        }
        q += ` WHERE user_id = ? AND competency_id = ?`;
        await execute(req.db, q, [new_status, user_id, competency_id]);
      }
    }

    await execute(req.db, 
      `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, notes) VALUES (?, ?, 'ADMIN_EVAL_RESET', ?, ?)`,
      [user_id, competency_id, admin_id, `Admin reset ${eval_type}-training evaluation`]
    );
    res.json({ success: true, message: "Evaluation reset." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- AUDIT LOG ADMIN ENDPOINT ---
app.get('/api/admin/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;
  try {
    const logs = await query(req.db, `SELECT a.*, c.task_name FROM competency_audit_log a LEFT JOIN competencies c ON a.competency_id = c.id ORDER BY a.timestamp DESC LIMIT ?`, [limit]);
    const users = await query(sharedDb, `SELECT id, full_name FROM users`);
    const userMap = {}; users.forEach(u => userMap[u.id] = u.full_name);
    logs.forEach(l => {
      l.target_user_name = userMap[l.target_user_id] || 'Unknown';
      l.actioned_by_name = userMap[l.actioned_by_id] || 'Unknown';
    });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- STATISTICS ---
app.get('/api/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await query(sharedDb, 'SELECT id, username, full_name, designation, active_in, date_in_post FROM users WHERE is_active = 1');
    const currentDbName = req.headers['x-database'] || 'QA';

    const sections = await getSections();
    const allDbNames = sections.map(s => s.name);
    
    let userStatsMap = {};
    users.forEach(u => {
      let activeIn = [];
      try { activeIn = JSON.parse(u.active_in || '[]'); } catch(e){}
      userStatsMap[u.id] = {
        ...u,
        active_in: activeIn,
        section_totalApplicable: 0,
        section_completed: 0,
        section_percent: 0,
        overall_totalApplicable: 0,
        overall_completed: 0,
        overall_percent: 0,
        evaluations: {
          section: [],
          overall: []
        }
      };
    });

    const categoryStats = {};
    const timeStats = { overall: [], byCategory: {} };
    const evalStats = {
      section: [],
      overall: []
    };

    for (const dbName of allDbNames) {
      const dbInstance = getDb(dbName);
      const isCurrentSection = (dbName === currentDbName);

      const competencies = await query(dbInstance, 'SELECT * FROM competencies');
      const competencyGroups = await query(dbInstance, 'SELECT * FROM competency_groups');
      const progress = await query(dbInstance, 'SELECT * FROM staff_competency_progress');
      
      const compTargetGroups = {};
      competencyGroups.forEach(cg => {
        if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
        compTargetGroups[cg.competency_id].push(cg.group_name);
      });
      
      const evaluations = await query(dbInstance, 'SELECT * FROM self_evaluations');
      const latestEvals = {};

      const competencyQuizzes = await query(dbInstance, 'SELECT * FROM competency_quizzes');
      const quizzesByComp = {};
      competencyQuizzes.forEach(cq => {
        if (!quizzesByComp[cq.competency_id]) quizzesByComp[cq.competency_id] = [];
        quizzesByComp[cq.competency_id].push(cq.quiz_id);
      });

      const computeHasNoPrerequisites = (c) => {
        if (c.requires_instructions) { try { let rp = JSON.parse(c.reading_prerequisites || '[]'); if (rp.length > 0) return false; } catch(e) {} }
        if (c.requires_quiz && quizzesByComp[c.id] && quizzesByComp[c.id].length > 0) return false;
        if (c.requires_prerequisite_competencies) { try { let pc = JSON.parse(c.prerequisite_competencies || '[]'); if (pc.length > 0) return false; } catch(e) {} }
        if (c.requires_pre_eval) return false;
        let reqs = [];
        try { reqs = JSON.parse(c.qatrack_requirements || '[]'); } catch(e) {}
        if (reqs.length === 0 && c.required_qatrack_count > 0 && c.qatrack_test_identifier) reqs = [{ count: c.required_qatrack_count, identifier: c.qatrack_test_identifier }];
        if (reqs.length > 0) return false;
        if (c.required_plan_count > 0) return false;
        return true;
      };

      evaluations.forEach(ev => {
        const key = `${ev.user_id}-${ev.competency_id}-${ev.evaluation_type}`;
        if (!latestEvals[key] || new Date(ev.submission_date) > new Date(latestEvals[key].submission_date)) {
          latestEvals[key] = ev;
        }
      });
      
      Object.values(latestEvals).forEach(ev => {
        if (!userStatsMap[ev.user_id]) return;
        const uStat = userStatsMap[ev.user_id];
        
        uStat.evaluations.overall.push(ev);
        evalStats.overall.push(ev);
        
        if (isCurrentSection) {
          uStat.evaluations.section.push(ev);
          evalStats.section.push(ev);
        }
      });

      // Compute progress per user
      for (const user of users) {
         const uStat = userStatsMap[user.id];
         if (!uStat.active_in.includes(dbName)) continue;
         const applicableComps = competencies.filter(c => {
             let tu = [];
             try { tu = JSON.parse(c.target_users || '[]'); } catch(e) {}
             return (compTargetGroups[c.id] || []).includes(user.designation) || tu.includes(user.id);
         });
         const applicableCompIds = applicableComps.map(c => c.id);
         const userProgress = progress.filter(p => p.user_id === user.id && applicableCompIds.includes(p.competency_id));
         const completed = userProgress.filter(p => ['c', 'x'].includes(p.current_status)).length;

         uStat.overall_totalApplicable += applicableCompIds.length;
         uStat.overall_completed += completed;

         if (isCurrentSection) {
           uStat.section_totalApplicable = applicableCompIds.length;
           uStat.section_completed = completed;
         }
      }

      if (isCurrentSection) {
        competencies.forEach(c => {
          if (!categoryStats[c.category]) {
            categoryStats[c.category] = { t: 0, m: 0, a: 0, c: 0, x: 0, total: 0 };
          }
          const applicableUsers = users.filter(u => {
              let activeIn = [];
              try { activeIn = JSON.parse(u.active_in || '[]'); } catch(e){}
              let tu = [];
              try { tu = JSON.parse(c.target_users || '[]'); } catch(e) {}
              return activeIn.includes(dbName) && ((compTargetGroups[c.id] || []).includes(u.designation) || tu.includes(u.id));
          });
          applicableUsers.forEach(u => {
            const p = progress.find(pr => pr.user_id === u.id && pr.competency_id === c.id);
            const status = p ? p.current_status : (computeHasNoPrerequisites(c) ? 'm' : 't');
            if (categoryStats[c.category][status] !== undefined) {
              categoryStats[c.category][status]++;
            }
            categoryStats[c.category].total++;
          });
        });

        const validProgress = progress.filter(p => p.date_signed_off && ['c', 'x'].includes(p.current_status));
        let totalAllApplicable = 0;
        users.forEach(u => {
          let activeIn = [];
          try { activeIn = JSON.parse(u.active_in || '[]'); } catch(e){}
          if(activeIn.includes(dbName)) {
             totalAllApplicable += competencies.filter(c => {
                 let tu = [];
                 try { tu = JSON.parse(c.target_users || '[]'); } catch(e) {}
                 return (compTargetGroups[c.id] || []).includes(u.designation) || tu.includes(u.id);
             }).length;
          }
        });

        const timeMapOverall = {};

        validProgress.forEach(p => {
          const dateStr = p.date_signed_off.split('T')[0];
          if (!timeMapOverall[dateStr]) timeMapOverall[dateStr] = 0;
          timeMapOverall[dateStr]++;
        });

        const sortedDatesOverall = Object.keys(timeMapOverall).sort();
        let cumulative = 0;
        sortedDatesOverall.forEach(date => {
          cumulative += timeMapOverall[date];
          timeStats.overall.push({
            date,
            cumulativeCompleted: cumulative,
            overallPercent: totalAllApplicable > 0 ? Math.round((cumulative / totalAllApplicable) * 100) : 0
          });
        });
      }
    }

    const finalUserStats = Object.values(userStatsMap).map(u => {
       u.section_percent = u.section_totalApplicable > 0 ? Math.round((u.section_completed / u.section_totalApplicable) * 100) : 0;
       u.overall_percent = u.overall_totalApplicable > 0 ? Math.round((u.overall_completed / u.overall_totalApplicable) * 100) : 0;
       return u;
    });

    res.json({
      userStats: finalUserStats,
      categoryStats,
      timeStats,
      evalStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/admin/db-info', authenticateToken, requireSuperuser, async (req, res) => {
  try {
    const sections = await getSections();
    const dbsToStat = ['shared', ...sections.map(s => s.name)];
    const info = {};
    for (const db of dbsToStat) {
      const dbPath = path.resolve(__dirname, `${db}.db`);
      let size = 0;
      let entries = 0;
      if (fs.existsSync(dbPath)) {
        size = fs.statSync(dbPath).size;
        if (db === 'shared') {
          const rows = await query(sharedDb, "SELECT count(*) as c FROM users");
          entries = rows[0].c;
        } else {
          const dbInstance = getDb(db);
          const rows = await query(dbInstance, "SELECT count(*) as c FROM staff_competency_progress");
          entries = rows[0].c;
        }
      }
      info[db] = {
        size: size > 0 ? (size / 1024 / 1024).toFixed(2) + ' MB' : '0 MB',
        entries: entries
      };
    }
    const settings = await query(sharedDb, "SELECT * FROM global_settings");
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    
    const { apiUrl, apiToken } = await getQATrackConfig();
    if (!settingsMap.qatrack_api_url) settingsMap.qatrack_api_url = apiUrl;
    if (!settingsMap.qatrack_api_token) settingsMap.qatrack_api_token = apiToken;

    res.json({ info, settings: settingsMap });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/backup/:scope', authenticateToken, requireSuperuser, async (req, res) => {
  const scope = req.params.scope; 
  try {
    const sections = await getSections();
    const filesToBackup = scope === 'all' ? ['shared', ...sections.map(s => s.name)] : ['shared', scope];
    const backupData = {};
    for (const db of filesToBackup) {
      const dbPath = path.resolve(__dirname, `${db}.db`);
      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        backupData[db] = fileBuffer.toString('base64');
      }
    }
    const dateStr = new Date().toISOString();
    if (scope === 'all') {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('last_backup_all', ?)", [dateStr]);
    }
    for (const db of filesToBackup) {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)", [`last_backup_${db}`, dateStr]);
    }
    res.json({ backup: backupData, date: dateStr });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/restore/:scope', authenticateToken, requireSuperuser, async (req, res) => {
  const { backup } = req.body;
  if (!backup) return res.status(400).json({error: 'No backup data provided'});
  try {
    const sections = await getSections();
    const validDbs = ['shared', ...sections.map(s => s.name)];
    for (const [db, base64Data] of Object.entries(backup)) {
      if (!validDbs.includes(db)) continue;
      const dbPath = path.resolve(__dirname, `${db}.db`);
      fs.writeFileSync(dbPath, Buffer.from(base64Data, 'base64'));
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/upload-frontend', authenticateToken, requireSuperuser, async (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).json({error: 'No html content provided'});
  try {
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir);
    }
    const publicIndexPath = path.join(publicDir, 'index.html');
    fs.writeFileSync(publicIndexPath, html, 'utf8');
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/settings', authenticateToken, requireSuperuser, async (req, res) => {
  const { default_renewal_period, qatrack_api_url, qatrack_api_token } = req.body;
  try {
    if (default_renewal_period !== undefined) {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('default_renewal_period', ?)", [default_renewal_period.toString()]);
    }
    if (qatrack_api_url !== undefined) {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('qatrack_api_url', ?)", [qatrack_api_url.toString()]);
    }
    if (qatrack_api_token !== undefined) {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('qatrack_api_token', ?)", [qatrack_api_token.toString()]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/test-qatrack', authenticateToken, requireSuperuser, async (req, res) => {
  let { qatrack_api_url, qatrack_api_token } = req.body;
  if (!qatrack_api_url || !qatrack_api_token) {
    return res.status(400).json({ error: 'Both API URL and Token are required to test the connection.' });
  }
  try {
    qatrack_api_url = qatrack_api_url.replace(/\/+$/, '');
    const url = `${qatrack_api_url}/qc/testlistinstances/`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${qatrack_api_token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `QATrack+ API returned status ${response.status}: ${response.statusText}` });
    }

    await response.json();
    res.json({ success: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/admin/sections', authenticateToken, requireSuperuser, async (req, res) => {
  const { sections } = req.body;
  try {
    await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('sections', ?)", [JSON.stringify(sections)]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/admin/sections/:name/info', authenticateToken, requireSuperuser, async (req, res) => {
  const sectionName = req.params.name;
  try {
    const dbPath = path.resolve(__dirname, `${sectionName}.db`);
    if (!fs.existsSync(dbPath)) return res.json({ competencies: 0, quizzes: 0, categories: 0 });
    const dbInstance = getDb(sectionName);
    const comps = await query(dbInstance, "SELECT count(*) as c FROM competencies");
    const quizzes = await query(dbInstance, "SELECT count(*) as c FROM quizzes");
    const categories = await query(dbInstance, "SELECT count(DISTINCT category) as c FROM competencies");
    res.json({ competencies: comps[0].c, quizzes: quizzes[0].c, categories: categories[0].c });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/admin/sections/:name', authenticateToken, requireSuperuser, async (req, res) => {
  const sectionName = req.params.name;
  try {
    let sections = await getSections();
    sections = sections.filter(s => s.name !== sectionName);
    await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('sections', ?)", [JSON.stringify(sections)]);
    const dbPath = path.resolve(__dirname, `${sectionName}.db`);
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, `${dbPath}.deleted.${Date.now()}`); // Acts as an archive safety-net
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/admin/uploads/stats', authenticateToken, requireSuperuser, async (req, res) => {
  try {
    const sections = await getSections();
    const stats = [];
    for (const section of sections) {
      const uploadDir = path.join(__dirname, 'public', 'uploads', section.name);
      const bytes = getFolderSize(uploadDir);
      stats.push({ section: section.name, bytes });
    }
    res.json(stats);
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/admin/uploads/:section', authenticateToken, requireSuperuser, async (req, res) => {
  try {
    const section = req.params.section;
    const uploadDir = path.join(__dirname, 'public', 'uploads', section);
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
    const dbInstance = getDb(section);
    await execute(dbInstance, `DELETE FROM file_uploads`);
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/admin/uploads/:section/backup', authenticateToken, requireSuperuser, async (req, res) => {
  const section = req.params.section;
  const uploadDir = path.join(__dirname, 'public', 'uploads', section);
  if (!fs.existsSync(uploadDir)) return res.status(404).json({error: 'No uploads found for this section.'});
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(uploadDir);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=uploads_backup_${section}.zip`);
    res.send(zip.toBuffer());
  } catch(e) { res.status(500).json({error: e.code === 'MODULE_NOT_FOUND' ? 'The adm-zip module is not installed. Please run "npm install adm-zip" on the server.' : e.message}); }
});

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await query(sharedDb, "SELECT * FROM global_settings WHERE key != 'qatrack_api_token'");
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    res.json(settingsMap);
  } catch(error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));