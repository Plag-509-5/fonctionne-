'use strict';

const DEFAULT_CUSTOM_PAIRING_CODE = 'KAIDOBOT';

function sanitizePhoneNumber(value) {
  const number = String(value || '').replace(/[^0-9]/g, '');
  if (number.length < 8 || number.length > 15) {
    throw new Error('Le numéro doit contenir entre 8 et 15 chiffres, indicatif pays inclus');
  }
  return number;
}

function normalizeCustomPairingCode(value = DEFAULT_CUSTOM_PAIRING_CODE) {
  const code = String(value || DEFAULT_CUSTOM_PAIRING_CODE).trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    throw new Error('Le code de pairing personnalisé doit contenir exactement 8 lettres ou chiffres');
  }
  return code;
}

function isRegistered(socket, state) {
  return Boolean(socket?.authState?.creds?.registered || state?.creds?.registered);
}

async function withTimeout(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
        timer.unref?.();
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPairingSocket(socket, timeoutMs = 20000) {
  if (!socket) throw new Error('Socket WhatsApp indisponible');
  if (typeof socket.waitForSocketOpen === 'function') {
    await withTimeout(
      Promise.resolve().then(() => socket.waitForSocketOpen()),
      timeoutMs,
      'Le socket WhatsApp n’est pas prêt pour le pairing'
    );
    return;
  }

  if (!socket.ev?.on) {
    throw new Error('Impossible de détecter quand le socket WhatsApp est prêt');
  }
  await new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      socket.ev.off?.('connection.update', handler);
    };
    const handler = update => {
      if (update?.qr || update?.connection === 'open') {
        cleanup();
        resolve();
      } else if (update?.connection === 'close') {
        cleanup();
        reject(new Error('La connexion WhatsApp s’est fermée avant le pairing'));
      }
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Aucun signal de pairing reçu de WhatsApp'));
    }, timeoutMs);
    timer.unref?.();
    socket.ev.on('connection.update', handler);
  });
}

async function requestCustomPairingCode({
  socket,
  state,
  phoneNumber,
  customCode = DEFAULT_CUSTOM_PAIRING_CODE,
  attempts = 3,
  timeoutMs = 20000,
  delayFn = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const number = sanitizePhoneNumber(phoneNumber);
  const code = normalizeCustomPairingCode(customCode);
  if (isRegistered(socket, state)) return { registered: true, number, code: null };
  if (typeof socket?.requestPairingCode !== 'function') {
    throw new Error('Cette version de Baileys ne fournit pas requestPairingCode');
  }

  await waitForPairingSocket(socket, timeoutMs);
  let lastError;
  const maxAttempts = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const generated = await socket.requestPairingCode(number, code);
      if (!generated || typeof generated !== 'string') {
        throw new Error('Baileys n’a retourné aucun code de pairing');
      }
      return { registered: false, number, code: generated, custom: generated === code };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await delayFn(Math.min(1000 * attempt, 3000));
    }
  }
  throw new Error(`Impossible de générer le code de pairing : ${lastError?.message || lastError || 'erreur inconnue'}`);
}

module.exports = {
  DEFAULT_CUSTOM_PAIRING_CODE,
  sanitizePhoneNumber,
  normalizeCustomPairingCode,
  isRegistered,
  waitForPairingSocket,
  requestCustomPairingCode
};
