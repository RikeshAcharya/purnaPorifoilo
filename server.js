const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware configuration
app.use(cors());
app.use(express.json());

// Initialize SQLite database instance
const db = new sqlite3.Database('./messages.db', (err) => {
  if (err) {
    console.error('Database connection breakdown:', err.message);
  } else {
    console.log('Connected to the SQLite secure messages storage.');
    // Generate messages data grid architecture if missing
    db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// Contact Route Endpoint Engine
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing compulsory data parameters.' });
  }

  const sql = `INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)`;
  const params = [name, email, subject, message];

  db.run(sql, params, function (err) {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Failed to write record structure to database.' });
    }
    res.status(200).json({ status: 'Success', messageId: this.lastID });
  });
});

app.listen(PORT, () => {
  console.log(`Server execution online at http://localhost:${PORT}`);
});