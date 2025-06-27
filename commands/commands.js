// Semua command bot di sini, terstruktur
const Fuse = require('fuse.js');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let telegramBot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

function generateBabuTxt(db) {
  const list = db.listBabu(10000, 0);
  let text = `List Babu\nTotal: ${list.length}\n`;
  list.reverse().forEach((b, i) => {
    text += `${i + 1}. ${b.name}\n`;
  });
  return text;
}

async function backupToTelegram(db) {
  if (!telegramBot) return;
  const txt = generateBabuTxt(db);
  const filePath = './babu-backup.txt';
  fs.writeFileSync(filePath, txt);
  await telegramBot.sendDocument(TELEGRAM_CHAT_ID, filePath, {}, { filename: 'babu-backup.txt', contentType: 'text/plain' });
  fs.unlinkSync(filePath);
}

module.exports = [
  {
    name: 'addbabu',
    description: 'Tambah komunitas ke daftar babu',
    groupOnly: true,
    adminOnly: true,
    execute: async (ctx) => {
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: 'Format: .addbabu [nama komunitas]' }, { quoted: msg });
        return;
      }
      const exists = db.searchBabu(name.toUpperCase()).length > 0;
      if (exists) {
        await sock.sendMessage(from, { text: 'Nama sudah ada di database.' }, { quoted: msg });
        return;
      }
      db.addBabu(name.toUpperCase());
      await backupToTelegram(db);
      const total = db.countBabu();
      const list = db.listBabu(10000, 0);
      let text = `List Babu\nTotal: ${total}\n`;
      list.reverse().forEach((b, i) => {
        text += `${i + 1}. ${b.name}\n`;
      });
      const sent = await sock.sendMessage(from, { text }, { quoted: msg });
      try {
        await sock.groupPinMessage(from, sent.key.id);
      } catch (e) {
        await sock.sendMessage(from, { text: 'Gagal pin pesan. Bot tidak punya akses pin.' }, { quoted: sent });
      }
    }
  },
  {
    name: 'deletebabu',
    description: 'Hapus komunitas dari daftar babu',
    groupOnly: true,
    adminOnly: true,
    execute: async (ctx) => {
      const { sock, msg, db, args } = ctx;
      const from = msg.key.remoteJid;
      const name = args.join(' ').trim();
      if (!name) {
        await sock.sendMessage(from, { text: 'Format: .deletebabu [nama komunitas]' }, { quoted: msg });
        return;
      }
      const exists = db.searchBabu(name.toUpperCase()).length > 0;
      if (!exists) {
        await sock.sendMessage(from, { text: 'Nama tidak ditemukan di database.' }, { quoted: msg });
        return;
      }
      db.deleteBabu(name.toUpperCase());
      await backupToTelegram(db);
      const total = db.countBabu();
      const list = db.listBabu(1000, 0);
      let text = `List Babu\nTotal: ${total}\n`;
      list.reverse().forEach((b, i) => {
        text += `${i + 1}. ${b.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'listbabu',
    description: 'Tampilkan seluruh daftar babu',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const list = db.listBabu(10000, 0);
      const total = db.countBabu();
      if (!list.length) {
        await sock.sendMessage(from, { text: 'Belum ada data babu.' }, { quoted: msg });
        return;
      }
      let text = `List Babu\nTotal: ${total}\n`;
      list.reverse().forEach((b, i) => {
        text += `${i + 1}. ${b.name}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  },
  {
    name: 'searchbabu',
    description: 'Cari komunitas dengan fuzzy search',
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
      const list = db.listBabu(1000, 0);
      const fuse = new Fuse(list, { keys: ['name'], threshold: 0.3 });
      const result = fuse.search(keyword);
      if (!result.length) {
        await sock.sendMessage(from, { text: 'Komunitas tidak ditemukan.' }, { quoted: msg });
        return;
      }
      const found = result[0].item.name;
      await sock.sendMessage(from, { text: `Hasil: ${found}` }, { quoted: msg });
    }
  },
  {
    name: 'addakses',
    description: 'Tambah nomor ke whitelist akses',
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
    name: 'addtxt',
    description: 'Import daftar babu dari file .txt',
    groupOnly: true,
    adminOnly: true,
    execute: async (ctx) => {
      const { sock, msg, db } = ctx;
      const from = msg.key.remoteJid;
      const document = msg.message?.documentMessage;
      if (!document) {
        await sock.sendMessage(from, { text: 'Silakan kirim file .txt dengan command .addtxt (reply file).' }, { quoted: msg });
        return;
      }
      const stream = await sock.downloadContentFromMessage(document, 'document');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      const text = buffer.toString('utf-8');
      const lines = text.split(/\r?\n/).map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
      let added = 0;
      for (const name of lines) {
        if (!db.searchBabu(name.toUpperCase()).length) {
          db.addBabu(name.toUpperCase());
          added++;
        }
      }
      await backupToTelegram(db);
      await sock.sendMessage(from, { text: `Berhasil import ${added} nama ke database.` }, { quoted: msg });
    }
  },
  {
    name: 'menu',
    description: 'Tampilkan semua command dan penjelasannya',
    groupOnly: false,
    adminOnly: false,
    execute: async (ctx) => {
      const { sock, msg } = ctx;
      const from = msg.key.remoteJid;
      let text = 'Menu Bot:\n';
      module.exports.forEach(cmd => {
        text += `.${cmd.name} - ${cmd.description}\n`;
      });
      await sock.sendMessage(from, { text }, { quoted: msg });
    }
  }
]; 