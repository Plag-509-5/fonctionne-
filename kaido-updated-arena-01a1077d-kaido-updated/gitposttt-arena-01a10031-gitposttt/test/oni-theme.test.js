'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TOP_DIVIDER,
  bold,
  italic,
  spacedTitle,
  commandText,
  genericCommandResponse,
  withCommandTheme,
  activateCommandTheme,
  setupCommandThemeWrapper
} = require('../services/oni-theme');

const menuPlugin = require('../plugins/general/menu');
const pingPlugin = require('../plugins/general/ping');

test('produit les caractères exacts du thème Onigashima', () => {
  assert.equal(bold('KAIDO 2026'), '𝗞𝗔𝗜𝗗𝗢 𝟮𝟬𝟮𝟲');
  assert.equal(italic('menu'), '𝙢𝙚𝙣𝙪');
  assert.equal(commandText('.menu'), '.𝙢𝙚𝙣𝙪');
  assert.equal(spacedTitle('PING'), '𝗣 𝗜 𝗡 𝗚');
});

test('unifie automatiquement les réponses des commandes sans doubler un thème existant', async () => {
  const sent = [];
  const socket = {
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options });
      return { key: { id: String(sent.length) } };
    }
  };
  setupCommandThemeWrapper(socket);

  await socket.sendMessage('chat', { text: 'hors commande' });
  await withCommandTheme(async () => {
    activateCommandTheme('classic', false);
    await socket.sendMessage('chat', { text: 'thème désactivé' });
  });
  await withCommandTheme(async () => {
    activateCommandTheme('alive');
    await socket.sendMessage('chat', { text: 'Le bot fonctionne.' });
    const themed = genericCommandResponse('alive', 'Déjà stylé');
    await socket.sendMessage('chat', { text: themed });
    await socket.sendMessage('status@broadcast', { text: 'Statut fourni par l’utilisateur' });
    await socket.sendMessage('chat', { text: 'Contenu brut', _skipOniTheme: true });
    await socket.sendMessage('chat', { image: Buffer.from('x'), caption: 'A'.repeat(1000) });
  });

  assert.equal(sent[0].content.text, 'hors commande');
  assert.equal(sent[1].content.text, 'thème désactivé');
  assert.match(sent[2].content.text, /𝗔 𝗟 𝗜 𝗩 𝗘\s+𝗥 𝗘 𝗦 𝗨 𝗟 𝗧/);
  assert.match(sent[2].content.text, /Le bot fonctionne\./);
  assert.equal(sent[3].content.text.split(TOP_DIVIDER).length, 5, 'le thème ne doit pas être imbriqué');
  assert.equal(sent[4].content.text, 'Statut fourni par l’utilisateur');
  assert.deepEqual(sent[5].content, { text: 'Contenu brut' });
  assert.equal(sent[6].content.caption.length, 1000, 'une longue caption média doit rester intacte');
});

test('isole le thème de deux commandes concurrentes avec AsyncLocalStorage', async () => {
  const sent = [];
  const socket = {
    async sendMessage(jid, content) {
      sent.push({ jid, text: content.text });
    }
  };
  setupCommandThemeWrapper(socket);

  await Promise.all([
    withCommandTheme(async () => {
      activateCommandTheme('ping');
      await new Promise(resolve => setTimeout(resolve, 15));
      await socket.sendMessage('chat-ping', { text: 'réponse ping' });
    }),
    withCommandTheme(async () => {
      activateCommandTheme('alive');
      await socket.sendMessage('chat-alive', { text: 'réponse alive' });
    })
  ]);

  const ping = sent.find(entry => entry.jid === 'chat-ping').text;
  const alive = sent.find(entry => entry.jid === 'chat-alive').text;
  assert.match(ping, /𝗣 𝗜 𝗡 𝗚\s+𝗥 𝗘 𝗦 𝗨 𝗟 𝗧/);
  assert.match(alive, /𝗔 𝗟 𝗜 𝗩 𝗘\s+𝗥 𝗘 𝗦 𝗨 𝗟 𝗧/);
});

test('le menu répertorie les commandes et alias réels sans reprendre les exemples fictifs', () => {
  const categories = {
    general: [
      { name: 'menu', aliases: ['menu', 'help', 'aide'] },
      { name: 'ping', aliases: ['ping', 'latency'] }
    ],
    tools: [{ name: 'tourl', aliases: ['tourl', 'upload'] }],
    owner: [{ name: 'config', aliases: ['config', 'settings'] }]
  };
  const legacyCommands = ['menu', 'ping', 'ad', 'cfn', 'playvideo', 'ttt', 'delsession'];
  const catalog = menuPlugin._test.buildCommandSections(categories, legacyCommands, '.');
  const output = catalog.sections.flatMap(section => section.lines).join('\n');

  for (const command of ['.𝙢𝙚𝙣𝙪', '.𝙝𝙚𝙡𝙥', '.𝙥𝙞𝙣𝙜', '.𝙩𝙤𝙪𝙧𝙡', '.𝙖𝙙', '.𝙘𝙛𝙣', '.𝙥𝙡𝙖𝙮𝙫𝙞𝙙𝙚𝙤', '.𝙩𝙩𝙩', '.𝙙𝙚𝙡𝙨𝙚𝙨𝙨𝙞𝙤𝙣']) {
    assert.match(output, new RegExp(command.replace('.', '\\.')));
  }
  assert.doesNotMatch(output, /𝙨𝙪𝙙𝙤|𝙯𝙖𝙮/);
  assert.equal(catalog.total, 14);
});

test('le menu complet respecte le nouveau cadre et le mode prefixless', () => {
  const text = menuPlugin._test.buildMenuText({
    botName: 'KAIDO-MD',
    ownerName: 'PLAG',
    userName: 'Mugiwara',
    prefix: '',
    mode: 'public',
    uptime: '1h 2m',
    year: '2026',
    categories: { general: [{ name: 'menu', aliases: ['menu', 'help'] }] },
    legacyCommands: ['ping']
  });

  assert.match(text, /𝗞𝗔𝗜𝗗𝗢 𝗠𝗗/);
  assert.match(text, /𝗢𝗡𝗜𝗚𝗔𝗦𝗛𝗜𝗠𝗔 𝗧𝗛𝗘𝗠𝗘/);
  assert.match(text, /\[ PREFIXLESS \]/);
  assert.match(text, /𝙢𝙚𝙣𝙪/);
  assert.match(text, /𝗣𝗟𝗔𝗚 𝗧𝗘𝗖𝗛/);
  assert.match(text, /𝗞𝗔𝗜𝗗𝗢 𝗠𝗗 @2026/);
});

test('ping utilise exactement le nouveau style sans ancien cadre', () => {
  const text = pingPlugin._test.buildPingText(474);
  assert.match(text, /𝗣 𝗜 𝗡 𝗚\s+𝗥 𝗘 𝗦 𝗨 𝗟 𝗧/);
  assert.match(text, /𝗟 𝗔 𝗧 𝗘 𝗡 𝗖 𝗘/);
  assert.match(text, /𝟰𝟳𝟰𝗺𝘀/);
  assert.match(text, /𝙊𝙉𝙇𝙄𝙉𝙀/);
  assert.match(text, /𝗞𝗔𝗜𝗗𝗢 𝗠𝗗/);
  assert.doesNotMatch(text, /KAIDO SPEED|╭───/);
});
