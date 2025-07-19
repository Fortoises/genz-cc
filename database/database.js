const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'babu.db');
const db = new Database(dbPath);


function init() {
  db.prepare(`CREATE TABLE IF NOT EXISTS babu (
    id INTEGER,
    name TEXT NOT NULL,
    rownum INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  try { db.prepare('ALTER TABLE babu ADD COLUMN rownum INTEGER').run(); } catch (e) {}
  db.prepare(`CREATE TABLE IF NOT EXISTS akses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL UNIQUE,
    granted_by TEXT,
    role TEXT DEFAULT 'akses',
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  try {
    db.prepare("ALTER TABLE akses ADD COLUMN role TEXT DEFAULT 'akses'").run();
  } catch (e) {}
  db.prepare(`CREATE TABLE IF NOT EXISTS rekap (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT NOT NULL, -- war/laga
    komunitas TEXT NOT NULL,
    peserta TEXT DEFAULT '[]', -- JSON array of {id, name}
    message_id TEXT, -- id pesan WA yang harus direply
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expired_at DATETIME
  )`).run();
}


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

function addBabuWithId(id, name) {
  return db.prepare('INSERT OR REPLACE INTO babu (id, name) VALUES (?, ?)').run(id, name);
}

function getMaxBabuId() {
  const row = db.prepare('SELECT MAX(id) as maxId FROM babu').get();
  return row ? row.maxId || 0 : 0;
}


function addBabuWithIdRownum(id, name, rownum) {
  return db.prepare('INSERT INTO babu (id, name, rownum) VALUES (?, ?, ?)').run(id, name, rownum);
}


function addRekap({ jenis, komunitas, message_id }) {
  const now = new Date();
  const expired = new Date(now.getTime() + 60 * 60 * 1000); // 1 jam ke depan
  return db.prepare(
    'INSERT INTO rekap (jenis, komunitas, peserta, message_id, created_at, expired_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(jenis, komunitas, '[]', message_id, now.toISOString(), expired.toISOString());
}
function getRekapByKomunitas(komunitas) {
  const now = new Date().toISOString();
  return db.prepare('SELECT * FROM rekap WHERE komunitas = ? AND expired_at > ? ORDER BY created_at DESC LIMIT 1').get(komunitas, now);
}
function getRekapByMessageId(message_id) {
  const now = new Date().toISOString();
  return db.prepare('SELECT * FROM rekap WHERE message_id = ? AND expired_at > ?').get(message_id, now);
}
function updateRekapPeserta(id, pesertaArr) {
  return db.prepare('UPDATE rekap SET peserta = ? WHERE id = ?').run(JSON.stringify(pesertaArr), id);
}
function deleteRekapByKomunitas(komunitas) {
  return db.prepare('DELETE FROM rekap WHERE komunitas = ?').run(komunitas);
}
function clearExpiredRekap() {
  const now = new Date().toISOString();
  return db.prepare('DELETE FROM rekap WHERE expired_at <= ?').run(now);
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
  db, 
  addBabuWithId,
  getMaxBabuId,
  addBabuWithIdRownum,
  addRekap,
  getRekapByKomunitas,
  getRekapByMessageId,
  updateRekapPeserta,
  deleteRekapByKomunitas,
  clearExpiredRekap
}; 