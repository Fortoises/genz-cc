const getGroupAdmins = (participants = []) => participants.filter(p => p.admin).map(p => p.id);

async function onMessage(sock, msg, db, commands, prefix, isOwner) {
  try {
    if (!msg.message || !msg.key) return;
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? (msg.key.participant || msg.participant || msg.key.remoteJid) : msg.key.remoteJid;
    if (!sender) return;
    const senderId = sender.split('@')[0];
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text.startsWith(prefix)) return;
    const [cmdName, ...args] = text.slice(prefix.length).trim().split(/\s+/);
    const command = commands.find(c => c.name === cmdName.toLowerCase());
    if (!command) return;

    let userRoles = ['public'];
    let isAdmin = false;
    if (isOwner) {
      userRoles = ['owner', 'admin', 'akses', 'public'];
      isAdmin = true;
    } else if (isGroup) {
      try {
        const metadata = await sock.groupMetadata(from);
        const groupAdmins = getGroupAdmins(metadata.participants);
        const isAdminGroup = groupAdmins.map(jid => jid.split('@')[0]).includes(senderId);
        const isAkses = db.isAkses(senderId);
        if (isAdminGroup && isAkses) {
          userRoles = ['admin', 'akses', 'public'];
          isAdmin = true;
        } else if (isAdminGroup) {
          userRoles = ['admin', 'public'];
          isAdmin = true;
        } else if (isAkses) {
          userRoles = ['akses', 'public'];
        }
      } catch (err) {
        userRoles = ['public'];
        isAdmin = false;
      }
    } else if (db.isAkses(senderId)) {
      userRoles = ['akses', 'public'];
    }
    if (!userRoles || !Array.isArray(userRoles) || userRoles.length === 0) {
      userRoles = ['public'];
    }


    if (!command.role.some(r => userRoles.includes(r))) {
      await sock.sendMessage(from, { text: 'Kamu tidak punya izin untuk command ini.' }, { quoted: msg });
      return;
    }

    // ===== COOLDOWN CHECK =====
    const { onlyCooldown, getCooldown, setCooldown, COOLDOWN } = command;
    if (onlyCooldown && onlyCooldown(senderId, command.name)) {
      const sisa = getCooldown(senderId, command.name);
      await sock.sendMessage(from, { text: `Tunggu ${sisa} detik sebelum menggunakan command ini lagi.` }, { quoted: msg });
      return;
    }

    const ctx = { sock, msg, db, args, user: sender, isGroup, isAdmin, isOwner, userRoles, onlyCooldown, getCooldown, setCooldown, COOLDOWN };
    await command.execute(ctx);
    if (setCooldown) setCooldown(senderId, command.name, COOLDOWN);
  } catch (e) {
    console.error('Handler error:', e);
  }
}


function isBotAdmin(sock, from, metadata) {
  const getNumber = jid => (jid.match(/\d+/) ? jid.match(/\d+/)[0] : jid);
  const groupAdmins = metadata.participants.filter(p => p.admin).map(p => p.id);
  const groupAdminNumbers = groupAdmins.map(getNumber);
  const botNumber = getNumber(sock.user.id);
  return groupAdminNumbers.includes(botNumber);
}

module.exports = { onMessage, isBotAdmin }; 
