'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const selector = require('../services/group-status-selector');
const {
  unwrapMessage,
  buildGroupStatusPayload
} = require('../services/group-status-content');
const swgc = require('../plugins/group/swgc');
const { groupStatus, isGroupJid } = require('../status');
const { generateWAMessageContent } = require('@whiskeysockets/baileys');

function resetSelections() {
  selector._test.pendingSelections.clear();
  selector._test.selectedGroups.clear();
}

function privateFixture() {
  const sent = [];
  const groups = {
    '222@g.us': {
      id: '222@g.us',
      subject: 'Zèbres',
      participants: [{ id: '50911111111@s.whatsapp.net' }, { id: '5092@s.whatsapp.net' }]
    },
    '111@g.us': {
      id: '111@g.us',
      subject: 'Amis',
      participants: [{ id: '50911111111@s.whatsapp.net' }]
    },
    '333@g.us': {
      id: '333@g.us',
      subject: 'Autres',
      participants: [{ id: '50999999999@s.whatsapp.net' }]
    }
  };
  const socket = {
    user: { id: '50900000000:1@s.whatsapp.net' },
    async groupFetchAllParticipating() { return groups; },
    async groupMetadata(jid) { return groups[jid]; },
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options });
      return { key: { id: String(sent.length) } };
    }
  };
  return {
    sent,
    socket,
    context: {
      socket,
      msg: { key: { remoteJid: '50911111111@s.whatsapp.net', fromMe: false }, message: {} },
      from: '50911111111@s.whatsapp.net',
      sender: '50911111111@s.whatsapp.net',
      senderNumber: '50911111111',
      sessionNumber: '50900000000',
      args: [],
      prefix: '.',
      quotedMsg: null
    }
  };
}

test('liste seulement les groupes dont l’utilisateur fait partie et les trie', async () => {
  const fixture = privateFixture();
  const groups = await selector.listUserGroups(fixture.socket, ['50911111111@s.whatsapp.net']);
  assert.deepEqual(groups.map(group => group.subject), ['Amis', 'Zèbres']);
  assert.deepEqual(groups.map(group => group.jid), ['111@g.us', '222@g.us']);
  const list = selector.renderGroupSelectionList(groups, '.');
  assert.match(list, /1\. Amis/);
  assert.match(list, /2\. Zèbres/);
  assert.match(list, /Réponds simplement avec le numéro/);
});

test('reconnaît les identités PN/LID et leurs champs alternatifs', () => {
  const phoneTokens = selector.identityTokens(['50911111111@s.whatsapp.net']);
  assert.equal(selector.participantMatches({
    id: '100000000000001@lid',
    phoneNumber: '50911111111@s.whatsapp.net'
  }, phoneTokens), true);

  const lidTokens = selector.identityTokens(['100000000000001@lid']);
  assert.equal(selector.participantMatches({
    id: '50911111111@s.whatsapp.net',
    lid: '100000000000001@lid'
  }, lidTokens), true);
});

test('résout un numéro uniquement pour la bonne session et le bon utilisateur', () => {
  resetSelections();
  const groups = [
    { jid: '111@g.us', subject: 'Un' },
    { jid: '222@g.us', subject: 'Deux' }
  ];
  selector.beginGroupSelection('session-5091', 'user-a', groups, 1000);

  assert.equal(selector.resolveGroupSelection('5092', 'user-a', '1', { now: 1001 }).status, 'none');
  assert.equal(selector.resolveGroupSelection('5091', 'user-b', '1', { now: 1001 }).status, 'none');
  assert.equal(selector.resolveGroupSelection('5091', 'user-a', '9', { now: 1001 }).status, 'invalid');
  const selected = selector.resolveGroupSelection('5091', 'user-a', '2', { now: 1001 });
  assert.equal(selected.status, 'selected');
  assert.equal(selected.group.jid, '222@g.us');
  assert.equal(selector.getSelectedGroup('5091', 'user-a').subject, 'Deux');
});

test('expire proprement une sélection qui attend trop longtemps', () => {
  resetSelections();
  selector.beginGroupSelection('5091', 'user', [{ jid: '111@g.us', subject: 'Un' }], 1000);
  const result = selector.resolveGroupSelection('5091', 'user', '1', { now: 7001, ttlMs: 5000 });
  assert.equal(result.status, 'expired');
  assert.equal(selector.getSelectedGroup('5091', 'user'), null);
});

test('construit des statuts propres sans watermark pour texte, image, vidéo et audio', async () => {
  const downloadContent = async function * download(media) {
    yield Buffer.from(media.bytes);
  };
  const text = await buildGroupStatusPayload({ textInput: 'Bonjour propre', random: () => 0 });
  assert.deepEqual(text.payload, { text: 'Bonjour propre', backgroundColor: '#000000', font: 3 });

  const image = await buildGroupStatusPayload({
    quotedMessage: { viewOnceMessage: { message: { imageMessage: { bytes: 'img', caption: 'originale' } } } },
    textInput: 'nouvelle légende',
    downloadContent
  });
  assert.equal(image.type, 'image');
  assert.equal(image.payload.image.toString(), 'img');
  assert.equal(image.payload.caption, 'originale');
  assert.equal(image.payload.mimetype, 'image/jpeg');

  const imageWithoutCaption = await buildGroupStatusPayload({
    quotedMessage: { imageMessage: { bytes: 'img2', mimetype: 'image/png' } },
    textInput: 'légende de commande',
    downloadContent
  });
  assert.equal(imageWithoutCaption.payload.caption, 'légende de commande');
  assert.equal(imageWithoutCaption.payload.mimetype, 'image/png');

  const video = await buildGroupStatusPayload({
    quotedMessage: { videoMessage: { bytes: 'vid', mimetype: 'video/mp4', caption: 'vidéo' } },
    downloadContent
  });
  assert.equal(video.payload.video.toString(), 'vid');
  assert.equal(video.payload.caption, 'vidéo');

  const audio = await buildGroupStatusPayload({
    quotedMessage: { audioMessage: { bytes: 'aud', mimetype: 'audio/ogg', ptt: true } },
    downloadContent
  });
  assert.equal(audio.payload.audio.toString(), 'aud');
  assert.equal(audio.payload.ptt, true);
  assert.doesNotMatch(JSON.stringify([text, image, video, audio]), /posted by|Kaido-MD/i);
  assert.equal(unwrapMessage({ ephemeralMessage: { message: { conversation: 'ok' } } }).conversation, 'ok');
});

test('utilise le chemin Baileys natif groupStatus sans modifier le média', async () => {
  const calls = [];
  const expected = { key: { id: 'GROUP_STATUS_1' } };
  const socket = {
    async sendMessage(jid, content, options) {
      calls.push({ jid, content, options });
      return expected;
    }
  };
  const media = Buffer.from('image-réelle');
  const payload = { image: media, mimetype: 'image/png', caption: 'caption originale' };

  const result = await groupStatus(socket, '123456@g.us', payload);

  assert.equal(result, expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jid, '123456@g.us');
  assert.equal(calls[0].content.image, media);
  assert.equal(calls[0].content.caption, 'caption originale');
  assert.equal(calls[0].content.mimetype, 'image/png');
  assert.equal(calls[0].content.groupStatus, true);
  assert.deepEqual(payload, { image: media, mimetype: 'image/png', caption: 'caption originale' });
  assert.equal(isGroupJid('123456@g.us'), true);
  assert.equal(isGroupJid('123456@s.whatsapp.net'), false);
  await assert.rejects(groupStatus(socket, '123456@s.whatsapp.net', { text: 'non' }), /JID @g\.us/);
});

test('le fork génère image, vidéo et audio dans groupStatusMessageV2 avec isGroupStatus', async () => {
  const uploads = [];
  const options = {
    jid: '123456@g.us',
    logger: { debug() {}, info() {}, warn() {} },
    async upload(encryptedPath, metadata) {
      assert.equal(fs.existsSync(encryptedPath), true);
      uploads.push(metadata.mediaType);
      return {
        mediaUrl: `https://upload.invalid/${metadata.mediaType}`,
        directPath: `/group-status/${metadata.mediaType}`
      };
    }
  };
  const samples = [
    ['image', {
      image: Buffer.from('image-binaire'),
      mimetype: 'image/png',
      caption: 'image originale',
      jpegThumbnail: Buffer.alloc(0)
    }],
    ['video', {
      video: Buffer.from('video-binaire'),
      mimetype: 'video/mp4',
      caption: 'vidéo originale',
      jpegThumbnail: Buffer.alloc(0),
      seconds: 1
    }],
    ['audio', {
      audio: Buffer.from('audio-binaire'),
      mimetype: 'audio/ogg',
      ptt: true,
      seconds: 1,
      waveform: Buffer.alloc(0)
    }]
  ];

  for (const [type, payload] of samples) {
    const generated = await generateWAMessageContent(
      { ...payload, groupStatus: true },
      options
    );
    const inner = generated.groupStatusMessageV2?.message?.[`${type}Message`];
    assert.ok(inner, `${type} absent de groupStatusMessageV2`);
    assert.equal(inner.contextInfo?.isGroupStatus, true);
    assert.equal(inner.mimetype, payload.mimetype);
    assert.ok(inner.fileLength, `${type} n’a pas été téléversé`);
    if (payload.caption) assert.equal(inner.caption, payload.caption);
  }

  assert.deepEqual(uploads, ['image', 'video', 'audio']);

  const text = await generateWAMessageContent({ text: 'Bonjour', groupStatus: true }, options);
  assert.equal(text.groupStatusMessageV2?.message?.extendedTextMessage?.text, 'Bonjour');
  assert.equal(
    text.groupStatusMessageV2?.message?.extendedTextMessage?.contextInfo?.isGroupStatus,
    true
  );
});

test('la version Baileys épinglée ajoute la métadonnée stanza et détecte le média interne', () => {
  const baileysEntry = require.resolve('@whiskeysockets/baileys');
  const relaySource = fs.readFileSync(
    path.join(path.dirname(baileysEntry), 'Socket', 'messages-send.js'),
    'utf8'
  );
  assert.match(relaySource, /metaAttrs\.is_group_status\s*=\s*['"]true['"]/);
  assert.match(
    relaySource,
    /const innerMessage = normalizeMessageContent\(message\);[\s\S]*getMediaType\(innerMessage\)/
  );
});

test('les confirmations swgc restent concises pour chaque type', () => {
  const labels = { image: 'image', video: 'video', audio: 'audio', text: 'texte' };
  for (const [type, label] of Object.entries(labels)) {
    assert.equal(
      swgc._test.groupStatusConfirmation(type, 'Amis'),
      `Statut ${label} posté sur : Amis`
    );
  }
});

test('workflow privé: liste, sélectionne puis publie sans sendMessage dans le groupe', async () => {
  resetSelections();
  const fixture = privateFixture();
  await swgc._test.executeSwgc(fixture.context, {});

  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.sent[0].jid, fixture.context.from);
  assert.match(fixture.sent[0].content.text, /1\. Amis/);
  assert.equal(selector.resolveGroupSelection('50900000000', fixture.context.from, '1').status, 'selected');

  const published = [];
  const publishContext = { ...fixture.context, args: ['Salut', 'le', 'groupe'] };
  await swgc._test.executeSwgc(publishContext, {
    downloadContent: async function * empty() {},
    async publishGroupStatus(socket, jid, payload) { published.push({ socket, jid, payload }); }
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].jid, '111@g.us');
  assert.equal(published[0].payload.text, 'Salut le groupe');
  assert.equal(fixture.sent.filter(event => event.jid.endsWith('@g.us')).length, 0);
  assert.equal(fixture.sent.at(-1).jid, fixture.context.from);
  assert.equal(fixture.sent.at(-1).content.text, 'Statut texte posté sur : Amis');
});

test('même depuis un groupe, swgc ne répond jamais dans la conversation du groupe', async () => {
  resetSelections();
  const fixture = privateFixture();
  const published = [];
  const context = {
    ...fixture.context,
    from: '111@g.us',
    sender: '50911111111@s.whatsapp.net',
    args: ['Statut', 'direct'],
    msg: { key: { remoteJid: '111@g.us', participant: '50911111111@s.whatsapp.net' }, message: {} }
  };
  await swgc._test.executeSwgc(context, {
    downloadContent: async function * empty() {},
    async publishGroupStatus(socket, jid, payload) { published.push({ jid, payload }); }
  });
  assert.equal(published[0].jid, '111@g.us');
  assert.equal(fixture.sent.some(event => event.jid === '111@g.us'), false);
  assert.equal(fixture.sent.at(-1).jid, '50911111111@s.whatsapp.net');
});

test('le handler intercepte la réponse numérique et l’ancien case swgc bruyant a disparu', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pair.js'), 'utf8');
  assert.match(source, /resolveGroupSelection\(sessionId, selectionActor, normalizedBody\)/);
  assert.doesNotMatch(source, /case 'swgc':/);
  const pluginSource = fs.readFileSync(path.join(__dirname, '..', 'plugins/group/swgc.js'), 'utf8');
  assert.doesNotMatch(pluginSource, /sendMessage\(target\.jid|sendMessage\(from/);
  const statusSource = fs.readFileSync(path.join(__dirname, '..', 'status.js'), 'utf8');
  assert.match(statusSource, /groupStatus:\s*true/);
  assert.match(statusSource, /socket\.sendMessage\(jid/);
  assert.doesNotMatch(statusSource, /socket\.relayMessage\(/);

  const packageJson = require('../package.json');
  assert.equal(
    packageJson.dependencies['@whiskeysockets/baileys'],
    'npm:@itsliaaa/baileys@0.3.18-final'
  );
});
