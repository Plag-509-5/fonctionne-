const moment = require('moment-timezone');

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d > 0 ? d + 'j ' : ''}${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
}

module.exports = {
  name: 'menu',
  alias: ['help', 'aide', 'commands', 'list'],
  category: 'general',
  description: 'Affiche la liste complète des commandes disponibles',
  usage: '.menu',
  async execute({ socket, msg, from, sender, senderNumber, prefix, config, sessionCfg, getPluginsByCategory }) {
    const botName = sessionCfg?.botName || config?.BOT_NAME || 'KAIDO-MD';
    const ownerName = config?.OWNER_NAME || 'Mugiwara no plag';
    const timeHaiti = moment().tz('America/Port-au-Prince').format('HH:mm:ss');
    const dateHaiti = moment().tz('America/Port-au-Prince').format('DD/MM/YYYY');
    const uptime = formatUptime(process.uptime());
    const mode = sessionCfg?.MODE || 'public';

    const categories = getPluginsByCategory ? getPluginsByCategory() : {};

    const categoryIcons = {
      general: '🌐 *GÉNÉRAL*',
      tools: '🛠️ *OUTILS & MÉDIA*',
      ai: '🧠 *INTELLIGENCE ARTIFICIELLE*',
      download: '📥 *TÉLÉCHARGEMENTS*',
      group: '👥 *GESTION DE GROUPE*',
      owner: '👑 *PROPRIÉTAIRE*'
    };

    let menuText = `╔══════════════════════╗
║     🐉 *${botName}* 🐉
╚══════════════════════╝

👤 *Utilisateur :* @${senderNumber}
👑 *Créateur :* ${ownerName}
⚙️ *Mode :* ${mode.toUpperCase()}
🕒 *Heure :* ${timeHaiti} (${dateHaiti})
⏱️ *Uptime :* ${uptime}
📌 *Préfixe :* [ *${prefix}* ]

`;

    let totalCommands = 0;

    for (const [catKey, plugins] of Object.entries(categories)) {
      if (plugins && plugins.length > 0) {
        const catTitle = categoryIcons[catKey] || `📁 *${catKey.toUpperCase()}*`;
        menuText += `┌───「 ${catTitle} 」\n`;
        for (const p of plugins) {
          totalCommands++;
          menuText += `│ • \`${prefix}${p.name}\` : _${p.description}_\n`;
        }
        menuText += `└───\n\n`;
      }
    }

    menuText += `┌───「 🎮 *JEUX & MULTIMÉDIA* 」
│ • \`${prefix}ttt\` : _Jouer au Morpion (TicTacToe)_
│ • \`${prefix}delttt\` : _Annuler la partie de Morpion_
│ • \`${prefix}post\` : _Poster un média cité en statut_
│ • \`${prefix}setlang\` : _Changer la langue du bot_
└───

📊 *Total Commandes :* ${totalCommands + 4}
> ${config?.BOT_FOOTER || '𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐏𝐋4𝐆 x TECH MONDIAL'}`;

    const imageUrl = sessionCfg?.logo || config?.IMAGE_PATH || 'https://files.catbox.moe/l1lzbx.png';

    try {
      if (imageUrl && imageUrl.startsWith('http')) {
        await socket.sendMessage(from, {
          image: { url: imageUrl },
          caption: menuText,
          mentions: [sender]
        }, { quoted: msg });
      } else {
        await socket.sendMessage(from, { text: menuText, mentions: [sender] }, { quoted: msg });
      }
    } catch (e) {
      await socket.sendMessage(from, { text: menuText, mentions: [sender] }, { quoted: msg });
    }
  }
};
