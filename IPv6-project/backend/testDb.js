const db = require('./database/config');

db.connect((err) => {
  if (err) {
    console.error('error connecting to db:', err);
    return;
  }
  console.log('connected to db');
  const sql = 'SELECT * FROM active_address';
  db.query(sql, (err, result, fields) => {
    if (err) {
      console.error('error running query', err);
      return;
    }
    console.log('result:', result);
    console.log('fields:', fields);
    db.end();
});
});