// Database SQLite untuk bot
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'babu.db');
const db = new Database(dbPath);

// Inisialisasi tabel
function init() {
  db.prepare(`CREATE TABLE IF NOT EXISTS babu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS akses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL UNIQUE,
    granted_by TEXT,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

// Babu
function addBabu(name) {
  return db.prepare('INSERT OR IGNORE INTO babu (name) VALUES (?)').run(name);
}
function deleteBabu(name) {
  return db.prepare('DELETE FROM babu WHERE name = ?').run(name);
}
function listBabu(limit = 100, offset = 0) {
  return db.prepare('SELECT * FROM babu ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
}
function searchBabu(keyword) {
  return db.prepare('SELECT * FROM babu WHERE name LIKE ?').all(`%${keyword}%`);
}
function countBabu() {
  return db.prepare('SELECT COUNT(*) as total FROM babu').get().total;
}

// Akses
function addAkses(phone, granted_by) {
  return db.prepare('INSERT OR IGNORE INTO akses (phone_number, granted_by) VALUES (?, ?)').run(phone, granted_by);
}
function isAkses(phone) {
  return !!db.prepare('SELECT 1 FROM akses WHERE phone_number = ?').get(phone);
}
function listAkses() {
  return db.prepare('SELECT * FROM akses').all();
}

init();

module.exports = {
  addBabu,
  deleteBabu,
  listBabu,
  searchBabu,
  countBabu,
  addAkses,
  isAkses,
  listAkses,
  db // export db instance jika perlu query custom
}; 