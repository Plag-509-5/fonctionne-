const os = require('os');
const moment = require('moment-timezone');

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d > 0 ? d + 'j ' : ''}${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
}

module.exports = {
  name: 'ping',
  alias: ['p', 'speed', 'latency', 'pong'],
  category: 'general',
  description: 'Affiche le temps de réponse et l\'état du serveur',
  usage: '.ping',
  async execute({ socket, msg, from, activeSockets }) {
    const start = Date.now();
    const sentMsg = await socket.sendMessage(from, { text: '⚡ *Calcul de la vitesse...*' }, { quoted: msg });
    const latency = Date.now() - start;

    const usedRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const uptime = formatUptime(process.uptime());
    const activeCount = activeSockets ? activeSockets.size : 1;

    const text = `╭───「 ⚡ *KAIDO SPEED* 」───
│ ⏱️ *Vitesse :* ${latency} ms
│ ⏱️ *Uptime :* ${uptime}
│ 📊 *RAM :* ${usedRam} MB / ${totalRam} GB
│ 🤖 *Sessions Actives :* ${activeCount}
│ 🖥️ *OS :* ${os.platform()} (${os.arch()})
│ 🌐 *Node :* ${process.version}
╰─────────────────────────☉`;

    if (sentMsg && sentMsg.key) {
      await socket.sendMessage(from, { text, edit: sentMsg.key });
    } else {
      await socket.sendMessage(from, { text }, { quoted: msg });
    }
  }
};
