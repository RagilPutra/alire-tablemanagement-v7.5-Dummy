const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'alire-sajian-nusantara-secret-2024';

// ── Users ─────────────────────────────────────────────────────────────────────
const USERS = {
  'Alire': { password: 'Sajiannusantara', role: 'master', displayName: 'Alire' },
};

// ── Data ──────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { bookings: [], waiting: [], nextBid: 1, nextWid: 1 };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch { return { bookings: [], waiting: [], nextBid: 1, nextWid: 1 }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Static files (login page served from root)
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.user = { username, role: user.role, displayName: user.displayName };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json(req.session.user);
  res.status(401).json({ error: 'Not logged in' });
});

// ── Bookings ──────────────────────────────────────────────────────────────────
app.get('/api/bookings', requireAuth, (req, res) => {
  const db = readDB();
  const { date } = req.query;
  const result = date ? db.bookings.filter(b => b.date === date) : db.bookings;
  res.json(result);
});

app.post('/api/bookings', requireAuth, (req, res) => {
  const db = readDB();
  const booking = { id: db.nextBid++, ...req.body };
  db.bookings.push(booking);
  writeDB(db);
  res.status(201).json(booking);
});

app.put('/api/bookings/:id', requireAuth, (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.bookings[idx] = { id, ...req.body };
  writeDB(db);
  res.json(db.bookings[idx]);
});

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.bookings.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// ── Waiting list ──────────────────────────────────────────────────────────────
app.get('/api/waiting', requireAuth, (req, res) => res.json(readDB().waiting));

app.post('/api/waiting', requireAuth, (req, res) => {
  const db = readDB();
  const entry = { id: db.nextWid++, ...req.body };
  db.waiting.push(entry);
  writeDB(db);
  res.status(201).json(entry);
});

app.delete('/api/waiting/:id', requireAuth, (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.waiting.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.waiting.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// ── Download DB Backup ────────────────────────────────────────────────────────
app.get('/api/download-db', authCheck, (req, res) => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="alire_backup_${timestamp}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(DB_FILE);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download database' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── SPA ───────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Alire Floor Manager on port ${PORT}`));
