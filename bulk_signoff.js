const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let args = process.argv.slice(2);
const forceIndex = args.indexOf('--force');
const force = forceIndex !== -1;
if (force) {
    args.splice(forceIndex, 1);
}

if (args.length < 2) {
    console.error("Usage: node bulk_signoff.js <section> <status> [username1] [username2] ... [--force]");
    console.error("Example: node bulk_signoff.js QA c");
    console.error("Example: node bulk_signoff.js QA c jdoe asmith");
    console.error("Example: node bulk_signoff.js Planning x");
    console.error("Example: node bulk_signoff.js Planning x --force");
    process.exit(1);
}

const section = args[0];
const status = args[1].toLowerCase();
const targetUsernames = args.slice(2);

if (!['c', 'x'].includes(status)) {
    console.error("Error: Status must be 'c' (Competent) or 'x' (Competent to Train)");
    process.exit(1);
}

const sharedDbPath = path.resolve(__dirname, 'shared.db');
const sectionDbPath = path.resolve(__dirname, `${section}.db`);

if (!fs.existsSync(sharedDbPath) || !fs.existsSync(sectionDbPath)) {
    console.error(`Error: Database files not found. Ensure shared.db and ${section}.db exist.`);
    process.exit(1);
}

const sharedDb = new sqlite3.Database(sharedDbPath);
const sectionDb = new sqlite3.Database(sectionDbPath);

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

async function run() {
    try {
        console.log(`Starting bulk sign-off for section '${section}' to status '${status.toUpperCase()}'...`);

        // 1. Ensure "System (Legacy)" user exists to act as the Assessor
        let sysUser = await query(sharedDb, "SELECT id FROM users WHERE username = 'system_legacy'");
        let sysUserId;
        if (sysUser.length === 0) {
            await execute(sharedDb, `INSERT INTO users (username, full_name, email, designation, is_admin, is_superuser, is_active, password, active_in) 
                VALUES ('system_legacy', 'System (Legacy)', 'system@localhost', 'System', 1, 1, 0, '', '[]')`);
            sysUser = await query(sharedDb, "SELECT id FROM users WHERE username = 'system_legacy'");
            console.log("Created 'System (Legacy)' user account for audit logging.");
        }
        sysUserId = sysUser[0].id;

        // 2. Get all users active in the specified section
        const users = await query(sharedDb, "SELECT id, username, designation, active_in FROM users WHERE is_active = 1");
        const activeUsers = users.filter(u => {
            if (targetUsernames.length > 0 && !targetUsernames.includes(u.username)) return false;
            try {
                const activeIn = JSON.parse(u.active_in || '[]');
                return activeIn.includes(section);
            } catch (e) { return false; }
        });

        if (activeUsers.length === 0) {
            if (targetUsernames.length > 0) console.log(`No active users found matching [${targetUsernames.join(', ')}] configured for section '${section}'.`);
            else console.log(`No active users found configured for section '${section}'.`);
            return;
        }

        console.log(`Found ${activeUsers.length} active users configured for section '${section}'.`);

        // 3. Get all competencies and their group/quiz mappings
        const competencies = await query(sectionDb, "SELECT * FROM competencies");
        const competencyGroups = await query(sectionDb, "SELECT * FROM competency_groups");
        const competencyQuizzes = await query(sectionDb, "SELECT * FROM competency_quizzes");

        const compTargetGroups = {};
        competencyGroups.forEach(cg => {
            if (!compTargetGroups[cg.competency_id]) compTargetGroups[cg.competency_id] = [];
            compTargetGroups[cg.competency_id].push(cg.group_name);
        });

        const compQuizzes = {};
        competencyQuizzes.forEach(cq => {
            if (!compQuizzes[cq.competency_id]) compQuizzes[cq.competency_id] = [];
            compQuizzes[cq.competency_id].push(cq.quiz_id);
        });

        const today = new Date().toISOString().split('T')[0];
        let updatedCount = 0;

        for (const user of activeUsers) {
            for (const comp of competencies) {
                // Check if competency applies to user's designation or to them individually
                let targetUsers = [];
                try {
                    let tu = JSON.parse(comp.target_users || '[]');
                    while (typeof tu === 'string') tu = JSON.parse(tu);
                    targetUsers = Array.isArray(tu) ? tu : [];
                } catch (e) {}

                const applies = (compTargetGroups[comp.id] || []).includes(user.designation) || targetUsers.includes(user.id);
                if (!applies) continue;

                const progress = await query(sectionDb, "SELECT * FROM staff_competency_progress WHERE user_id = ? AND competency_id = ?", [user.id, comp.id]);
                let currentStatus = progress.length > 0 ? progress[0].current_status : 't';
                
                // Skip if they are already at the target status, or if we are requesting 'c' and they are already 'x' (don't downgrade) UNLESS forced.
                if (!force && (currentStatus === status || (status === 'c' && currentStatus === 'x'))) {
                    continue;
                }

                // Prep Prerequisites: Fake readings, quizzes, and QA Track data
                let readingPrereqs = [];
                try {
                    let rp = JSON.parse(comp.reading_prerequisites || '[]');
                    while (typeof rp === 'string') rp = JSON.parse(rp);
                    readingPrereqs = Array.isArray(rp) ? rp.map(r => r.id) : [];
                } catch (e) {}
                
                let quizzesCompleted = {};
                const qIds = compQuizzes[comp.id] || [];
                qIds.forEach(qid => { quizzesCompleted[qid] = { passed: true, score: 100 }; });
                
                const qatrackCount = comp.required_qatrack_count || 0;
                const readingsStr = JSON.stringify(readingPrereqs);
                const quizzesStr = JSON.stringify(quizzesCompleted);

                if (progress.length === 0) {
                    await execute(sectionDb, `INSERT INTO staff_competency_progress (user_id, competency_id, current_status, readings_completed, quizzes_completed, qatrack_records, qatrack_manual_override, date_signed_off, assessor_id, signoff_comment) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`, [user.id, comp.id, status, readingsStr, quizzesStr, qatrackCount, today, sysUserId]);
                } else {
                    await execute(sectionDb, `UPDATE staff_competency_progress SET current_status = ?, readings_completed = ?, quizzes_completed = ?, qatrack_records = ?, qatrack_manual_override = 1, date_signed_off = ?, assessor_id = ?, signoff_comment = NULL, date_reviewed = NULL, reviewer_id = NULL WHERE id = ?`, [status, readingsStr, quizzesStr, qatrackCount, today, sysUserId, progress[0].id]);
                }

                await execute(sectionDb, `INSERT INTO competency_audit_log (target_user_id, competency_id, action_type, actioned_by_id, previous_status, new_status, notes) VALUES (?, ?, 'LEGACY_BULK_SIGNOFF', ?, ?, ?, ?)`, [user.id, comp.id, sysUserId, currentStatus, status, `Bulk updated to ${status.toUpperCase()} by legacy script`]);
                updatedCount++;
            }
        }
        console.log(`Success: Updated ${updatedCount} competency records in section '${section}'.`);
    } catch (err) {
        console.error("Script execution failed:", err);
    } finally {
        sharedDb.close();
        sectionDb.close();
    }
}

run();