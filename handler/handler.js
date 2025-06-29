// Handler event/message utama
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

    // Tentukan semua role user (owner otomatis juga admin, akses, public)
    let userRoles = ['public'];
    let isAdmin = false;
    if (isOwner) {
      userRoles = ['owner', 'admin', 'akses', 'public'];
      isAdmin = true;
    } else if (isGroup) {
      try {
        const metadata = await sock.groupMetadata(from);
        const groupAdmins = getGroupAdmins(metadata.participants);
        if (db.isAkses(senderId)) {
          // Jika user ada di whitelist akses, role akses
          userRoles = ['akses', 'public'];
        } else if (groupAdmins.includes(sender)) {
          // Jika admin grup tapi bukan akses, hanya admin
          userRoles = ['admin', 'public'];
          isAdmin = true;
        }
      } catch (err) {
        // Jika gagal ambil metadata grup, fallback ke public
        userRoles = ['public'];
        isAdmin = false;
      }
    } else if (db.isAkses(senderId)) {
      userRoles = ['akses', 'public'];
    }

    // Cek izin command: jika ADA salah satu role user yang cocok dengan command.role, maka boleh akses
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

    // Context
    const ctx = { sock, msg, db, args, user: sender, isGroup, isAdmin, isOwner, userRoles, onlyCooldown, getCooldown, setCooldown, COOLDOWN };
    await command.execute(ctx);
    if (setCooldown) setCooldown(senderId, command.name, COOLDOWN);
  } catch (e) {
    console.error('Handler error:', e);
  }
}

// Helper: cek apakah bot admin di grup
function isBotAdmin(sock, from, metadata) {
  const getNumber = jid => (jid.match(/\d+/) ? jid.match(/\d+/)[0] : jid);
  const groupAdmins = metadata.participants.filter(p => p.admin).map(p => p.id);
  const groupAdminNumbers = groupAdmins.map(getNumber);
  const botNumber = getNumber(sock.user.id);
  return groupAdminNumbers.includes(botNumber);
}

module.exports = { onMessage, isBotAdmin }; 
