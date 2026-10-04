const yts = require('yt-search');
const axios = require('axios');
const { ytmp3, ytmp4 } = require('../../youtube');

async function downloadYoutubeAudio(query) {
  let searchResult;
  if (query.startsWith('http')) {
    searchResult = await yts({ videoId: yts.getVideoId(query) }).catch(() => null);
  }
  if (!searchResult) {
    const res = await yts(query);
    searchResult = res.videos && res.videos[0] ? res.videos[0] : null;
  }
  if (!searchResult) throw new Error('Aucun résultat trouvé sur YouTube.');

  const videoUrl = searchResult.url;
  let dlData = null;

  try {
    dlData = await ytmp3(videoUrl);
  } catch (e) {
    // Fallback API
    const fallbackRes = await axios.get(`https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`).catch(() => null);
    if (fallbackRes?.data?.result?.download_url) {
      dlData = {
        titre: fallbackRes.data.result.title || searchResult.title,
        lien: fallbackRes.data.result.download_url,
        miniature: searchResult.thumbnail
      };
    }
  }

  if (!dlData || !dlData.lien) throw new Error('Impossible de générer le lien de téléchargement audio.');

  return {
    title: dlData.titre || searchResult.title,
    duration: searchResult.timestamp || 'N/A',
    views: searchResult.views || 'N/A',
    author: searchResult.author?.name || 'Inconnu',
    thumbnail: dlData.miniature || searchResult.thumbnail,
    downloadUrl: dlData.lien,
    videoUrl
  };
}

module.exports = {
  name: 'play',
  alias: ['song', 'ytmp3', 'music', 'audio'],
  category: 'download',
  description: 'Recherche et télécharge une musique depuis YouTube',
  usage: '.play <titre de la musique ou lien YouTube>',
  async execute({ socket, msg, from, args, prefix }) {
    const query = args.join(' ');
    if (!query) {
      return await socket.sendMessage(from, {
        text: `🎵 *Usage :* \`${prefix}play Céline Dion Titanic\` ou \`${prefix}play https://youtu.be/...\``
      }, { quoted: msg });
    }

    await socket.sendMessage(from, { text: `⏳ *Recherche et conversion de :* "${query}"...` }, { quoted: msg });

    try {
      const data = await downloadYoutubeAudio(query);

      const caption = `╭───「 🎵 *YOUTUBE PLAY* 」───
│ 📌 *Titre :* ${data.title}
│ 👤 *Artiste :* ${data.author}
│ ⏱️ *Durée :* ${data.duration}
│ 👁️ *Vues :* ${data.views}
│ 🔗 *Lien :* ${data.videoUrl}
╰─────────────────────────☉`;

      if (data.thumbnail) {
        await socket.sendMessage(from, {
          image: { url: data.thumbnail },
          caption
        }, { quoted: msg });
      }

      await socket.sendMessage(from, {
        audio: { url: data.downloadUrl },
        mimetype: 'audio/mp4',
        fileName: `${data.title}.mp3`
      }, { quoted: msg });

    } catch (err) {
      console.error('[YOUTUBE DOWNLOAD ERROR]', err);
      await socket.sendMessage(from, { text: `❌ Erreur : ${err.message}` }, { quoted: msg });
    }
  }
};
