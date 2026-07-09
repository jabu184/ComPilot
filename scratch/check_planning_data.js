const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const planningDbPath = path.resolve(__dirname, '..', 'Planning.db');
const sharedDbPath = path.resolve(__dirname, '..', 'shared.db');

const sharedDb = new sqlite3.Database(sharedDbPath, (err) => {
  if (err) return console.error(err);
  
  sharedDb.all("SELECT id, username, full_name FROM users", (err, users) => {
    if (err) return console.error(err);
    console.log("Users in shared.db:", users);
    const james = users.find(u => u.username.includes('james'));
    if (!james) {
      console.log("James not found");
      sharedDb.close();
      return;
    }
    const jamesId = james.id;
    console.log(`James Burnley's ID is ${jamesId}`);
    
    const planningDb = new sqlite3.Database(planningDbPath, (err) => {
      if (err) return console.error(err);
      
      planningDb.all("SELECT id, task_name, category, required_plan_count, required_qatrack_count, qatrack_test_identifier FROM competencies", (err, comps) => {
        if (err) return console.error(err);
        console.log("\nPlanning Competencies:");
        console.log(comps);
        
        planningDb.all("SELECT * FROM patient_plan_logs WHERE trainee_id = ?", [jamesId], (err, logs) => {
          if (err) return console.error(err);
          console.log(`\nJames Burnley's Patient Plan Logs (Trainee ID: ${jamesId}):`);
          console.log(logs);
          
          planningDb.all("SELECT * FROM staff_competency_progress WHERE user_id = ?", [jamesId], (err, progress) => {
            if (err) return console.error(err);
            console.log(`\nJames Burnley's Competency Progress (User ID: ${jamesId}):`);
            console.log(progress);
            
            sharedDb.close();
            planningDb.close();
          });
        });
      });
    });
  });
});
