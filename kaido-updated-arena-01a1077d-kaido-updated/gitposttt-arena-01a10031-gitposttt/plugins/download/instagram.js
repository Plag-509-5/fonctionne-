const axios = require('axios');

async function downloadInstagram(url) {
  try {
    const res = await axios.get(`https://api.giftedtech.web.id/api/download/instagram?apikey=gifted&url=${encodeURIComponent(url)}`, { timeout: 20000 });
    if (res.data?.result) {
      const media = Array.isArray(res.data.result) ? res.data.result : [res.data.result];
      return media;
    }
  } catch (e) {}

  // Fallback API
  try {
    const res = await axios.get(`https://api.nexoracle.com/downloader/insta?url=${encodeURIComponent(url)}&apikey=free_key`, { timeout: 20000 });
    if (res.data?.result) {
      return Array.isArray(res.data.result) ? res.data.result : [{ url: res.data.result.url || res.data.result }];
    }
  } catch (e) {}

  throw new Error('Impossible de télécharger le média Instagram. Lien privé ou expiré.');
}

module.exports = {
  name: 'instagram',
  alias: ['ig', 'reels', 'insta', 'igdl'],
  category: 'download',
  description: 'Télécharge une vidéo, reel ou photo depuis Instagram',
  usage: '.ig <lien Instagram>',
  async execute({ socket, msg, from, args, prefix }) {
    const url = args[0];
    if (!url || !url.includes('instagram.com')) {
      return await socket.sendMessage(from, {
        text: `📸 *Usage :* \`${prefix}ig https://www.instagram.com/reel/...\``
      }, { quoted: msg });
    }

    await socket.sendMessage(from, { text: '⏳ *Téléchargement du média Instagram...*' }, { quoted: msg });

    try {
      const mediaList = await downloadInstagram(url);

      for (const item of mediaList.slice(0, 5)) {
        const itemUrl = typeof item === 'string' ? item : (item.url || item.download_url);
        if (!itemUrl) continue;

        if (itemUrl.includes('.mp4') || (item.type && item.type.includes('video'))) {
          await socket.sendMessage(from, {
            video: { url: itemUrl },
            caption: '📸 *Instagram Reel/Vidéo* — 𝐊𝐚𝐢𝐝𝐨-𝐌𝐃'
          }, { quoted: msg });
        } else {
          await socket.sendMessage(from, {
            image: { url: itemUrl },
            caption: '📸 *Instagram Photo* — 𝐊𝐚𝐢𝐝𝐨-𝐌𝐃'
          }, { quoted: msg });
        }
      }
    } catch (err) {
      console.error('[INSTAGRAM ERROR]', err);
      await socket.sendMessage(from, { text: `❌ ${err.message}` }, { quoted: msg });
    }
  }
};
