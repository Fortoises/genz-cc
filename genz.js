process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("baileys-mod");
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
    try {
      for (const msg of messages) {

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        if (!isGroup) continue;
        const isOwner = OWNER.split(',').map(x=>x.trim()+"@s.whatsapp.net").includes((msg.key.participant||msg.key.remoteJid));
        const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (quotedId) {
          const { getRekapByMessageId } = db;
          const rekap = getRekapByMessageId(quotedId);
          if (rekap) {
            const replyCmd = commands.find(c => c.name === '_play_reply_handler');
            if (replyCmd) {
              await replyCmd.execute({ sock, msg, db });
              continue;
            }
          }
        }
        await handler.onMessage(sock, msg, db, commands, PREFIX, isOwner);
      }
    } catch (err) {
      console.error('FATAL ERROR di messages.upsert:', err);
    }
  });

  console.log('Bot siap!');
})(); 
