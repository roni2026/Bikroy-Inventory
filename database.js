const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./inventory.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to inventory.db.');
});

const createTableSql = `
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL
  );
`;

db.run(createTableSql, (err) => {
  if (err) return console.error(err.message);
  console.log('Inventory table is ready.');
});

db.close();