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

    // Group only check
    if (command.groupOnly && !isGroup) {
      await sock.sendMessage(from, { text: 'Command ini hanya untuk grup.' }, { quoted: msg });
      return;
    }
    // Admin only check
    let isAdmin = false;
    if (isGroup) {
      const metadata = await sock.groupMetadata(from);
      const groupAdmins = getGroupAdmins(metadata.participants);
      isAdmin = groupAdmins.includes(sender) || isOwner;
    } else {
      isAdmin = isOwner;
    }
    // Role akses check
    let akses = db.isAkses(sender.split('@')[0]);
    let role = db.getRole(sender.split('@')[0]);
    // .addakses tetap hanya admin/owner
    if (command.name === 'addakses' && !isAdmin) {
      await sock.sendMessage(from, { text: 'Hanya admin/owner yang bisa pakai command ini.' }, { quoted: msg });
      return;
    }
    // Command dengan adminOnlyAkses: true -> admin, owner, atau role akses
    if (command.adminOnlyAkses && !isAdmin && role !== 'akses') {
      await sock.sendMessage(from, { text: 'Kamu tidak punya akses ke fitur ini.' }, { quoted: msg });
      return;
    }
    // Context
    const ctx = { sock, msg, db, args, user: sender, isGroup, isAdmin, isOwner, role };
    await command.execute(ctx);
  } catch (e) {
    console.error('Handler error:', e);
  }
}

module.exports = { onMessage }; 
