'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const {
  DEFAULT_CUSTOM_PAIRING_CODE,
  sanitizePhoneNumber,
  normalizeCustomPairingCode,
  requestCustomPairingCode
} = require('../services/pairing-code');
const {
  isSafeAuthFileName,
  snapshotAuthDirectory,
  restoreAuthDirectory,
  restoreMongoAuthDocument
} = require('../services/session-auth-files');

test('valide le numéro international et le code personnalisé KAIDOBOT', () => {
  assert.equal(sanitizePhoneNumber('+509 47 44-0869'), '50947440869');
  assert.equal(normalizeCustomPairingCode(), 'KAIDOBOT');
  assert.equal(DEFAULT_CUSTOM_PAIRING_CODE, 'KAIDOBOT');
  assert.throws(() => sanitizePhoneNumber('123'), /8 et 15 chiffres/);
  assert.throws(() => normalizeCustomPairingCode('KAIDO'), /exactement 8/);
  assert.throws(() => normalizeCustomPairingCode('KAIDO-01'), /8 lettres ou chiffres/);
});

test('attend le socket puis demande réellement le custom pairing en second argument', async () => {
  const calls = [];
  const socket = {
    authState: { creds: { registered: false } },
    async waitForSocketOpen() { calls.push('ready'); },
    async requestPairingCode(number, customCode) {
      calls.push(['request', number, customCode]);
      return customCode;
    }
  };
  const result = await requestCustomPairingCode({
    socket,
    state: { creds: { registered: false } },
    phoneNumber: '+509 4744 0869'
  });

  assert.deepEqual(calls, ['ready', ['request', '50947440869', 'KAIDOBOT']]);
  assert.deepEqual(result, {
    registered: false,
    number: '50947440869',
    code: 'KAIDOBOT',
    custom: true
  });
});

test('utilise le signal QR documenté si le fork n’expose pas waitForSocketOpen', async () => {
  const EventEmitter = require('node:events');
  const ev = new EventEmitter();
  const socket = {
    ev,
    authState: { creds: { registered: false } },
    async requestPairingCode(number, code) { return `${code}`; }
  };
  const pending = requestCustomPairingCode({ socket, phoneNumber: '50947440869', timeoutMs: 1000 });
  setImmediate(() => ev.emit('connection.update', { qr: 'ready' }));
  assert.equal((await pending).code, 'KAIDOBOT');
  assert.equal(ev.listenerCount('connection.update'), 0);
});

test('ne redemande pas de code pour une session déjà enregistrée', async () => {
  let requests = 0;
  const result = await requestCustomPairingCode({
    socket: {
      authState: { creds: { registered: true } },
      requestPairingCode: async () => { requests += 1; }
    },
    phoneNumber: '50947440869'
  });
  assert.equal(result.registered, true);
  assert.equal(requests, 0);
});

test('réessaie les erreurs transitoires et refuse un code Baileys vide', async () => {
  let requests = 0;
  const socket = {
    authState: { creds: { registered: false } },
    async waitForSocketOpen() {},
    async requestPairingCode() {
      requests += 1;
      if (requests === 1) throw new Error('connexion temporaire');
      return 'KAIDOBOT';
    }
  };
  const result = await requestCustomPairingCode({
    socket,
    phoneNumber: '50947440869',
    attempts: 2,
    delayFn: async () => {}
  });
  assert.equal(result.code, 'KAIDOBOT');
  assert.equal(requests, 2);

  await assert.rejects(
    requestCustomPairingCode({
      socket: { ...socket, requestPairingCode: async () => undefined },
      phoneNumber: '50947440869',
      attempts: 1
    }),
    /aucun code de pairing/
  );
});

test('sauvegarde et restaure tous les fichiers auth multifile sans path traversal', async t => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), 'kaido-auth-source-'));
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'kaido-auth-target-'));
  t.after(async () => {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(target, { recursive: true, force: true });
  });

  await fs.writeFile(path.join(source, 'creds.json'), JSON.stringify({ registered: true }));
  await fs.writeFile(path.join(source, 'pre-key-1.json'), JSON.stringify({ key: 'one' }));
  await fs.writeFile(path.join(source, 'ignore.txt'), 'not auth');
  const snapshot = await snapshotAuthDirectory(source);
  assert.deepEqual(snapshot.map(file => file.name), ['creds.json', 'pre-key-1.json']);

  const restored = await restoreAuthDirectory(target, [
    ...snapshot,
    { name: '../outside.json', content: '{}' }
  ]);
  assert.equal(restored, 2);
  assert.equal(JSON.parse(await fs.readFile(path.join(target, 'creds.json'), 'utf8')).registered, true);
  assert.equal(JSON.parse(await fs.readFile(path.join(target, 'pre-key-1.json'), 'utf8')).key, 'one');
  assert.equal(isSafeAuthFileName('../outside.json'), false);
});

test('restaure aussi les anciens documents Mongo contenant seulement creds', async t => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'kaido-auth-legacy-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  const restored = await restoreMongoAuthDocument(target, { creds: { registered: false, legacy: true } });
  assert.equal(restored, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(target, 'creds.json'), 'utf8')).legacy, true);
});

test('crée et recharge localement une vraie session multifile du fork épinglé', async t => {
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaido-real-auth-'));
  t.after(() => fs.rm(sessionDir, { recursive: true, force: true }));

  const first = await useMultiFileAuthState(sessionDir);
  assert.equal(first.state.creds.registered, false);
  const registrationId = first.state.creds.registrationId;
  first.state.creds.registered = true;
  await first.saveCreds();

  const authFiles = await snapshotAuthDirectory(sessionDir);
  assert.equal(authFiles.some(file => file.name === 'creds.json'), true);

  const reloaded = await useMultiFileAuthState(sessionDir);
  assert.equal(reloaded.state.creds.registered, true);
  assert.equal(reloaded.state.creds.registrationId, registrationId);
});

test('le flux EmpirePair branche la persistance avant le pairing et n’active la session qu’à open', () => {
  const source = require('node:fs').readFileSync(path.join(__dirname, '..', 'pair.js'), 'utf8');
  const empireStart = source.indexOf('async function EmpirePair');
  const empireEnd = source.indexOf('// ---------------- endpoints', empireStart);
  const block = source.slice(empireStart, empireEnd);

  assert.ok(block.indexOf("socket.ev.on('creds.update'") < block.indexOf('requestCustomPairingCode({'));
  assert.match(block, /customCode: config\.PAIRING_CODE \|\| DEFAULT_CUSTOM_PAIRING_CODE/);
  assert.match(block, /browser: Browsers\.ubuntu\('Chrome'\)/);
  assert.match(block, /if \(update\?\.connection === 'open'\) markSessionConnected\(sanitizedNumber, socket\)/);
  assert.doesNotMatch(block, /activeSockets\.set\(sanitizedNumber, socket\)/);
  assert.ok(block.indexOf("socket.ev.on('connection.update', async") < block.indexOf("status: 'pairing_code_ready'"));
  assert.doesNotMatch(block, /res\.send\(\{ code \}\)/);
  assert.doesNotMatch(source, /process\.cwd\(\), 'pair\.html'/);
  const packageJson = require('../package.json');
  assert.equal(
    packageJson.dependencies['@whiskeysockets/baileys'],
    'npm:@itsliaaa/baileys@0.3.18-final'
  );
  const baileysEntry = require.resolve('@whiskeysockets/baileys');
  const socketSource = require('node:fs').readFileSync(
    path.join(path.dirname(baileysEntry), 'Socket', 'socket.js'),
    'utf8'
  );
  assert.match(
    socketSource,
    /requestPairingCode\s*=\s*async\s*\(phoneNumber,\s*customPairingCode\)/
  );
  const pairingPage = require('node:fs').readFileSync(path.join(__dirname, '..', 'pair.html'), 'utf8');
  assert.match(pairingPage, /Code personnalisé[\s\S]*KAIDOBOT/);
  assert.doesNotMatch(pairingPage, /data\.code \|\| data\.pairingCode \|\| "Indisponible"/);
});
