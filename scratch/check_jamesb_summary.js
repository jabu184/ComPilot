const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const planningDbPath = path.resolve(__dirname, '..', 'Planning.db');
const sharedDbPath = path.resolve(__dirname, '..', 'shared.db');

const sharedDb = new sqlite3.Database(sharedDbPath, (err) => {
  if (err) return console.error(err);
  
  sharedDb.get("SELECT id, username, full_name FROM users WHERE username = 'jamesb'", (err, user) => {
    if (err) return console.error(err);
    if (!user) {
      console.log("James Burnley (jamesb) not found!");
      sharedDb.close();
      return;
    }
    
    console.log("James Burnley User ID:", user.id);
    const jamesId = user.id;
    
    const planningDb = new sqlite3.Database(planningDbPath, (err) => {
      if (err) return console.error(err);
      
      // Get competencies in 'Test' category
      planningDb.all("SELECT id, task_name, required_plan_count, required_qatrack_count, qatrack_test_identifier FROM competencies WHERE category = 'Test'", (err, comps) => {
        if (err) return console.error(err);
        console.log("\nCompetencies in 'Test' category:");
        comps.forEach(c => console.log(`ID: ${c.id}, Name: ${c.task_name}, ReqPlans: ${c.required_plan_count}, ReqQA: ${c.required_qatrack_count}, QAId: ${c.qatrack_test_identifier}`));
        
        const compIds = comps.map(c => c.id);
        
        // Get logs for James
        planningDb.all("SELECT id, competency_id, status FROM patient_plan_logs WHERE trainee_id = ?", [jamesId], (err, logs) => {
          if (err) return console.error(err);
          console.log(`\nJames Burnley's logs: count = ${logs.length}`);
          logs.forEach(l => console.log(`Log ID: ${l.id}, Comp ID: ${l.competency_id}, Status: ${l.status}`));
          
          // Get staff_competency_progress for James
          planningDb.all("SELECT competency_id, qatrack_records_detail FROM staff_competency_progress WHERE user_id = ?", [jamesId], (err, progress) => {
            if (err) return console.error(err);
            console.log("\nJames Burnley's progress (qatrack details):");
            progress.forEach(p => {
              if (compIds.includes(p.competency_id)) {
                console.log(`Comp ID: ${p.competency_id}, QA details: ${p.qatrack_records_detail}`);
              }
            });
            
            sharedDb.close();
            planningDb.close();
          });
        });
      });
    });
  });
});
