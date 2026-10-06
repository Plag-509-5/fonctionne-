'use strict';

const {
  bold,
  italic,
  oniHeader,
  oniFooter,
  sectionHeader
} = require('../../services/oni-theme');

function buildPingText(latency) {
  return `${oniHeader('PING RESULT')}\n\n` +
    `${sectionHeader('LATENCE', '⛩')}\n\n` +
    `   ❈  ${bold('RESPONSE')}  ⟿   ${bold(`${latency}ms`)}\n` +
    `   ❈  ${bold('STATUS')}    ⟿   ⧉ ${italic('ONLINE')} ⧉\n\n` +
    `${oniFooter('KAIDO MD')}`;
}

module.exports = {
  name: 'ping',
  alias: ['p', 'speed', 'latency', 'pong'],
  category: 'general',
  description: 'Affiche le temps de réponse dans le thème Onigashima',
  usage: '.ping',
  async execute({ socket, msg, from }) {
    const start = process.hrtime.bigint();
    const waitingText = `${oniHeader('PING ANALYSE')}\n\n${sectionHeader('LATENCE', '⛩')}\n\n   ❈  ${italic('CALCUL EN COURS')}...`;
    const sentMessage = await socket.sendMessage(from, { text: waitingText }, { quoted: msg });
    const latency = Number((process.hrtime.bigint() - start) / 1_000_000n);
    const text = buildPingText(latency);

    if (sentMessage?.key) {
      await socket.sendMessage(from, { text, edit: sentMessage.key });
    } else {
      await socket.sendMessage(from, { text }, { quoted: msg });
    }
  },
  _test: { buildPingText }
};
