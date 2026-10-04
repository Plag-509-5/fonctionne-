const axios = require('axios');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const TGS = require('tgs-to');
const crypto = require('crypto');
const webp = require('node-webpmux');
const { sendSticker } = require('../../s-utils');

async function addExif(buffer, pack, author) {
  const img = new webp.Image();
  const json = { 'sticker-pack-id': crypto.randomBytes(16).toString('hex'), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['✨'] };
  const header = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
  const data = Buffer.from(JSON.stringify(json));
  const exif = Buffer.concat([header, data]);
  exif.writeUIntLE(data.length, 14, 4);
  await img.load(buffer);
  img.exif = exif;
  return img.save(null);
}

function parseInput(args) {
  const raw = args.join(' ').trim();
  const parts = raw.split('|').map(x => x.trim());
  const link = parts.shift();
  const author = parts[0] || 'KAIDO-MD';
  const pack = parts[1] || 'Telegram Pack';
  return { link, author: author.slice(0, 40), pack: pack.slice(0, 40) };
}

async function getTgsLinks(packUrl) {
  if (/\.tgs(?:\?|$)/i.test(packUrl)) return [packUrl];
  const slug = packUrl.match(/t\.me\/(?:addstickers\/)?([A-Za-z0-9_-]+)/i)?.[1];
  if (!slug) throw new Error('Lien Telegram invalide. Exemple : https://t.me/addstickers/PackName');
  const { data } = await axios.get(`https://t.me/addstickers/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  const found = [...String(data).matchAll(/https?:\/\/cdn\.telesco\.pe\/file\/[^"'\\s<>]+?\.tgs/g)].map(m => m[0]);
  return [...new Set(found)].slice(0, 30);
}

module.exports = {
  name: 'tgs',
  alias: ['telegramsticker', 'tgsticker'],
  category: 'tools',
  description: 'Télécharge un pack Telegram TGS et le renvoie en stickers WhatsApp',
  usage: '.tgs <lien_pack> | auteur | nom_du_pack',
  async execute({ socket, msg, from, args }) {
    if (!args.length) return socket.sendMessage(from, { text: '📦 Usage : .tgs https://t.me/addstickers/PackName | Auteur | Nom du pack' }, { quoted: msg });
    const { link, author, pack } = parseInput(args);
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'kaido-tgs-'));
    try {
      await socket.sendMessage(from, { text: `⏳ Téléchargement du pack *${pack}*...` }, { quoted: msg });
      const links = await getTgsLinks(link);
      if (!links.length) throw new Error('Aucun sticker TGS trouvé dans ce pack');
      let sent = 0;
      for (let i = 0; i < links.length; i++) {
        try {
          const { data } = await axios.get(links[i], { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 8 * 1024 * 1024 });
          const input = path.join(work, `${i}.tgs`);
          const output = path.join(work, `${i}.webp`);
          await fs.writeFile(input, data);
          await new TGS(input).convertToWebp(output);
          const sticker = await fs.readFile(output);
          const finalSticker = await addExif(sticker, pack, author).catch(() => sticker);
          await sendSticker(socket, from, finalSticker, msg);
          sent++;
        } catch (e) { console.warn(`[TGS] sticker ${i + 1} ignoré:`, e.message); }
      }
      if (!sent) throw new Error('Conversion TGS impossible (vérifie que ffmpeg est installé)');
      await socket.sendMessage(from, { text: `✅ ${sent}/${links.length} sticker(s) envoyé(s)\n👤 Auteur : ${author}\n📦 Pack : ${pack}` });
    } catch (err) {
      console.error('[TGS ERROR]', err);
      await socket.sendMessage(from, { text: `❌ ${err.message}` }, { quoted: msg });
    } finally { await fs.remove(work).catch(() => {}); }
  }
};
