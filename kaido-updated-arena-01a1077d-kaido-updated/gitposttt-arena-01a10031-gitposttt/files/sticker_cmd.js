const fs = require('fs');
const path = require('path');
let MongoClient = null;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (e) {}

// Chemin de persistance locale
const LOCAL_STORE_FILE = path.join(process.cwd(), 'sticker_commands.json');

// Map en mémoire pour un accès ultra-rapide sans latence
// Structure: Map<hash, { command: string, creator: string, createdAt: number, sessionId: string }>
const stickerCmds = new Map();

let mongoCol = null;

/**
 * Initialise le stockage local et MongoDB
 */
async function initStickerDb(mongoDB) {
  // 1. Charger depuis le fichier local JSON
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.hash && item.command) {
            stickerCmds.set(item.hash, item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[STICKER-CMD] Impossible de lire le fichier JSON local:', err.message);
  }

  // 2. Charger depuis MongoDB si disponible
  try {
    if (mongoDB) {
      mongoCol = mongoDB.collection('sticker_commands');
      await mongoCol.createIndex({ hash: 1 }, { unique: true });
      const docs = await mongoCol.find({}).toArray();
      for (const d of docs) {
        if (d.hash && d.command) {
          stickerCmds.set(d.hash, d);
        }
      }
    }
  } catch (err) {
    console.warn('[STICKER-CMD] Erreur d\'initialisation MongoDB:', err.message);
  }

  console.log(`🧩 [STICKER-CMD] ${stickerCmds.size} commande(s) sticker chargée(s) en mémoire.`);
}

/**
 * Sauvegarde synchrone/asynchrone sur disque et MongoDB
 */
async function persistStickerCmds() {
  try {
    const list = Array.from(stickerCmds.values());
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('[STICKER-CMD] Erreur écriture JSON:', err);
  }
}

/**
 * Extrait tous les identifiants uniques possibles (fileSha256, mediaKey, etc.) d'un message sticker
 * @param {Object} stickerMessage - Le stickerMessage de Baileys
 * @returns {string[]} Liste des identifiants (base64 & hex)
 */
function extractStickerHashes(stickerMessage) {
  if (!stickerMessage) return [];
  const hashes = [];

  const addVal = (val) => {
    if (!val) return;
    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
      hashes.push(Buffer.from(val).toString('base64'));
      hashes.push(Buffer.from(val).toString('hex'));
    } else if (typeof val === 'string') {
      hashes.push(val);
    }
  };

  addVal(stickerMessage.fileSha256);
  addVal(stickerMessage.mediaKey);
  addVal(stickerMessage.fileEncSha256);

  return [...new Set(hashes)].filter(Boolean);
}

/**
 * Récupère le hash principal d'un sticker pour l'enregistrement
 * @param {Object} stickerMessage
 * @returns {string|null}
 */
function getPrimaryStickerHash(stickerMessage) {
  if (!stickerMessage) return null;
  if (stickerMessage.fileSha256) {
    const buf = Buffer.isBuffer(stickerMessage.fileSha256) 
      ? stickerMessage.fileSha256 
      : Buffer.from(stickerMessage.fileSha256);
    return buf.toString('base64');
  }
  if (stickerMessage.mediaKey) {
    const buf = Buffer.isBuffer(stickerMessage.mediaKey) 
      ? stickerMessage.mediaKey 
      : Buffer.from(stickerMessage.mediaKey);
    return buf.toString('base64');
  }
  if (stickerMessage.fileEncSha256) {
    const buf = Buffer.isBuffer(stickerMessage.fileEncSha256) 
      ? stickerMessage.fileEncSha256 
      : Buffer.from(stickerMessage.fileEncSha256);
    return buf.toString('base64');
  }
  return null;
}

/**
 * Enregistre une commande associée à un sticker
 */
async function setStickerCommand(hash, command, creator = '', sessionId = 'global') {
  if (!hash || !command) return false;

  const cleanCmd = command.trim().replace(/^[./!#]/, ''); // Retire le préfixe si présent
  const doc = {
    hash,
    command: cleanCmd,
    creator: String(creator || ''),
    sessionId: String(sessionId || 'global'),
    createdAt: Date.now()
  };

  stickerCmds.set(hash, doc);
  await persistStickerCmds();

  if (mongoCol) {
    try {
      await mongoCol.updateOne({ hash }, { $set: doc }, { upsert: true });
    } catch (e) {
      console.warn('[STICKER-CMD] Erreur upsert Mongo:', e.message);
    }
  }

  return true;
}

/**
 * Cherche si un sticker correspond à une commande enregistrée
 * @param {Object} stickerMessage
 * @returns {{ command: string, hash: string, creator: string }|null}
 */
function findStickerCommand(stickerMessage) {
  if (!stickerMessage) return null;
  const hashes = extractStickerHashes(stickerMessage);

  for (const h of hashes) {
    if (stickerCmds.has(h)) {
      return stickerCmds.get(h);
    }
  }

  return null;
}

/**
 * Supprime une commande associée à un sticker (par hash ou par nom de commande)
 */
async function deleteStickerCommand(hashOrCommand) {
  if (!hashOrCommand) return false;

  let targetHash = null;

  if (stickerCmds.has(hashOrCommand)) {
    targetHash = hashOrCommand;
  } else {
    // Chercher par nom de commande
    const search = hashOrCommand.toLowerCase().trim().replace(/^[./!#]/, '');
    for (const [h, item] of stickerCmds.entries()) {
      if (item.command.toLowerCase() === search) {
        targetHash = h;
        break;
      }
    }
  }

  if (!targetHash) return false;

  stickerCmds.delete(targetHash);
  await persistStickerCmds();

  if (mongoCol) {
    try {
      await mongoCol.deleteOne({ hash: targetHash });
    } catch (e) {
      console.warn('[STICKER-CMD] Erreur suppression Mongo:', e.message);
    }
  }

  return true;
}

/**
 * Liste toutes les commandes de stickers enregistrées
 */
function getAllStickerCommands() {
  return Array.from(stickerCmds.values());
}

// Initialisation au chargement du module
initStickerDb().catch(() => {});

module.exports = {
  initStickerDb,
  extractStickerHashes,
  getPrimaryStickerHash,
  setStickerCommand,
  findStickerCommand,
  deleteStickerCommand,
  getAllStickerCommands
};
