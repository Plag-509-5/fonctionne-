const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const FormData = require('form-data');
const axios = require('axios');

async function uploadToCatbox(buffer, filename = 'file.bin') {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, { filename });

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 30000
  });
  return res.data;
}

module.exports = {
  name: 'tourl',
  alias: ['tolink', 'upload', 'url'],
  category: 'tools',
  description: 'Convertit une image, vidéo ou fichier en lien de téléchargement direct',
  usage: '.tourl (en répondant à un média)',
  async execute({ socket, msg, from }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;

    const isImage = target.imageMessage || target.viewOnceMessage?.message?.imageMessage;
    const isVideo = target.videoMessage || target.viewOnceMessage?.message?.videoMessage;
    const isAudio = target.audioMessage;
    const isDoc = target.documentMessage;

    if (!isImage && !isVideo && !isAudio && !isDoc) {
      return await socket.sendMessage(from, {
        text: '❌ *Répondez à une image, une vidéo, un audio ou un document avec .tourl*'
      }, { quoted: msg });
    }

    await socket.sendMessage(from, { text: '⏳ *Téléversement du fichier en cours...*' }, { quoted: msg });

    try {
      let type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document';
      let mediaObj = isImage || isVideo || isAudio || isDoc;

      const stream = await downloadContentFromMessage(mediaObj, type);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      const ext = (mediaObj.mimetype || 'image/jpeg').split('/')[1] || 'bin';
      const filename = `kaido_${Date.now()}.${ext}`;

      const link = await uploadToCatbox(buffer, filename);
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

      const reply = `╭───「 📤 *UPLOAD RÉUSSI* 」───
│ 🔗 *Lien :* ${link}
│ 📁 *Taille :* ${sizeMB} MB
│ 📋 *Type :* ${mediaObj.mimetype || type}
╰─────────────────────────☉`;

      await socket.sendMessage(from, { text: reply }, { quoted: msg });
    } catch (err) {
      console.error('[TOURL ERROR]', err);
      await socket.sendMessage(from, { text: `❌ Échec du téléversement : ${err.message}` }, { quoted: msg });
    }
  }
};
