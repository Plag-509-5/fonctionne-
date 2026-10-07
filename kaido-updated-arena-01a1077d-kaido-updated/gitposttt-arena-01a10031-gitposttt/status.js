// status.js

function isGroupJid(jid) {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

/**
 * Publie un vrai statut rattaché au groupe.
 *
 * @itsliaaa/baileys transforme `groupStatus: true` en :
 * - groupStatusMessageV2 ;
 * - contextInfo.isGroupStatus = true sur le contenu interne ;
 * - un nœud stanza <meta is_group_status="true"/> ;
 * - le bon attribut `mediatype` pour les images, vidéos et audios.
 *
 * Le chemin natif sendMessage() évite les enveloppes relayées à la main qui
 * pouvaient être acceptées par le serveur sans rendre leur média visible.
 */
async function groupStatus(socket, jid, content) {
  if (!socket || typeof socket.sendMessage !== "function") {
    throw new Error("Socket WhatsApp invalide.");
  }
  if (!isGroupJid(jid)) {
    throw new Error("Le statut de groupe exige un JID @g.us.");
  }
  if (!content || typeof content !== "object") {
    throw new Error("Contenu de statut invalide.");
  }

  return socket.sendMessage(jid, {
    ...content,
    groupStatus: true
  });
}

async function buildStatusContent(m, socket, prefix, command) {
  const quoted = m.quoted ? m.quoted : m;
  const mime = (quoted.msg || quoted).mimetype || "";
  const textToParse = m.text || m.body || "";
  const caption = textToParse.replace(new RegExp(`^\\${prefix}${command}\\s*`, "i"), "").trim();

  if (/image/.test(mime)) {
    const buffer = await quoted.download();
    return { image: buffer, caption };
  } else if (/video/.test(mime)) {
    const buffer = await quoted.download();
    return { video: buffer, caption };
  } else if (/audio/.test(mime)) {
    const buffer = await quoted.download();
    return { audio: buffer, mimetype: "audio/mp4" };
  } else if (caption) {
    return { text: caption };
  } else {
    throw new Error("no_content");
  }
}

module.exports = { groupStatus, buildStatusContent, isGroupJid };
