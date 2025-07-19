const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateForwardMessageContent,
  prepareWAMessageMedia,
  PHONENUMBER_MCC,
  generateWAMessageFromContent,
  generateMessageID,
  getMessage,
  downloadContentFromMessage,
  makeInMemoryStore,
  jidDecode,
  getAggregateVotesInPollMessage,
  proto
} = require("baileys-mod");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
const axios = require('axios');
const FileType = require('file-type');
const readline = require("readline");
const pairingCode = process.argv.includes("-pairing");
const {
  Boom
} = require('@hapi/boom');
const PhoneNumber = require('awesome-phonenumber');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

//=================================================//
const store = makeInMemoryStore({
  logger: pino().child({
    level: 'silent',
    stream: 'store'
  })
})

//=================================================//
global.sessionName = 'Session'
async function connectToWhatsApp() {
const store = await makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const { state, saveCreds } = await useMultiFileAuthState('session');
const { version } = await axios.get("https://raw.githubusercontent.com/nstar-y/Bail/refs/heads/main/src/Defaults/baileys-version.json").then(res => res.data)
	
const Abib = await makeWASocket({
version: version, 
printQRInTerminal: !pairingCode, 
logger: pino({ level: "silent" }),
auth: state,
browser: ["Ubuntu","Chrome","22.04.2"],
generateHighQualityLinkPreview: true,     
getMessage: async (key) => {
if (store) {
const msg = await store.loadMessage(key.remoteJid, key.id, undefined)
return msg?.message || undefined
}
return {
conversation: 'ABIBxOFC'
}}})
	
if (pairingCode && !Abib.authState.creds.registered) {
let phoneNumber
phoneNumber = await question(chalk.blue.bold('Masukan Nomor WhatsApp :\n'))
phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
let code = await Abib.requestPairingCode(phoneNumber);
code = code.match(/.{1,4}/g).join(" - ") || code
await console.log(`${chalk.blue.bold('Kode Pairing')} : ${chalk.white.bold(code)}`)
}
  //=================================================//
  Abib.decodeJid = (jid) => {
    if (!jid) return jid
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {}
      return decode.user && decode.server && decode.user + '@' + decode.server || jid
    } else return jid
  }
  //=================================================//
  Abib.ev.on('call', async (celled) => {
    let botNumber = await Abib.decodeJid(Abib.user.id)
    let koloi = global.anticall
    if (!koloi) return
    console.log(celled)
    for (let kopel of celled) {
      if (kopel.isGroup == false) {
        if (kopel.status == "offer") {
          let nomer = await Abib.sendTextWithMentions(kopel.from, `*${Abib.user.name}* tidak bisa menerima panggilan ${kopel.isVideo ? `video` : `suara`}. Maaf @${kopel.from.split('@')[0]} kamu akan diblokir. Silahkan hubungi Owner membuka blok !`)
          Abib.sendContact(kopel.from, owner.map(i => i.split("@")[0]), nomer)
          await sleep(8000)
          await Abib.updateBlockStatus(kopel.from, "block")
        }
      }
    }
  })

  //=================================================//
  //Kalau Mau Self Lu Buat Jadi false
  Abib.public = true
  //=================================================//
  //=================================================//
  Abib.ev.on('creds.update', saveCreds)
  //=================================================//
  Abib.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect
    } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.badSession) {
        console.log(`Bad Session File, Please Delete Session and Scan Again`);
        process.exit();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Connection closed, reconnecting....");
        connectToWhatsApp();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Connection Lost from Server, reconnecting...");
        connectToWhatsApp();
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log("Connection Replaced, Another New Session Opened, Please Restart Bot");
        process.exit();
      } else if (reason === DisconnectReason.loggedOut) {
        console.log(`Device Logged Out, Please Delete Folder Session yusril and Scan Again.`);
        process.exit();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Restart Required, Restarting...");
        connectToWhatsApp();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Connection TimedOut, Reconnecting...");
        connectToWhatsApp();
      } else {
        console.log(`Unknown DisconnectReason: ${reason}|${connection}`);
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log(chalk.black(chalk.bgWhite('Berhasil Tersambung')))
    }
  });
  return Abib
}
connectToWhatsApp()
let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.redBright(`Update ${__filename}`))
  delete require.cache[file]
  require(file)
})
