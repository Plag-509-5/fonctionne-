const axios = require('axios');

function normalise(data) {
  const root = data?.result || data?.data || data;
  const videoUrl = root?.hd || root?.hd_url || root?.high || root?.sd || root?.sd_url || root?.video || root?.url || root?.links?.[0]?.url;
  return videoUrl ? { title: root.title || root.caption || 'Facebook Video', videoUrl } : null;
}

async function downloadFacebook(url) {
  const providers = [
    () => axios.get('https://api.giftedtech.web.id/api/download/facebook', { params: { apikey: 'gifted', url }, timeout: 20000 }),
    () => axios.get('https://api.ryzendesu.vip/api/downloader/facebook', { params: { url }, timeout: 20000 })
  ];
  for (const provider of providers) {
    try {
      const data = normalise((await provider()).data);
      if (data) return data;
    } catch (e) { console.warn('[FB provider failed]', e.response?.status || e.message); }
  }
  throw new Error('Impossible de télécharger cette vidéo Facebook. Elle est peut-être privée ou le lien a expiré.');
}

module.exports = {
  name: 'facebook',
  alias: ['fb', 'fbdl', 'fbvideo'],
  category: 'download',
  description: 'Télécharge une vidéo depuis Facebook',
  usage: '.fb <lien Facebook>',
  async execute({ socket, msg, from, args, prefix }) {
    const url = args.join(' ').trim();
    if (!url || !/(facebook\.com|fb\.watch)/i.test(url)) return socket.sendMessage(from, { text: `👥 Usage : ${prefix}fb https://fb.watch/...` }, { quoted: msg });
    await socket.sendMessage(from, { text: '⏳ Récupération de la vidéo Facebook...' }, { quoted: msg });
    try {
      const data = await downloadFacebook(url);
      await socket.sendMessage(from, { video: { url: data.videoUrl }, caption: `👥 *Facebook Video* — KAIDO-MD\n📌 ${data.title}`, mimetype: 'video/mp4' }, { quoted: msg });
    } catch (err) {
      console.error('[FB ERROR]', err);
      await socket.sendMessage(from, { text: `❌ ${err.message}` }, { quoted: msg });
    }
  }
};
