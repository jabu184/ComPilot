const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
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

// Fallback to serve index.html from the root folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DATABASE CONNECTION ---
const dbs = {};
const initDb = (db) => {
  db.serialize(() => {
    // CREATE BASE TABLES IF THEY DO NOT EXIST (Needed for dynamically created databases)
    db.run(`CREATE TABLE IF NOT EXISTS competencies (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, task_name TEXT, required_qatrack_count INTEGER DEFAULT 0, qatrack_test_identifier TEXT, requires_instructions INTEGER DEFAULT 1, requires_quiz INTEGER DEFAULT 0, requires_prerequisite_competencies INTEGER DEFAULT 0, prerequisite_competencies TEXT DEFAULT '[]', display_order INTEGER DEFAULT 0, reading_prerequisites TEXT DEFAULT '[]', renewal_period_months INTEGER DEFAULT 36)`, () => {
      db.get("SELECT count(*) as count FROM competencies", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO competencies (id, category, task_name, required_qatrack_count, qatrack_test_identifier, requires_instructions, requires_quiz, requires_prerequisite_competencies, prerequisite_competencies, reading_prerequisites, renewal_period_months) VALUES 
            (1, 'General', 'Department Induction', 0, NULL, 1, 1, 0, '[]', '[{"id":"doc1","name":"Health and Safety Guidelines"}]', 36),
            (2, 'Equipment', 'Basic Operation', 5, 'BASIC_QA', 1, 0, 1, '[1]', '[{"id":"doc2","name":"Operating Manual"}]', 36)
          `, (err) => { if(err) console.warn('InitDB Seed Competencies:', err.message); });
        }
      });
    });

    db.run(`CREATE TABLE IF NOT EXISTS staff_competency_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, competency_id INTEGER, current_status TEXT DEFAULT 't', instructions_read INTEGER DEFAULT 0, quiz_passed INTEGER DEFAULT 0, date_started TEXT DEFAULT CURRENT_DATE, date_signed_off TEXT, assessor_id INTEGER, date_reviewed TEXT, reviewer_id INTEGER, quiz_score INTEGER, qatrack_records INTEGER, qatrack_manual_override INTEGER DEFAULT 0, readings_completed TEXT DEFAULT '[]', quizzes_completed TEXT DEFAULT '{}', UNIQUE(user_id, competency_id))`, () => {
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

    db.run(`CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, competency_id INTEGER, passing_score_percent INTEGER DEFAULT 80, name TEXT DEFAULT 'Competency Quiz')`, () => {
      db.get("SELECT count(*) as count FROM quizzes", (err, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO quizzes (id, competency_id, passing_score_percent, name) VALUES (1, 1, 100, 'Induction Quiz')`, (err) => { if(err) console.warn('InitDB Seed Quizzes:', err.message); });
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

app.get('/api/public/summary', async (req, res) => {
  try {
    const dbName = req.headers['x-database'] || 'QA';
    const dbInstance = getDb(dbName);
    const users = await query(sharedDb, 'SELECT id, full_name, designation, active_in FROM users WHERE is_active = 1');
    const competencies = await query(dbInstance, 'SELECT id, category, task_name, display_order FROM competencies ORDER BY display_order ASC, id ASC');
    const competencyGroups = await query(dbInstance, 'SELECT * FROM competency_groups');
    const progress = await query(dbInstance, 'SELECT user_id, competency_id, current_status, date_signed_off, date_reviewed FROM staff_competency_progress');
    const categoryOrder = await query(dbInstance, 'SELECT category, display_order FROM category_order ORDER BY display_order ASC');
    const userGroups = await query(sharedDb, 'SELECT * FROM user_groups ORDER BY display_order ASC, id ASC');
    
    const compTargetGroups = {};
    competencyGroups.forEach(cg => {
      if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
      compTargetGroups[cg.competency_id].push(cg.group_name);
    });

    competencies.forEach(c => {
      c.target_groups = compTargetGroups[c.id] || [];
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

// --- MOCK QATRACK+ ENDPOINT ---
// We extract this into a function so we can use it internally for evaluations as well as expose it
const fetchQATrackInstances = async (username, test_identifier) => {
  console.log(`[Mock QATrack+] Fetching instances for user: ${username}, test: ${test_identifier}`);
  return {
    count: 5, // Return a fixed count of 5 for testing
    results: [
      { id: 101, status: 'Approved', work_completed: '2023-10-01' },
      { id: 102, status: 'Approved', work_completed: '2023-10-05' }
    ]
  };
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
      await execute(req.db, 'DELETE FROM competency_groups WHERE group_name = ?', [group[0].name]);
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
      await execute(req.db, 'UPDATE competency_groups SET group_name = ? WHERE group_name = ?', [name, oldGroup[0].name]);
      await execute(sharedDb, 'UPDATE users SET designation = ? WHERE designation = ?', [name, oldGroup[0].name]);
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
    const competencies = await query(req.db, 'SELECT * FROM competencies ORDER BY display_order ASC, id ASC');
    const competencyGroups = await query(req.db, 'SELECT * FROM competency_groups');
    
    const groupsByComp = {};
    competencyGroups.forEach(cg => {
      if (!groupsByComp[cg.competency_id]) groupsByComp[cg.competency_id] = [];
      groupsByComp[cg.competency_id].push(cg.group_name);
    });
    
    const competencyQuizzes = await query(req.db, 'SELECT * FROM competency_quizzes');
    const quizzesByComp = {};
    competencyQuizzes.forEach(cq => {
        if (!quizzesByComp[cq.competency_id]) quizzesByComp[cq.competency_id] = [];
        quizzesByComp[cq.competency_id].push(cq.quiz_id);
    });

    competencies.forEach(c => {
      c.target_groups = groupsByComp[c.id] || [];
      c.quiz_ids = quizzesByComp[c.id] || [];
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
    });
    
    res.json(competencies);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/competencies', authenticateToken, requireAdmin, async (req, res) => {
  const { category, task_name, required_qatrack_count, qatrack_test_identifier, requires_instructions, requires_quiz, quiz_ids, requires_prerequisite_competencies, prerequisite_competencies, target_groups, reading_prerequisites, renewal_period_months } = req.body;
  try {
    const rpStr = JSON.stringify(reading_prerequisites || []);
    const pcStr = JSON.stringify(prerequisite_competencies || []);
    await execute(req.db, 
      `INSERT INTO competencies (category, task_name, required_qatrack_count, qatrack_test_identifier, requires_instructions, requires_quiz, requires_prerequisite_competencies, prerequisite_competencies, reading_prerequisites, renewal_period_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, task_name, required_qatrack_count || 0, qatrack_test_identifier || null, requires_instructions ? 1 : 0, requires_quiz ? 1 : 0, requires_prerequisite_competencies ? 1 : 0, pcStr, rpStr, renewal_period_months || 36]
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
  const { category, task_name, required_qatrack_count, qatrack_test_identifier, requires_instructions, requires_quiz, quiz_ids, requires_prerequisite_competencies, prerequisite_competencies, target_groups, reading_prerequisites, renewal_period_months } = req.body;
  try {
    const rpStr = JSON.stringify(reading_prerequisites || []);
    const pcStr = JSON.stringify(prerequisite_competencies || []);
    await execute(req.db, 
      `UPDATE competencies SET category = ?, task_name = ?, required_qatrack_count = ?, qatrack_test_identifier = ?, requires_instructions = ?, requires_quiz = ?, requires_prerequisite_competencies = ?, prerequisite_competencies = ?, reading_prerequisites = ?, renewal_period_months = ? WHERE id = ?`,
      [category, task_name, required_qatrack_count || 0, qatrack_test_identifier || null, requires_instructions ? 1 : 0, requires_quiz ? 1 : 0, requires_prerequisite_competencies ? 1 : 0, pcStr, rpStr, renewal_period_months || 36, req.params.id]
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
  try {
    await execute(req.db, `DELETE FROM competencies WHERE id = ?`, [req.params.id]);
    await execute(req.db, `DELETE FROM competency_groups WHERE competency_id = ?`, [req.params.id]);
    await execute(req.db, `DELETE FROM staff_competency_progress WHERE competency_id = ?`, [req.params.id]);
    await execute(req.db, `DELETE FROM competency_quizzes WHERE competency_id = ?`, [req.params.id]);
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
    await execute(sharedDb, `DELETE FROM users WHERE id=?`, [req.params.id]);
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
      const competencies = await query(dbInstance, 'SELECT id, category FROM competencies');
      const competencyGroups = await query(dbInstance, 'SELECT * FROM competency_groups');
      const progress = await query(dbInstance, 'SELECT user_id, competency_id, current_status FROM staff_competency_progress');
      
      const compTargetGroups = {};
      competencyGroups.forEach(cg => {
        if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
        compTargetGroups[cg.competency_id].push(cg.group_name);
      });

      for (const user of users) {
         if (!user.active_in.includes(dbName)) continue;
         const applicableCompIds = competencies.filter(c => (compTargetGroups[c.id] || []).includes(user.designation)).map(c => c.id);
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
    const { name, passing_score_percent, questions } = req.body;
    try {
        const result = await execute(req.db, `INSERT INTO quizzes (name, passing_score_percent) VALUES (?, ?)`, [name, passing_score_percent]);
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
    const { name, passing_score_percent, questions } = req.body;
    const quiz_id = req.params.id;
    try {
        await execute(req.db, `UPDATE quizzes SET name = ?, passing_score_percent = ? WHERE id = ?`, [name, passing_score_percent, quiz_id]);
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
    const quiz_id = req.params.id;
    try {
        await execute(req.db, `DELETE FROM quizzes WHERE id = ?`, [quiz_id]);
        await execute(req.db, `DELETE FROM quiz_questions WHERE quiz_id = ?`, [quiz_id]);
        await execute(req.db, `DELETE FROM competency_quizzes WHERE quiz_id = ?`, [quiz_id]);
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
    // Get the required milestones for this specific competency
    const compQuery = await query(req.db, `SELECT * FROM competencies WHERE id = ?`, [competency_id]);
    if (compQuery.length === 0) return res.status(404).json({ error: 'Competency not found' });
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

    const progressQuery = await query(req.db, `SELECT * FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (progressQuery.length > 0) {
      progress = progressQuery[0];
      try { 
        rc = JSON.parse(progress.readings_completed || '[]'); 
        while(typeof rc === 'string') rc = JSON.parse(rc);
        if (!Array.isArray(rc)) rc = [];
      } catch(e) {}
      try { 
        qc = JSON.parse(progress.quizzes_completed || '{}'); 
        while(typeof qc === 'string') qc = JSON.parse(qc);
        if (!qc || typeof qc !== 'object' || Array.isArray(qc)) qc = {};
      } catch(e) {}
    } else {
      progress = { current_status: 't', qatrack_records: null, qatrack_manual_override: 0 };
    }
      
    let requirementsMet = true;
    let missingReason = '';

    if (comp.requires_instructions) {
      for (let r of rp) {
        if (!rc.includes(r.id)) {
          requirementsMet = false;
          missingReason = `Reading prerequisite '${r.name}' not completed.`;
          break;
        }
      }
    }
    
    if (requirementsMet && comp.requires_quiz) {
        const qzs = await query(req.db, `SELECT q.id, q.name FROM quizzes q JOIN competency_quizzes cq ON q.id = cq.quiz_id WHERE cq.competency_id = ?`, [competency_id]);
        for (let qz of qzs) {
          if (!qc[qz.id] || !qc[qz.id].passed) {
            requirementsMet = false;
            missingReason = `Quiz '${qz.name}' not passed.`;
            break;
          }
        }
    }
    
    if (requirementsMet && comp.requires_prerequisite_competencies) {
      let pc = [];
      try { 
        pc = JSON.parse(comp.prerequisite_competencies || '[]'); 
        while(typeof pc === 'string') pc = JSON.parse(pc);
        if (!Array.isArray(pc)) pc = [];
      } catch(e) {}
      for (let pcId of pc) {
        const pcProg = await query(req.db, `SELECT current_status FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, pcId]);
        if (pcProg.length === 0 || (pcProg[0].current_status !== 'c' && pcProg[0].current_status !== 'x')) {
          requirementsMet = false;
          missingReason = `Prerequisite competencies not fully met.`;
          break;
        }
      }
    }

    let count = progress.qatrack_records;
    if (comp.required_qatrack_count > 0 && comp.qatrack_test_identifier) {
      if (!progress.qatrack_manual_override) {
        const qaData = await fetchQATrackInstances(username, comp.qatrack_test_identifier);
        count = qaData.count;
      }
      if (count == null || count < comp.required_qatrack_count) {
        requirementsMet = false;
        if (!missingReason) missingReason = `QATrack+ missing data: Found ${count || 0} valid tests, requires ${comp.required_qatrack_count}.`;
      }
    }

    let initialized = false;
    if (progressQuery.length === 0) {
      await execute(req.db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, qatrack_records) VALUES (?, ?, 't', ?)`, [user_id, competency_id, count]);
      initialized = true;
    } else if (comp.required_qatrack_count > 0 && comp.qatrack_test_identifier && !progress.qatrack_manual_override) {
      await execute(req.db, `UPDATE staff_competency_progress SET qatrack_records = ? WHERE user_id = ? AND competency_id = ?`, [count, user_id, competency_id]);
    }
      
    if (progress.current_status === 't' && requirementsMet) {
      await execute(req.db, `UPDATE staff_competency_progress SET current_status = 'm' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'PROMOTED_TO_M', ?, 't', 'm', 'System auto-promotion (Prerequisites met)')`, [user_id, competency_id, user_id]);
      return res.json({ success: true, promoted: true });
    } else if ((progress.current_status === 'm' || progress.current_status === 'a') && !requirementsMet) {
      await execute(req.db, `UPDATE staff_competency_progress SET current_status = 't' WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
      await execute(req.db, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'DEMOTED_TO_T', ?, ?, 't', 'System auto-demotion (Prerequisites no longer met)')`, [user_id, competency_id, user_id, progress.current_status]);
      return res.json({ success: true, demoted: true, reason: missingReason });
    }

    return res.json({ success: true, promoted: false, reason: missingReason || 'Milestones incomplete.', initialized });
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
  const { user_id, competency_id, readings_completed, qatrack_records, qatrack_manual_override } = req.body;
  const admin_id = req.user.id;

  try {
    const rcStr = JSON.stringify(readings_completed || []);
    const check = await query(req.db, `SELECT id FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?`, [user_id, competency_id]);
    if (check.length === 0) {
      await execute(req.db, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, readings_completed, qatrack_records, qatrack_manual_override) VALUES (?, ?, 't', ?, ?, ?)`, 
        [user_id, competency_id, rcStr, qatrack_records, qatrack_manual_override ? 1 : 0]);
    } else {
      await execute(req.db, `UPDATE staff_competency_progress SET readings_completed = ?, qatrack_records = ?, qatrack_manual_override = ? WHERE user_id = ? AND competency_id = ?`, 
        [rcStr, qatrack_records, qatrack_manual_override ? 1 : 0, user_id, competency_id]);
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
        overall_percent: 0
      };
    });

    const categoryStats = {};
    const timeStats = { overall: [], byCategory: {} };

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

      // Compute progress per user
      for (const user of users) {
         const uStat = userStatsMap[user.id];
         if (!uStat.active_in.includes(dbName)) continue;
         const applicableComps = competencies.filter(c => (compTargetGroups[c.id] || []).includes(user.designation));
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
              return activeIn.includes(dbName) && (compTargetGroups[c.id] || []).includes(u.designation);
          });
          applicableUsers.forEach(u => {
            const p = progress.find(pr => pr.user_id === u.id && pr.competency_id === c.id);
            const status = p ? p.current_status : 't';
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
             totalAllApplicable += competencies.filter(c => (compTargetGroups[c.id] || []).includes(u.designation)).length;
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
      timeStats
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
    const rootIndexPath = path.join(__dirname, 'index.html');
    fs.writeFileSync(rootIndexPath, html, 'utf8');
    const publicDir = path.join(__dirname, 'public');
    if (fs.existsSync(publicDir)) {
      const publicIndexPath = path.join(publicDir, 'index.html');
      fs.writeFileSync(publicIndexPath, html, 'utf8');
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/admin/settings', authenticateToken, requireSuperuser, async (req, res) => {
  const { default_renewal_period } = req.body;
  try {
    if (default_renewal_period !== undefined) {
      await execute(sharedDb, "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('default_renewal_period', ?)", [default_renewal_period.toString()]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
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

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await query(sharedDb, "SELECT * FROM global_settings");
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    res.json(settingsMap);
  } catch(error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));