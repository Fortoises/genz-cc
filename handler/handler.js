// Handler event/message utama
const getGroupAdmins = (participants = []) => participants.filter(p => p.admin).map(p => p.id);

async function onMessage(sock, msg, db, commands, prefix, isOwner) {
  try {
    if (!msg.message || !msg.key) return;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text.startsWith(prefix)) return;
    const [cmdName, ...args] = text.slice(prefix.length).trim().split(/\s+/);
    const command = commands.find(c => c.name === cmdName.toLowerCase());
    if (!command) return;

    // Tentukan semua role user (owner otomatis juga admin, akses, public)
    let userRoles = ['public'];
    let isAdmin = false;
    if (isOwner) {
      userRoles = ['owner', 'admin', 'akses', 'public'];
      isAdmin = true;
    } else if (isGroup) {
      const metadata = await sock.groupMetadata(from);
      const groupAdmins = getGroupAdmins(metadata.participants);
      if (groupAdmins.includes(sender)) {
        userRoles = ['admin', 'akses', 'public'];
        isAdmin = true;
      } else if (db.isAkses(sender.split('@')[0])) {
        userRoles = ['akses', 'public'];
      }
    } else if (db.isAkses(sender.split('@')[0])) {
      userRoles = ['akses', 'public'];
    }

    // Cek izin command: jika ADA salah satu role user yang cocok dengan command.role, maka boleh akses
    if (!command.role.some(r => userRoles.includes(r))) {
      await sock.sendMessage(from, { text: 'Kamu tidak punya izin untuk command ini.' }, { quoted: msg });
      return;
    }

    // Context
    const ctx = { sock, msg, db, args, user: sender, isGroup, isAdmin, isOwner, userRoles };
    await command.execute(ctx);
  } catch (e) {
    console.error('Handler error:', e);
  }
}

module.exports = { onMessage }; 