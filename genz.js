// Entry point utama bot WhatsApp setelah pairing
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const handler = require("./handler/handler");
const db = require("./database/database");
const commands = require("./commands/commands");

const PREFIX = process.env.PREFIX || '.';
const OWNER = process.env.OWNER || '';

(async () => {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["Ubuntu","Chrome","22.04.2"],
    getMessage: async (key) => undefined
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      // Cek owner
      const isOwner = OWNER.split(',').map(x=>x.trim()+"@s.whatsapp.net").includes((msg.key.participant||msg.key.remoteJid));
      await handler.onMessage(sock, msg, db, commands, PREFIX, isOwner);
    }
  });

  console.log('Bot siap!');
})(); 