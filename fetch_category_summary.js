const http = require('http');

const loginData = JSON.stringify({ username: 'jamesb', password: 'jamesb' });

const reqLogin = http.request({
  hostname: 'localhost',
  port: 3003,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-database': 'Planning'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    const token = data.token;
    
    // Now fetch records-summary
    const reqSummary = http.request({
      hostname: 'localhost',
      port: 3003,
      path: '/api/admin/category/records-summary?category=Test',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-database': 'Planning'
      }
    }, (resSummary) => {
      let bodySummary = '';
      resSummary.on('data', chunk => bodySummary += chunk);
      resSummary.on('end', () => {
        console.log('Category Summary:');
        console.log(bodySummary);
      });
    });
    reqSummary.end();
  });
});

reqLogin.write(loginData);
reqLogin.end();
