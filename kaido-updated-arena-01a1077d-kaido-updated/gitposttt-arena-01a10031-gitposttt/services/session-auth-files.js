'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_AUTH_SNAPSHOT_BYTES = 14 * 1024 * 1024;

function isSafeAuthFileName(value) {
  const name = String(value || '');
  return Boolean(name && name === path.basename(name) && /^[a-zA-Z0-9_.-]+\.json$/.test(name));
}

async function snapshotAuthDirectory(directory, options = {}) {
  const fileSystem = options.fs || fs;
  const maxBytes = options.maxBytes || MAX_AUTH_SNAPSHOT_BYTES;
  const names = await fileSystem.readdir(directory).catch(() => []);
  const files = [];
  let totalBytes = 0;

  for (const name of names.sort()) {
    if (!isSafeAuthFileName(name)) continue;
    const content = await fileSystem.readFile(path.join(directory, name), 'utf8');
    totalBytes += Buffer.byteLength(content);
    if (totalBytes > maxBytes) throw new Error('Les données d’authentification dépassent la taille MongoDB autorisée');
    // Vérifie que le snapshot ne contient pas un fichier tronqué ou non JSON.
    JSON.parse(content);
    files.push({ name, content });
  }
  return files;
}

async function restoreAuthDirectory(directory, authFiles = [], options = {}) {
  const fileSystem = options.fs || fs;
  await fileSystem.mkdir(directory, { recursive: true });
  let restored = 0;
  for (const file of Array.isArray(authFiles) ? authFiles : []) {
    if (!isSafeAuthFileName(file?.name) || typeof file?.content !== 'string') continue;
    JSON.parse(file.content);
    await fileSystem.writeFile(path.join(directory, file.name), file.content, 'utf8');
    restored += 1;
  }
  return restored;
}

async function restoreMongoAuthDocument(directory, document, options = {}) {
  if (!document || typeof document !== 'object') return 0;
  const restored = await restoreAuthDirectory(directory, document.authFiles, options);
  if (restored || !document.creds) return restored;

  // Compatibilité avec les anciennes sessions qui ne stockaient que creds.
  const fileSystem = options.fs || fs;
  await fileSystem.mkdir(directory, { recursive: true });
  await fileSystem.writeFile(
    path.join(directory, 'creds.json'),
    JSON.stringify(document.creds, null, 2),
    'utf8'
  );
  return 1;
}

module.exports = {
  MAX_AUTH_SNAPSHOT_BYTES,
  isSafeAuthFileName,
  snapshotAuthDirectory,
  restoreAuthDirectory,
  restoreMongoAuthDocument
};
