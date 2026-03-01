const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database ---
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT 'note',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  )
`);

function rowToNote(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// List all notes (newest first)
app.get('/api/notes', (_req, res) => {
  const rows = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all();
  res.json(rows.map(rowToNote));
});

// Create a note
app.post('/api/notes', (req, res) => {
  const id = crypto.randomBytes(8).toString('hex');
  const { title = '', body = '', category = 'note' } = req.body;
  const now = Date.now();

  db.prepare(
    'INSERT INTO notes (id, title, body, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, body, category, now, now);

  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  res.status(201).json(rowToNote(row));
});

// Update a note
app.put('/api/notes/:id', (req, res) => {
  const { title, body, category } = req.body;
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);

  if (!existing) {
    return res.status(404).json({ error: 'Note not found' });
  }

  db.prepare(
    'UPDATE notes SET title = ?, body = ?, category = ?, updated_at = ? WHERE id = ?'
  ).run(
    title ?? existing.title,
    body ?? existing.body,
    category ?? existing.category,
    now,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(rowToNote(row));
});

// Delete a note
app.delete('/api/notes/:id', (req, res) => {
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json({ ok: true });
});

// SPA fallback (Express 5 syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Notebook server running at http://localhost:${PORT}`);
});
