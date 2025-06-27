// Semua command bot di sini, terstruktur
const Fuse = require('fuse.js');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let telegramBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

function generateBabuTxt(db) {
  const list = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
  let text = '';
  list.forEach((b) => {
    text += `${b.id}.${b.name}\n`;
  });
  return text;
}

function generateBackupCaption(db, operation = '', jumlah = 0, totalOverride = null) {
  const now = new Date();
  const waktu = now.toLocaleString('id-ID', { hour12: false });
  let opText = '';
  if (operation) {
    const opMap = {
      add: '? Penambahan',
      delete: '?? Penghapusan',
      import: '? Import',
    };
    opText = `\n${opMap[operation] || operation} (${jumlah} data)`;
  }
  const total = totalOverride !== null ? totalOverride : db.countBabu();
  return `? *List Babu*\n? *Total:* ${total}${opText}\n? ${waktu}`;
}

async function backupToTelegram(db, operation = '', jumlah = 0) {
  if (!telegramBot) return;
  let txt;
  if (db.countBabu() === 0) {
    txt = 'DATA KOSONG';
  } else {
    txt = generateBabuTxt(db);
  }
  const total = getMaxBabuId(db);
  const caption = generateBackupCaption(db, operation, jumlah, total);
  const filePath = './babu-backup.txt';
  fs.writeFileSync(filePath, txt);
  await telegramBot.sendDocument(TELEGRAM_CHAT_ID, filePath, { caption, parse_mode: 'Markdown' }, { filename: 'babu-backup.txt', contentType: 'text/plain' });
  fs.unlinkSync(filePath);
}

function deepFindDocumentMessage(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.documentMessage) return obj.documentMessage;
  for (const key of Object.keys(obj)) {
    const found = deepFindDocumentMessage(obj[key]);
    if (found) return found;
  }
  return null;
}

// Helper untuk ambil total id terbesar
function getMaxBabuId(db) {
  const row = db.db.prepare('SELECT MAX(id) as maxId FROM babu').get();
  return row && row.maxId ? row.maxId : 0;
}

module.exports = [
  {
    name: 'addbabu',
    description: 'Tambah komunitas ke daftar babu',
    golongan: 'admin',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: 'Format: .addbabu [nama komunitas]' }, { quoted: msg });
        return;
      }
      // Ambil id terbesar di database
      const lastId = db.getMaxBabuId();
      const newId = lastId + 1;
      // Ambil rownum terbesar di database
      const lastRownumRow = db.db.prepare('SELECT MAX(rownum) as maxRownum FROM babu').get();
      const lastRownum = lastRownumRow ? (lastRownumRow.maxRownum || 0) : 0;
      const newRownum = lastRownum + 1;
      db.addBabuWithIdRownum(newId, name, newRownum);
      await backupToTelegram(db, 'add', 1);
      const total = getMaxBabuId(db);
      // Ambil data urut rownum ASC agar sama persis dengan file
      const newList = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
      let text = `List Babu\nTotal: ${total}\n`;
      newList.forEach((b) => {
        text += `${b.id}.${b.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'deletebabu',
    description: 'Hapus komunitas dari daftar babu (berdasarkan nama, case-insensitive, harus spesifik)',
    golongan: 'admin',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: 'Format: .deletebabu [nama komunitas] (harus spesifik, case-insensitive)' }, { quoted: msg });
        return;
      }
      // Hapus entry dengan nama persis (case-insensitive)
      const del = db.db.prepare('DELETE FROM babu WHERE LOWER(name) = ?').run(name.toLowerCase());
      if (del.changes === 0) {
        await sock.sendMessage(from, { text: 'Nama komunitas tidak ditemukan di database.' }, { quoted: msg });
        return;
      }
      // SELALU lakukan re-sequencing id dan rownum dari 1,2,3,...
      const all = db.db.prepare('SELECT name FROM babu ORDER BY rownum ASC').all();
      db.db.prepare('DELETE FROM babu').run();
      let id = 1, rownum = 1;
      for (const b of all) {
        db.addBabuWithIdRownum(id, b.name, rownum);
        id++;
        rownum++;
      }
      await backupToTelegram(db, 'delete', 1);
      const total = getMaxBabuId(db);
      const newList = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
      let text = `List Babu\nTotal: ${total}\n`;
      newList.forEach((b) => {
        text += `${b.id}.${b.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'listbabu',
    description: 'Tampilkan seluruh daftar babu',
    golongan: 'public',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const list = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
      const total = getMaxBabuId(db);
      if (!list.length) {
        await sock.sendMessage(from, { text: 'Belum ada data babu.' }, { quoted: msg });
        return;
      }
      let text = `List Babu\nTotal: ${total}\n`;
      list.forEach((b) => {
        text += `${b.id}.${b.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'searchbabu',
    description: 'Cari komunitas dengan fuzzy search',
    golongan: 'public',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const keyword = args.join(' ').trim();
      if (!keyword) {
        await sock.sendMessage(from, { text: 'Format: .searchbabu [kata_kunci]' }, { quoted: msg });
        return;
      }
      const list = db.listBabu(10000, 0);
      const fuse = new Fuse(list, { keys: ['name'], threshold: 0.4 });
      const result = fuse.search(keyword);
      if (!result.length) {
        await sock.sendMessage(from, { text: 'Komunitas tidak ditemukan.' }, { quoted: msg });
        return;
      }
      let text = 'Hasil:\n';
      result.forEach((r, i) => {
        text += `${i + 1}. ${r.item.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'addakses',
    description: 'Tambah nomor ke whitelist akses',
    golongan: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (ctx) => {
      const { sock, msg, db, args, user } = ctx;
      const from = msg.key.remoteJid;
      const phone = args[0]?.replace(/[^0-9]/g, '');
      if (!phone) {
        await sock.sendMessage(from, { text: 'Format: .addakses [nomor whatsapp]' }, { quoted: msg });
        return;
      }
      if (db.isAkses(phone)) {
        await sock.sendMessage(from, { text: 'Nomor sudah ada di whitelist.' }, { quoted: msg });
        return;
      }
      db.addAkses(phone, user);
      await sock.sendMessage(from, { text: `Akses untuk ${phone} berhasil ditambahkan.` }, { quoted: msg });
    }
  },
  {
    name: 'listakses',
    description: 'Tampilkan semua nomor akses dan role (khusus owner)',
    golongan: 'owner',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg, db, isOwner } = ctx;
      const from = msg.key.remoteJid;
      if (!isOwner) {
        await sock.sendMessage(from, { text: 'Hanya owner yang bisa pakai command ini.' }, { quoted: msg });
        return;
      }
      const akses = db.listAkses();
      if (!akses.length) {
        await sock.sendMessage(from, { text: 'Belum ada nomor akses.' }, { quoted: msg });
        return;
      }
      let text = 'List Akses:\n';
      akses.forEach((a, i) => {
        text += `${i + 1}. ${a.phone_number} (role: ${a.role || 'akses'})\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'deleteakses',
    description: 'Hapus nomor dari akses (khusus owner)',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg, db, args, isOwner } = ctx;
      const from = msg.key.remoteJid;
      if (!isOwner) {
        await sock.sendMessage(from, { text: 'Hanya owner yang bisa pakai command ini.' }, { quoted: msg });
        return;
      }
      const phone = args[0]?.replace(/[^0-9]/g, '');
      if (!phone) {
        await sock.sendMessage(from, { text: 'Format: .deleteakses [nomor whatsapp]' }, { quoted: msg });
        return;
      }
      const exists = db.isAkses(phone);
      if (!exists) {
        await sock.sendMessage(from, { text: 'Nomor tidak ditemukan di akses.' }, { quoted: msg });
        return;
      }
      db.db.prepare('DELETE FROM akses WHERE phone_number = ?').run(phone);
      await sock.sendMessage(from, { text: `Akses untuk ${phone} berhasil dihapus.` }, { quoted: msg });
    }
  },
  {
    name: 'addtxt',
    description: 'Petunjuk penggunaan import .txt',
    golongan: 'admin',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      await sock.sendMessage(from, { text: 'Silakan gunakan .addtxt-risk atau .addtxt-clean sesuai kebutuhan.' }, { quoted: msg });
    }
  },
  {
    name: 'menu',
    description: 'Tampilkan menu bot',
    golongan: 'public',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      const allCmds = module.exports;
      const ownerCmds = allCmds.filter(c => c.golongan === 'owner');
      const adminCmds = allCmds.filter(c => c.golongan === 'admin');
      const publicCmds = allCmds.filter(c => c.golongan === 'public');
      let text = '';
      if (ownerCmds.length) {
        text += '=== OWNER ONLY ===\n';
        ownerCmds.forEach(c => {
          text += `.${c.name} - ${c.description}\n`;
        });
        text += '\n';
      }
      if (adminCmds.length) {
        text += '=== ADMIN/OWNER ===\n';
        adminCmds.forEach(c => {
          text += `.${c.name} - ${c.description}\n`;
        });
        text += '\n';
      }
      if (publicCmds.length) {
        text += '=== PUBLIC ===\n';
        publicCmds.forEach(c => {
          text += `.${c.name} - ${c.description}\n`;
        });
      }
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'addbulk',
    description: 'Tambah banyak komunitas sekaligus (reply ke pesan daftar nama)',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const text = quoted?.conversation || quoted?.extendedTextMessage?.text;
      if (!text) {
        await sock.sendMessage(from, { text: 'Reply ke pesan berisi daftar nama komunitas dengan .addbulk.' }, { quoted: msg });
        return;
      }
      const lines = text.split(/\r?\n/).map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
      let added = 0;
      for (const name of lines) {
        if (!db.searchBabu(name.toUpperCase()).length) {
          db.addBabu(name.toUpperCase());
          added++;
        }
      }
      await backupToTelegram(db, 'import', added);
      await sock.sendMessage(from, { text: `Berhasil import ${added} nama ke database.` }, { quoted: msg });
    }
  },
  {
    name: 'deleteall',
    description: 'Hapus semua data babu',
    golongan: 'owner',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      db.db.prepare('DELETE FROM babu').run();
      await backupToTelegram(db, 'delete', 0);
      await sock.sendMessage(from, { text: 'Berhasil menghapus semua data babu.' }, { quoted: msg });
    }
  },
  {
    name: 'addtxt-risk',
    description: 'Import file .txt, urutan dan nomor PERSIS seperti file, tanpa cek duplikat, tanpa urut ulang',
    golongan: 'admin',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      // Cari documentMessage
      const docMsg = deepFindDocumentMessage(msg.message);
      if (!docMsg) {
        await sock.sendMessage(from, { text: 'Kirim file .txt sebagai dokumen dengan command .addtxt-risk' }, { quoted: msg });
        return;
      }
      const stream = await downloadContentFromMessage(docMsg, 'document');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      const lines = buffer.toString('utf-8').split(/\r?\n/);
      // Hapus semua data lama
      db.db.prepare('DELETE FROM babu').run();
      let count = 0;
      let rownum = 1;
      for (const line of lines) {
        const match = line.match(/^\s*(\d+)\.\s*(.+)$/);
        if (match) {
          const id = parseInt(match[1]);
          const name = match[2].trim();
          db.addBabuWithIdRownum(id, name, rownum);
          count++;
          rownum++;
        } else if (line.trim() !== '') {
          console.log('SKIP:', line);
        }
      }
      await backupToTelegram(db, 'import', count);
      const total = getMaxBabuId(db);
      // Ambil data dari database, urutkan berdasarkan rownum ASC
      const newList = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
      let text = `List Babu\nTotal: ${total}\n`;
      newList.forEach((b) => {
        text += `${b.id}.${b.name}\n`;
      });
      await sock.sendMessage(from, { text: `Import selesai. Total data: ${count}` }, { quoted: msg });
    }
  },
  {
    name: 'addtxt-clean',
    description: 'Import file .txt, hanya nama unik, id dan urutan otomatis sesuai urutan file',
    golongan: 'admin',
    groupOnly: true,
    adminOnlyAkses: true,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const docMsg = deepFindDocumentMessage(msg.message);
      if (!docMsg) {
        await sock.sendMessage(from, { text: 'Kirim file .txt sebagai dokumen dengan command .addtxt-clean' }, { quoted: msg });
        return;
      }
      const stream = await downloadContentFromMessage(docMsg, 'document');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      const lines = buffer.toString('utf-8').split(/\r?\n/);
      db.db.prepare('DELETE FROM babu').run();
      let count = 0;
      let rownum = 1;
      let id = 1;
      const usedNames = new Set();
      for (const line of lines) {
        const match = line.match(/^\s*\d+\.\s*(.+)$/);
        if (match) {
          const name = match[1].trim();
          const nameLower = name.toLowerCase();
          if (!usedNames.has(nameLower)) {
            db.addBabuWithIdRownum(id, name, rownum);
            usedNames.add(nameLower);
            count++;
            rownum++;
            id++;
          }
        }
      }
      await backupToTelegram(db, 'import', count);
      const total = getMaxBabuId(db);
      const newList = db.db.prepare('SELECT * FROM babu ORDER BY rownum ASC').all();
      let text = `List Babu\nTotal: ${total}\n`;
      newList.forEach((b) => {
        text += `${b.id}.${b.name}\n`;
      });
      await sock.sendMessage(from, { text: `Import selesai. Total data: ${count}` }, { quoted: msg });
    }
  }
]; 
