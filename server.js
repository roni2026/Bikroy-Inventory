// --- Imports ---
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const multer = require('multer');
const csv = require('csv-parser');
const os = require('os');

// --- Initialization ---
const app = express();
const PORT = 3000;
const AUTH_COOKIE_NAME = 'bikroy_auth_token';

// --- LAN IP Detection ---
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name in nets) {
    for (const iface of nets[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}
const LAN_IP = getLocalIp();

// --- Database Connection ---
function getDbConnection() {
  const db = new sqlite3.Database('./inventory.db', (err) => {
    if (err) console.error('DB Connection Error:', err.message);
  });
  return db;
}

// --- Multer Config ---
const upload = multer({ dest: 'uploads/' });

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// --- Hardcoded User ---
const ADMIN_USER = {
  username: 'bikroy',
  password: 'bikroy2026'
};

// --- Auth Middleware ---
function checkAuth(req, res, next) {
  const token = req.cookies[AUTH_COOKIE_NAME];
  if (token === 'VALID_TOKEN_SECRET') {
    next();
  } else {
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ message: 'Unauthorized' });
    } else {
      res.redirect('/login.html');
    }
  }
}

// ===================================
// === AUTHENTICATION ROUTES ===
// ===================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    res.cookie(AUTH_COOKIE_NAME, 'VALID_TOKEN_SECRET', {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });
    res.status(200).json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
  }
});

app.get('/api/check-auth', checkAuth, (req, res) => {
  res.status(200).json({ message: 'Authenticated' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.status(200).json({ message: 'Logged out' });
});

// ===================================
// === INVENTORY ROUTES ===
// ===================================

/**
 * Public search (for search page)
 * Multi-word, order-insensitive search:
 * - "swiss cake" matches "Swiss roll cake"
 * - ignores extra spaces
 * - all words must appear somewhere in the category string
 */
app.get('/api/inventory', (req, res) => {
  try {
    const raw = (req.query.search || '').toLowerCase().trim();

    // If empty search, return empty array (client shows message)
    if (raw.length === 0) return res.json([]);

    // Normalize search: convert non-alphanumeric characters into spaces,
    // so searches like "swiss/roll" still work when user types "swiss roll".
    const normalized = raw.replace(/[^a-z0-9\s]+/g, ' ');
    const words = normalized.split(/\s+/).filter(Boolean); // remove empty tokens

    if (words.length === 0) return res.json([]);

    const db = getDbConnection();
    const sql = `SELECT DISTINCT category FROM inventory ORDER BY category`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: err.message });
        db.close();
        return;
      }

      // Convert category to lowercase and normalize similarly for fair comparison
      const filtered = rows
        .map(r => r.category)
        .filter(cat => {
          const text = (cat || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ');
          // Every search word must appear somewhere in the normalized text
          return words.every(w => text.includes(w));
        });

      res.json(filtered);
      db.close();
    });
  } catch (e) {
    console.error('Search handler error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Load all
app.get('/api/inventory/admin', checkAuth, (req, res) => {
  const sql = "SELECT * FROM inventory ORDER BY category";
  const db = getDbConnection();
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
  db.close();
});

// Admin: get one
app.get('/api/inventory/:id', checkAuth, (req, res) => {
  const sql = "SELECT * FROM inventory WHERE id = ?";
  const db = getDbConnection();
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
  db.close();
});

// Admin: Create
app.post('/api/inventory', checkAuth, (req, res) => {
  const { name, category } = req.body;
  const sql = "INSERT INTO inventory (name, category) VALUES (?, ?)";
  const db = getDbConnection();
  db.run(sql, [name, category], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, category });
  });
  db.close();
});

// Admin: Update
app.put('/api/inventory/:id', checkAuth, (req, res) => {
  const { name, category } = req.body;
  const sql = "UPDATE inventory SET name = ?, category = ? WHERE id = ?";
  const db = getDbConnection();
  db.run(sql, [name, category, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Update successful' });
  });
  db.close();
});

// Admin: Delete
app.delete('/api/inventory/:id', checkAuth, (req, res) => {
  const sql = "DELETE FROM inventory WHERE id = ?";
  const db = getDbConnection();
  db.run(sql, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Delete successful' });
  });
  db.close();
});

// Admin: CSV Upload
app.post('/api/inventory/upload', checkAuth, upload.single('csvFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

  const results = [];
  const db = getDbConnection();
  const filePath = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      if (data.name && data.category) {
        results.push(data);
      }
    })
    .on('end', () => {
      if (results.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'CSV is empty or invalid.' });
      }

      let addedCount = 0;

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const stmt = db.prepare("INSERT INTO inventory (name, category) VALUES (?, ?)");

        results.forEach(item => {
          const fullCategory = `${item.category} > ${item.name}`;
          stmt.run(item.name, fullCategory, function(err) {
            if (!err) addedCount++;
          });
        });

        stmt.finalize();
        db.run("COMMIT", (err) => {
          fs.unlinkSync(filePath);
          if (err) return res.status(500).json({ message: 'Database transaction failed.' });

          res.status(201).json({
            message: `Successfully added ${addedCount} new items.`,
            count: addedCount
          });
        });
      });

      db.close();
    })
    .on('error', () => {
      fs.unlinkSync(filePath);
      res.status(500).json({ message: 'Error reading CSV file.' });
    });
});

// ===================================
// === PROTECTED PAGES ===
// ===================================

app.get('/inventory_admin.html', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'inventory_admin.html'));
});

// ===================================
// === SERVER START ===
// ===================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at: http://${LAN_IP}:${PORT}`);
  console.log(`Admin page:       http://${LAN_IP}:${PORT}/inventory_admin.html`);
  console.log(`Public search:    http://${LAN_IP}:${PORT}/inventory_search.html`);
});
