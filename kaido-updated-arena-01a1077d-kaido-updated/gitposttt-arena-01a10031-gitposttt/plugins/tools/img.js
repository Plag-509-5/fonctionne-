'use strict';

const { searchImages } = require('../../services/image-search');

module.exports = {
  name: 'img',
  alias: ['image', 'images', 'image-search'],
  category: 'tools',
  description: 'Recherche des images via l’API publique Wikimedia Commons',
  usage: '.img <recherche>',
  async execute({ socket, msg, from, args, prefix }) {
    const query = args.join(' ').trim();
    if (!query) {
      return socket.sendMessage(from, {
        text: `🔎 Usage : ${prefix}img <mot-clé>\nExemple : ${prefix}img paysages d'Haïti`
      }, { quoted: msg });
    }

    await socket.sendMessage(from, { react: { text: '🔎', key: msg.key } });
    try {
      const images = await searchImages(query, 4);
      if (!images.length) throw new Error('Aucune image compatible trouvée.');

      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        await socket.sendMessage(from, {
          image: { url: image.url },
          caption: `🖼️ *${query}* (${index + 1}/${images.length})\n📄 ${image.title}${image.sourceUrl ? `\n🔗 ${image.sourceUrl}` : ''}`
        }, { quoted: msg });
      }
      await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } catch (error) {
      console.error('[IMG ERROR]', error.message || error);
      await socket.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await socket.sendMessage(from, {
        text: `❌ Recherche d’images impossible : ${error.message || error}`
      }, { quoted: msg });
    }
  }
};
