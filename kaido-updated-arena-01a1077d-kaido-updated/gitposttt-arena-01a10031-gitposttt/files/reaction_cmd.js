const fs = require('fs');
const path = require('path');

// Fichier de persistance locale pour les commandes réactions
const LOCAL_STORE_FILE = path.join(process.cwd(), 'reaction_commands.json');

// Map en mémoire: Map<emoji, { emoji: string, command: string, creator: string, sessionId: string, createdAt: number }>
const reactionCmds = new Map();

let mongoCol = null;

/**
 * Normalise un emoji pour éviter les incohérences de sélecteurs de variation Unicode (ex: \uFE0F)
 * @param {string} emoji
 * @returns {string}
 */
function normalizeEmoji(emoji) {
  if (!emoji || typeof emoji !== 'string') return '';
  return emoji.trim().replace(/[\uFE0E\uFE0F]/g, '');
}

/**
 * Détecte si une chaîne est un emoji ou contient un emoji
 * @param {string} str
 * @returns {boolean}
 */
function isEmoji(str) {
  if (!str || typeof str !== 'string') return false;
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
  return emojiRegex.test(str);
}

/**
 * Initialise le stockage local et MongoDB
 */
async function initReactionDb(mongoDB) {
  // 1. Charger depuis le fichier local JSON
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.emoji && item.command) {
            const key = normalizeEmoji(item.emoji);
            reactionCmds.set(key, item);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[REACTION-CMD] Erreur lecture JSON local:', err.message);
  }

  // 2. Charger depuis MongoDB si disponible
  try {
    if (mongoDB) {
      mongoCol = mongoDB.collection('reaction_commands');
      await mongoCol.createIndex({ emojiKey: 1 }, { unique: true });
      const docs = await mongoCol.find({}).toArray();
      for (const d of docs) {
        if (d.emoji && d.command) {
          const key = normalizeEmoji(d.emoji);
          reactionCmds.set(key, d);
        }
      }
    }
  } catch (err) {
    console.warn('[REACTION-CMD] Erreur initialisation MongoDB:', err.message);
  }

  console.log(`✨ [REACTION-CMD] ${reactionCmds.size} commande(s) réaction chargée(s) en mémoire.`);
}

/**
 * Sauvegarde sur disque
 */
async function persistReactionCmds() {
  try {
    const list = Array.from(reactionCmds.values());
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('[REACTION-CMD] Erreur écriture JSON:', err);
  }
}

/**
 * Enregistre une commande associée à une réaction emoji
 * @param {string} emoji - L'emoji (ex: '✅')
 * @param {string} command - La commande cible (ex: 'save', 'ping', 'tourl')
 * @param {string} [creator='']
 * @param {string} [sessionId='global']
 */
async function setReactionCommand(emoji, command, creator = '', sessionId = 'global') {
  if (!emoji || !command) return false;

  const rawEmoji = emoji.trim();
  const emojiKey = normalizeEmoji(rawEmoji);
  const cleanCmd = command.trim().replace(/^[./!#]/, ''); // Retire préfixe

  const doc = {
    emoji: rawEmoji,
    emojiKey,
    command: cleanCmd,
    creator: String(creator || ''),
    sessionId: String(sessionId || 'global'),
    createdAt: Date.now()
  };

  reactionCmds.set(emojiKey, doc);
  await persistReactionCmds();

  if (mongoCol) {
    try {
      await mongoCol.updateOne({ emojiKey }, { $set: doc }, { upsert: true });
    } catch (e) {
      console.warn('[REACTION-CMD] Erreur upsert Mongo:', e.message);
    }
  }

  return true;
}

/**
 * Recherche une commande par emoji
 * @param {string} emoji
 * @returns {{ emoji: string, command: string, creator: string }|null}
 */
function findReactionCommand(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const key = normalizeEmoji(emoji);
  return reactionCmds.get(key) || null;
}

/**
 * Supprime une commande de réaction (par emoji ou par nom de commande)
 * @param {string} emojiOrCommand
 * @returns {Promise<boolean>}
 */
async function deleteReactionCommand(emojiOrCommand) {
  if (!emojiOrCommand) return false;

  const key = normalizeEmoji(emojiOrCommand);
  let targetKey = null;

  if (reactionCmds.has(key)) {
    targetKey = key;
  } else {
    // Chercher par nom de commande
    const search = emojiOrCommand.toLowerCase().trim().replace(/^[./!#]/, '');
    for (const [k, item] of reactionCmds.entries()) {
      if (item.command.toLowerCase() === search) {
        targetKey = k;
        break;
      }
    }
  }

  if (!targetKey) return false;

  reactionCmds.delete(targetKey);
  await persistReactionCmds();

  if (mongoCol) {
    try {
      await mongoCol.deleteOne({ emojiKey: targetKey });
    } catch (e) {
      console.warn('[REACTION-CMD] Erreur suppression Mongo:', e.message);
    }
  }

  return true;
}

/**
 * Liste toutes les commandes de réaction enregistrées
 */
function getAllReactionCommands() {
  return Array.from(reactionCmds.values());
}

// Initialisation au chargement
initReactionDb().catch(() => {});

module.exports = {
  initReactionDb,
  normalizeEmoji,
  isEmoji,
  setReactionCommand,
  findReactionCommand,
  deleteReactionCommand,
  getAllReactionCommands
};
