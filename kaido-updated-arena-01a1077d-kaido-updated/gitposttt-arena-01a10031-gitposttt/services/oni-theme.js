'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const TOP_DIVIDER = '༺═────────────⛩────────────═༻';
const BOX_TOP = '╔══════════════════════════════╗';
const BOX_BOTTOM = '╚══════════════════════════════╝';
const THEME_CONTEXT = new AsyncLocalStorage();
const WRAPPED_SOCKET = Symbol('kaidoOniThemeWrapped');
const MAX_SAFE_CAPTION_LENGTH = 1024;

const BOLD_MAP = Object.fromEntries([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((char, index) => [char, String.fromCodePoint(0x1D5D4 + index)]),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((char, index) => [char, String.fromCodePoint(0x1D5EE + index)]),
  ...'0123456789'.split('').map((char, index) => [char, String.fromCodePoint(0x1D7EC + index)])
]);

const ITALIC_MAP = Object.fromEntries([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((char, index) => [char, String.fromCodePoint(0x1D63C + index)]),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((char, index) => [char, String.fromCodePoint(0x1D656 + index)]),
  ...'0123456789'.split('').map((char, index) => [char, String.fromCodePoint(0x1D7EC + index)])
]);

function mapCharacters(value, map) {
  return [...String(value || '')].map(char => map[char] || char).join('');
}

function bold(value) {
  return mapCharacters(value, BOLD_MAP);
}

function italic(value) {
  return mapCharacters(value, ITALIC_MAP);
}

function spacedTitle(value) {
  return String(value || '')
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => [...word].map(char => bold(char)).join(' '))
    .join('  ');
}

function commandText(value) {
  const raw = String(value || '');
  const prefixMatch = raw.match(/^([^a-z0-9]*)(.*)$/i);
  return `${prefixMatch?.[1] || ''}${italic(prefixMatch?.[2] || raw)}`;
}

function sectionHeader(title, icon = '⛩') {
  return `${BOX_TOP}\n║  ${icon}  ${spacedTitle(title)}  ${icon}\n${BOX_BOTTOM}`;
}

function oniHeader(title) {
  return `${TOP_DIVIDER}\n\n     ⟅ 雷 ⟆  ${spacedTitle(title)}  ⟅ 雷 ⟆\n\n${TOP_DIVIDER}`;
}

function oniFooter(label = 'KAIDO MD') {
  return `${TOP_DIVIDER}\n        ❖  ${bold(label.toUpperCase())}  ❖\n${TOP_DIVIDER}`;
}

function isOniThemed(text) {
  return String(text || '').includes(TOP_DIVIDER);
}

function genericCommandResponse(command, text) {
  if (!text || isOniThemed(text)) return text;
  const title = `${String(command || 'KAIDO').replace(/[-_]+/g, ' ')} RESULT`;
  return `${oniHeader(title)}\n\n${sectionHeader('RESPONSE', '⛩')}\n\n${String(text).trim()}\n\n${oniFooter()}`;
}

function withCommandTheme(callback) {
  return THEME_CONTEXT.run({ enabled: false, command: '' }, callback);
}

function activateCommandTheme(command) {
  const state = THEME_CONTEXT.getStore();
  if (!state) return;
  state.command = String(command || 'kaido').toLowerCase();
  state.enabled = true;
}

function styleContentForCurrentCommand(content, jid = '') {
  const state = THEME_CONTEXT.getStore();
  if (!content || typeof content !== 'object') return content;
  const next = { ...content };
  if (Object.prototype.hasOwnProperty.call(next, '_skipOniTheme')) {
    delete next._skipOniTheme;
    return next;
  }
  // Une commande peut publier le contenu fourni par l'utilisateur sur un
  // statut ou une chaîne. Ce contenu n'est pas une réponse du bot.
  const target = String(jid || '');
  if (!state?.enabled || target === 'status@broadcast' || target.endsWith('@newsletter')) return content;

  let changed = false;
  if (typeof content.text === 'string' && content.text.trim() && !isOniThemed(content.text)) {
    next.text = genericCommandResponse(state.command, content.text);
    changed = true;
  }
  if (typeof content.caption === 'string' && content.caption.trim() && !isOniThemed(content.caption)) {
    const themedCaption = genericCommandResponse(state.command, content.caption);
    // Ne jamais faire échouer l'envoi d'un média pour l'esthétique. Les
    // anciennes versions de WhatsApp limitent encore les captions à 1 024.
    if (themedCaption.length <= MAX_SAFE_CAPTION_LENGTH) {
      next.caption = themedCaption;
      changed = true;
    }
  }
  return changed ? next : content;
}

function setupCommandThemeWrapper(socket) {
  if (!socket?.sendMessage || socket[WRAPPED_SOCKET]) return;
  const originalSendMessage = socket.sendMessage.bind(socket);
  socket.sendMessage = (jid, content, options = {}) => {
    return originalSendMessage(jid, styleContentForCurrentCommand(content, jid), options);
  };
  Object.defineProperty(socket, WRAPPED_SOCKET, { value: true });
}

module.exports = {
  TOP_DIVIDER,
  BOX_TOP,
  BOX_BOTTOM,
  bold,
  italic,
  spacedTitle,
  commandText,
  sectionHeader,
  oniHeader,
  oniFooter,
  isOniThemed,
  genericCommandResponse,
  withCommandTheme,
  activateCommandTheme,
  styleContentForCurrentCommand,
  setupCommandThemeWrapper
};
