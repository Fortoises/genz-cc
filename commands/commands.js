const Fuse = require('fuse.js');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { isBotAdmin } = require('../handler/handler');
const path = require('path');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let telegramBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

const prefix = process.env.PREFIX || '.';

// ===== Cooldown System =====
const COOLDOWN = parseInt(process.env.COOLDOWN, 10) || 3; // detik
const cooldownMap = {};
// getCooldown: return sisa detik cooldown user untuk command
function getCooldown(user, command) {
  const now = Date.now();
  if (!cooldownMap[command]) return 0;
  if (!cooldownMap[command][user]) return 0;
  const expire = cooldownMap[command][user];
  const sisa = Math.ceil((expire - now) / 1000);
  return sisa > 0 ? sisa : 0;
}
// setCooldown: set cooldown user untuk command
function setCooldown(user, command, detik = COOLDOWN) {
  if (!cooldownMap[command]) cooldownMap[command] = {};
  cooldownMap[command][user] = Date.now() + detik * 1000;
}
// onlyCooldown: return true jika user masih cooldown
function onlyCooldown(user, command) {
  return getCooldown(user, command) > 0;
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
      add: '➕ *Penambahan*',
      delete: '➖ *Penghapusan*',
      import: '✅ *Import*',
    };
    opText = `\n${opMap[operation] || operation} (${jumlah} data)`;
  }
  const total = totalOverride !== null ? totalOverride : db.countBabu();
  return `📜 *List Babu*\n🎲 *Total:* ${total}${opText}\n🕛 ${waktu}`;
}

async function backupToTelegram(db, operation = '', jumlah = 0) {
  if (!telegramBot) return;
  let txt;
  if (getMaxBabuId(db) === 0) {
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

// Helper: hanya untuk owner
function onlyOwner(ctx) {
  // ctx.isOwner harus sudah diisi oleh handler utama
  return ctx.isOwner === true;
}

// Helper: hanya untuk admin atau owner
function onlyAdmin(ctx) {
  // ctx.isAdmin dan ctx.isOwner harus sudah diisi oleh handler utama
  return ctx.isAdmin === true || ctx.isOwner === true;
}

// Helper: urutkan ulang id hanya untuk 5 data dengan id terbesar
function resequenceLastFive(db) {
  let lastFive = db.db.prepare('SELECT rowid, id, name FROM babu ORDER BY id DESC, rowid DESC LIMIT 5').all();
  lastFive = lastFive.sort((a, b) => a.id - b.id); // urut ASC
  let startId = lastFive[0] ? lastFive[0].id : 1;
  for (let i = 0; i < lastFive.length; i++) {
    db.db.prepare('UPDATE babu SET id = ? WHERE rowid = ?').run(startId + i, lastFive[i].rowid);
  }
}

// Helper: urutkan ulang id seluruh data dari 1 sampai jumlah data, urutan nama tetap
function resequenceAllId(db) {
  let all = db.db.prepare('SELECT rowid, name FROM babu ORDER BY rowid ASC').all();
  let id = 1;
  for (const b of all) {
    db.db.prepare('UPDATE babu SET id = ? WHERE rowid = ?').run(id, b.rowid);
    id++;
  }
}

// Helper untuk kirim list babu dengan format .listbabu
async function sendBabuList(sock, from, db, msg) {
  const list = db.db.prepare('SELECT * FROM babu ORDER BY id ASC').all();
  const total = getMaxBabuId(db);
  let text = `*╭─── ⏺️ List Babu Genz*\n*╰─── 🎲 Total:* ${total}\n`;
  list.forEach((b) => {
      text += `*│・${b.id}.${b.name}*\n`;
  });
   text += '*╰───────*\n';
  await sock.sendMessage(from, { text }, { quoted: msg });
}

// Helper: Cek jika bukan grup, balas pesan dan return true
function rejectIfNotGroup(ctx) {
  const { sock, msg } = ctx;
  const from = msg.key.remoteJid;
  if (!ctx.isGroup) {
    sock.sendMessage(from, { text: 'Maaf, bot hanya bisa digunakan di grup.' }, { quoted: msg });
    return true;
  }
  return false;
}

const apiConfigPath = path.join(__dirname, '../database/api_config.json');
function getApiConfig() {
  try {
    return JSON.parse(fs.readFileSync(apiConfigPath, 'utf-8'));
  } catch {
    return { BANNER_FF: '', OUTFIT_FF: '', DATA_AKUN_FF: '' };
  }
}
function setApiConfig(key, value) {
  const config = getApiConfig();
  config[key] = value;
  fs.writeFileSync(apiConfigPath, JSON.stringify(config, null, 2));
}

module.exports = [
  {
    name: 'addbabu',
    description: 'Tambah komunitas ke daftar babu',
    role: ['owner', 'admin', 'akses'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: `Format: ${prefix}addbabu [nama komunitas]` }, { quoted: msg });
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
      await sendBabuList(sock, from, db, msg);
    }
  },
  {
    name: 'deletebabu',
    description: 'Hapus komunitas dari daftar babu (berdasarkan nama, case-insensitive, harus spesifik)',
    role: ['owner', 'admin', 'akses'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: `Format: ${prefix}deletebabu [nama komunitas] (harus spesifik, case-insensitive)` }, { quoted: msg });
        return;
      }
      const del = db.db.prepare('DELETE FROM babu WHERE rowid = (SELECT rowid FROM babu WHERE LOWER(name) = ? LIMIT 1)').run(name.toLowerCase());
      if (del.changes === 0) {
        await sock.sendMessage(from, { text: 'Nama komunitas tidak ditemukan di database.' }, { quoted: msg });
        return;
      }
      await backupToTelegram(db, 'delete', 1);
      if (global.isCleanMode) {
        resequenceAllId(db);
      } else {
        resequenceLastFive(db);
      }
      await sendBabuList(sock, from, db, msg);
    }
  },
  {
    name: 'listbabu',
    description: 'Tampilkan seluruh daftar babu',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      try {
        const { sock, msg, db } = ctx;
        const from = msg.key.remoteJid;
        const list = db.db.prepare('SELECT * FROM babu ORDER BY id ASC').all();
        const total = getMaxBabuId(db);
        if (!list.length) {
          await sock.sendMessage(from, { text: 'Belum ada data babu.' }, { quoted: msg });
          return;
        }
        let text = `*╭─── ⏺️ List Babu Genz*\n*╰─── 🎲 Total:* ${total}\n`;
        list.forEach((b) => {
          text += `*│・${b.id}.${b.name}*\n`;
        });
        text += '*╰───────*\n';
        await sock.sendMessage(from, { text }, { quoted: msg });
      } catch (err) {
        console.error('Error di .listbabu:', err);
        try {
          await ctx.sock.sendMessage(ctx.msg.key.remoteJid, { text: 'Terjadi error di command listbabu.' }, { quoted: ctx.msg });
        } catch {}
      }
    }
  },
  {
    name: 'searchbabu',
    description: 'Cari komunitas dengan fuzzy search',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const keyword = args.join(' ').trim();
      if (!keyword) {
        await sock.sendMessage(from, { text: `Format: ${prefix}searchbabu [kata_kunci]` }, { quoted: msg });
        return;
      }
      const list = db.listBabu(10000, 0);
      const fuse = new Fuse(list, { keys: ['name'], threshold: 0.4 });
      const result = fuse.search(keyword);
      if (!result.length) {
        await sock.sendMessage(from, { text: 'Komunitas tidak ditemukan.' }, { quoted: msg });
        return;
      }
      let text = `*╭─── 🔎 Hasil dari ${keyword}:*\n`;
      result.forEach((r, i) => {
        text += `*│・${i + 1}. ${r.item.name}*\n`;
      });
      text += '*╰───────*\n';
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'addakses',
    description: 'Tambah nomor ke whitelist akses',
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db, args, user } = ctx;
      const from = msg.key.remoteJid;
      const phone = args[0]?.replace(/[^0-9]/g, '');
      if (!phone) {
        await sock.sendMessage(from, { text: `Format: ${prefix}addakses [nomor whatsapp]` }, { quoted: msg });
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
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
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
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db, args, isOwner } = ctx;
      const from = msg.key.remoteJid;
      if (!isOwner) {
        await sock.sendMessage(from, { text: 'Hanya owner yang bisa pakai command ini.' }, { quoted: msg });
        return;
      }
      const phone = args[0]?.replace(/[^0-9]/g, '');
      if (!phone) {
        await sock.sendMessage(from, { text: `Format: ${prefix}deleteakses [nomor whatsapp]` }, { quoted: msg });
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
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      await sock.sendMessage(from, { text: `Silakan gunakan ${prefix}addtxt-risk atau ${prefix}addtxt-clean sesuai kebutuhan.` }, { quoted: msg });
    }
  },
  {
    name: 'menu',
    description: 'Tampilkan menu bot',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      try {
        const { sock, msg } = ctx;
        const from = msg.key.remoteJid;
        const allCmds = module.exports;
        // OWNER ONLY: role persis ['owner']
        const ownerCmds = allCmds.filter(c => Array.isArray(c.role) && c.role.length === 1 && c.role[0] === 'owner');
        // ADMIN ONLY: role mengandung 'admin'
        const adminCmds = allCmds.filter(c => Array.isArray(c.role) && c.role.includes('admin'));
        // AKSES ONLY: role mengandung 'akses' dan TIDAK mengandung 'admin'
        const aksesCmds = allCmds.filter(c => Array.isArray(c.role) && c.role.includes('akses') && !c.role.includes('admin'));
        // PUBLIC: role persis ['public']
        const publicCmds = allCmds.filter(c => Array.isArray(c.role) && c.role.length === 1 && c.role[0] === 'public');
        // Buat menu
        let text = '';
        if (ownerCmds.length) {
        text += '╭─── ✧ *OWNER* ✧\n';
        ownerCmds.forEach(c => {
          text += `│・ *${prefix}${c.name}*\n`;
        });
        text += '╰───୨ৎ────\n';
      }
        if (adminCmds.length) {
        text += '\n╭─── ✧ *ADMIN* ✧\n';
        adminCmds.forEach(c => {
          if (!ownerCmds.includes(c)) {
            text += `│・ *${prefix}${c.name}*\n`;
          }
        });
        text += '╰───୨ৎ────\n';
      }
        if (aksesCmds.length) {
        text += '\n╭─── ✧ *AKSES KHUSUS* ✧\n';
        aksesCmds.forEach(c => {
          if (!ownerCmds.includes(c) && !adminCmds.includes(c)) {
            text += `│・ *${prefix}${c.name}*\n`;
          }
        });
        text += '╰───୨ৎ────\n';
      }
      if (publicCmds.length) {
        text += '\n╭─── ✧ *AKSES KHUSUS* ✧\n';
        publicCmds.forEach(c => {
          text += `│・ *${prefix}${c.name}*\n`;
        });
        text += '╰───୨ৎ────';
      }
        await sock.sendMessage(from, { text }, { quoted: msg });
      } catch (err) {
        console.error('Error di .menu:', err);
        try {
          await ctx.sock.sendMessage(ctx.msg.key.remoteJid, { text: 'Terjadi error di command menu.' }, { quoted: ctx.msg });
        } catch {}
      }
    }
  },
  {
    name: 'deleteall',
    description: 'Hapus semua data babu',
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
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
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      // Cari documentMessage
      const docMsg = deepFindDocumentMessage(msg.message);
      if (!docMsg) {
        await sock.sendMessage(from, { text: `Kirim file .txt sebagai dokumen dengan command ${prefix}addtxt-risk` }, { quoted: msg });
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
        const match = line.match(/^[ \t]*(\d+)\.\s*(.+)$/);
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
      global.isCleanMode = false;
      await sendBabuList(sock, from, db, msg);
    }
  },
  {
    name: 'addtxt-clean',
    description: 'Import file .txt, hanya nama unik, id dan urutan otomatis sesuai urutan file',
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const docMsg = deepFindDocumentMessage(msg.message);
      if (!docMsg) {
        await sock.sendMessage(from, { text: `Kirim file .txt sebagai dokumen dengan command ${prefix}addtxt-clean` }, { quoted: msg });
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
      global.isCleanMode = true;
      await sendBabuList(sock, from, db, msg);
    }
  },
  {
    name: 'brat',
    description: 'Buat stiker brat dari teks',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, args } = ctx;
      const text = args.join(' ').trim();
      if (!text) {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Masukkan teks untuk membuat stiker.' }, { quoted: msg });
        return;
      }
      // Kirim reaksi
      await sock.sendMessage(msg.key.remoteJid, { react: { text: '🕛', key: msg.key } });
      try {
        const axios = require('axios');
        const { Sticker } = require('wa-sticker-formatter');
        const url = `https://api.nekorinn.my.id/maker/brat-v2?text=${encodeURIComponent(text)}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const sticker = new Sticker(response.data, {
          pack: 'Genz',
          author: 'GenzBot',
          type: 'image',
        });
        const stikerBuffer = await sticker.toBuffer();
        await sock.sendMessage(msg.key.remoteJid, { sticker: stikerBuffer }, { quoted: msg });
      } catch (err) {
        console.error('? Error:', err);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Terjadi kesalahan saat membuat stiker.' }, { quoted: msg });
      }
    }
  },
  {
    name: 'hidetag',
    aliases: ['ht'],
    description: 'Kirim pesan mention semua member (khusus admin/owner)',
    role: ['akses', 'owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, args, isGroup } = ctx;
      const from = msg.key.remoteJid;
      if (!isGroup) {
        await sock.sendMessage(from, { text: 'Command ini hanya untuk grup.' }, { quoted: msg });
        return;
      }
      const metadata = await sock.groupMetadata(from);
      if (!isBotAdmin(sock, from, metadata)) {
        await sock.sendMessage(from, { text: 'Bot harus menjadi admin' }, { quoted: msg });
        return;
      }
      const participants = metadata.participants || [];
      const mentions = participants.map(p => p.id);
      const text = args.length ? args.join(' ') : '';
      await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    }
  },
  {
    name: 'sourcecode',
    description: 'Dapatkan link source code bot ini di GitHub',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      try {
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      const githubUrl = 'https://github.com/Fortoises/genz-cc'; // Ganti dengan link repo kamu jika perlu
      const text = `*🔱 Source Code Bot Genz*\n\n` +
        `Bot ini open source!\n` +
        `Kamu bisa cek, pelajari, atau kontribusi di GitHub:\n\n` +
        `${githubUrl}\n\n` +
        `Jangan lupa kasih 🌟 ya!`;
      await sock.sendMessage(from, { text, linkPreview: true }, { quoted: msg });
      } catch (err) {
        console.error('Error di .sourcecode:', err);
        try {
          await ctx.sock.sendMessage(ctx.msg.key.remoteJid, { text: 'Terjadi error di command sourcecode.' }, { quoted: ctx.msg });
        } catch {}
      }
    }
  },
  {
    name: 'ff',
    description: 'Cari info akun Free Fire dengan .ff [id]',
    role: ['public'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      try {
        const { sock, msg, args } = ctx;
        const from = msg.key.remoteJid;
        const id = args[0];
        if (!id || !/^[0-9]+$/.test(id)) {
          await sock.sendMessage(from, { text: `Format: ${prefix}ff [id] (contoh: ${prefix}ff 1815404630)` }, { quoted: msg });
          return;
        }
        const config = getApiConfig();
        const dataUrl = config.DATA_AKUN_FF;
        const bannerUrl = config.BANNER_FF;
        const outfitUrl = config.OUTFIT_FF;
        if (!dataUrl || !bannerUrl || !outfitUrl) {
          await sock.sendMessage(from, { text: `API FF belum di-set. Owner harus set dengan ${prefix}setapi` }, { quoted: msg });
          return;
        }
        const axios = require('axios');
        const url = `${dataUrl}?uid=${id}&region=id`;
        const res = await axios.get(url);
        const data = res.data && res.data.player_info && res.data.player_info.basicInfo;
        if (!data) {
          await sock.sendMessage(from, { text: 'Akun tidak ditemukan atau API error.' }, { quoted: msg });
          return;
        }
        const primeLevel = data.primeLevel?.level ?? '-';
        const name = data.nickname ?? '-';
        const uid = data.accountId ?? '-';
        const level = data.level ?? '-';
        const region = data.region ?? '-';
        const likes = data.liked ?? '-';
        const creditScore = res.data.player_info.creditScoreInfo?.creditScore ?? '-';
        const bio = res.data.player_info.socialInfo?.signature ? res.data.player_info.socialInfo.signature : '-';
        const lastLogin = data.lastLoginAt ? new Date(parseInt(data.lastLoginAt) * 1000).toLocaleString('id-ID', { hour12: false }) : '-';
        const createdAt = data.createAt ? new Date(parseInt(data.createAt) * 1000).toLocaleString('id-ID', { hour12: false }) : '-';
        const text = `*╭─── Free Fire Info*\n` +
          `*│ Prime Level:* ${primeLevel}\n` +
          `*│ Name:* ${name}\n` +
          `*│ UID:* ${uid}\n` +
          `*│ Level:* ${level}\n` +
          `*│ Region:* ${region}\n` +
          `*│ Likes:* ${likes}\n` +
          `*│ Credit Score:* ${creditScore}\n` +
          `*│ Last Login:* ${lastLogin}\n` +
          `*│ Created At:* ${createdAt}\n` +
          `*│ Bio:* ${bio}\n` +
          `*╰────────────*`;
        await sock.sendMessage(from, { text }, { quoted: msg });
        // Info sedang mengirim gambar
        await sock.sendMessage(from, { text: `⭕ *Sedang mengirim gambar profile* [${name}]` }, { quoted: msg });
        // Kirim gambar banner
        const bannerImgUrl = `${bannerUrl}?uid=${id}&region=id`;
        try {
          await sock.sendMessage(from, { image: { url: bannerImgUrl }, caption: `📌 *Profile*` }, { quoted: msg });
        } catch (e) {
          await sock.sendMessage(from, { text: 'Gagal mengambil gambar banner.' }, { quoted: msg });
        }
        await sock.sendMessage(from, { text: `⭕ *Sedang mengirim gambar outfit* [${name}]` }, { quoted: msg });
        // Kirim gambar outfit
        const outfitImgUrl = `${outfitUrl}?uid=${id}&region=id`;
        try {
          await sock.sendMessage(from, { image: { url: outfitImgUrl }, caption: `👤 *Outfit*` }, { quoted: msg });
        } catch (e) {
          await sock.sendMessage(from, { text: 'Gagal mengambil gambar outfit.' }, { quoted: msg });
        }
      } catch (err) {
        console.error('Error di .ff:', err);
        await ctx.sock.sendMessage(ctx.msg.key.remoteJid, { text: 'Gagal mengambil data akun FF. Coba lagi nanti atau pastikan ID benar.' }, { quoted: ctx.msg });
      }
    }
  },
  {
    name: 'listapi',
    description: 'Lihat semua URL API FF (owner only)',
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      const config = getApiConfig();
      let text = '╭─── *List API FF:*\n';
      text += `│ API BANNER FF : ${config.BANNER_FF || 'BELUM DI SET'}\n`;
      text += `│ API OUTFIT FF : ${config.OUTFIT_FF || 'BELUM DI SET'}\n`;
      text += `│ API DATA AKUN FF : ${config.DATA_AKUN_FF || 'BELUM DI SET'}\n`;
      text += '*╰───*';
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'setapi',
    description: 'Set URL API FF (owner only)',
    role: ['owner'],
    execute: async (ctx) => {
      if (rejectIfNotGroup(ctx)) return;
      const { sock, msg, args } = ctx;
      const from = msg.key.remoteJid;
      const key = args[0]?.toUpperCase();
      const url = args[1];
      if (!key || !url || !['BANNER_FF','OUTFIT_FF','DATA_AKUN_FF'].includes(key)) {
      let text = `Format: ${prefix}setapi [Nama Api] [Url]\n\n`;
      text += `*╭─── Nama Nama Api*\n`;
      text += `*│ [BANNER_FF]*\n`;
      text += `*│ [OUTFIT_FF]*\n`;
      text += `*│ [DATA_AKUN_FF]*\n`;
      text += '*╰───*';
        await sock.sendMessage(from, { text }, { quoted: msg });
        return;
      }
      setApiConfig(key, url);
      await sock.sendMessage(from, { text: `API ${key} berhasil di-set ke: ${url}` }, { quoted: msg });
    }
  }
];

// Tambahkan helper cooldown ke semua command
const cooldownHelpers = { onlyCooldown, getCooldown, setCooldown, COOLDOWN };
module.exports.forEach(cmd => Object.assign(cmd, cooldownHelpers));

// Export helper cooldown
module.exports.getCooldown = getCooldown;
module.exports.setCooldown = setCooldown;
module.exports.onlyCooldown = onlyCooldown;
module.exports.COOLDOWN = COOLDOWN; 
