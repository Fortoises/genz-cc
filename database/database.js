// Database SQLite untuk bot
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'babu.db');
const db = new Database(dbPath);

// Inisialisasi tabel
function init() {
  // Jangan drop tabel, hanya buat jika belum ada
  db.prepare(`CREATE TABLE IF NOT EXISTS babu (
    id INTEGER,
    name TEXT NOT NULL,
    rownum INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  // Tambah kolom rownum jika belum ada (migrasi manual)
  try { db.prepare('ALTER TABLE babu ADD COLUMN rownum INTEGER').run(); } catch (e) {}
  db.prepare(`CREATE TABLE IF NOT EXISTS akses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL UNIQUE,
    granted_by TEXT,
    role TEXT DEFAULT 'akses',
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  // Tambah kolom role jika belum ada (migrasi manual)
  try {
    db.prepare("ALTER TABLE akses ADD COLUMN role TEXT DEFAULT 'akses'").run();
  } catch (e) {}
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
  return db.prepare('INSERT OR IGNORE INTO akses (phone_number, granted_by, role) VALUES (?, ?, ?)').run(phone, granted_by, 'akses');
}
function isAkses(phone) {
  return !!db.prepare('SELECT 1 FROM akses WHERE phone_number = ?').get(phone);
}
function getRole(phone) {
  const row = db.prepare('SELECT role FROM akses WHERE phone_number = ?').get(phone);
  return row ? row.role : null;
}
function listAkses() {
  return db.prepare('SELECT * FROM akses').all();
}

// Tambah entry dengan id manual (khusus .addtxt-risk dan .addbabu custom id)
function addBabuWithId(id, name) {
  return db.prepare('INSERT OR REPLACE INTO babu (id, name) VALUES (?, ?)').run(id, name);
}
// Ambil id terbesar saat ini
function getMaxBabuId() {
  const row = db.prepare('SELECT MAX(id) as maxId FROM babu').get();
  return row ? row.maxId || 0 : 0;
}

// Tambah entry dengan id, nama, dan rownum (untuk .addtxt-risk pure)
function addBabuWithIdRownum(id, name, rownum) {
  return db.prepare('INSERT INTO babu (id, name, rownum) VALUES (?, ?, ?)').run(id, name, rownum);
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
  getRole,
  listAkses,
  db, // export db instance jika perlu query custom
  addBabuWithId, // export fungsi baru
  getMaxBabuId,   // export fungsi baru
  addBabuWithIdRownum // export fungsi baru
}; 