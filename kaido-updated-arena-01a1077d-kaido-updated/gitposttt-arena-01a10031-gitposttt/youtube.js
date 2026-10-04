const axios = require("axios");
const https = require("https");
const fetch = require("node-fetch");
const WebSocket = require("ws");

// URL principale de conversion
const BASE_URL = "https://hub.ytconvert.org/api/download";

// En-têtes HTTP
const headers = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "Origin": "https://media.ytmp3.gg",
  "Referer": "https://media.ytmp3.gg/",
  "User-Agent": "Mozilla/5.0"
};

// Fonction utilitaire pour attendre
const attendre = ms => new Promise(res => setTimeout(res, ms));

// Extraire l’ID vidéo YouTube
function extraireIdVideo(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be")) return u.pathname.split("/")[1];
    if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1];
    return null;
  } catch {
    return null;
  }
}

// Construire une miniature
function construireMiniature(url, fallback = null) {
  const id = extraireIdVideo(url);
  if (!id) return fallback;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// Requête principale de conversion
async function requeteConversion(payload) {
  const res = await axios.post(BASE_URL, payload, { headers });
  return res.data;
}

// Attendre que la conversion soit prête
async function attendrePret(statusUrl) {
  while (true) {
    const { data } = await axios.get(statusUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (data.status === "completed" || data.downloadUrl) return data;
    if (data.status === "error") throw new Error("L’API a renvoyé une erreur.");

    await attendre(3000);
  }
}

// Conversion principale en MP3
async function primaireMP3(url) {
  const convert = await requeteConversion({
    url,
    os: "windows",
    output: { type: "audio", format: "mp3" }
  });
  const status = await attendrePret(convert.statusUrl);
  return {
    titre: convert.title,
    lien: status.downloadUrl,
    miniature: construireMiniature(url)
  };
}

// Conversion principale en MP4
async function primaireMP4(url, qualite = "720") {
  const convert = await requeteConversion({
    url,
    os: "windows",
    output: { type: "video", format: "mp4", quality: qualite + "p" }
  });
  const status = await attendrePret(convert.statusUrl);
  return {
    titre: convert.title,
    lien: status.downloadUrl,
    miniature: construireMiniature(url),
    qualite
  };
}

// Méthode secondaire
async function secondaireTelechargement(url, type = "mp3", format = "128") {
  const params = type === "mp3" ? { format: "mp3", audio_quality: format, url } : { format, url };
  const { data } = await axios.get("https://p.lbserver.xyz/ajax/download.php", { params });

  if (!data?.progress_url) throw new Error("URL de progression introuvable.");

  return new Promise((resolve) => {
    const poll = async () => {
      try {
        const { data: res } = await axios.get(data.progress_url);
        if (res.progress >= 1000) {
          resolve({
            titre: data.title,
            lien: res.download_url,
            miniature: data.info?.image
          });
        } else setTimeout(poll, 500);
      } catch {
        setTimeout(poll, 500);
      }
    };
    poll();
  });
}

// Méthode tertiaire (SaveNow)
const SaveNow = {
  api: "https://p.savenow.to",
  key: "dfcb6d76f2f6a9894gjkege8a4ab232222",
  agent: new https.Agent({ rejectUnauthorized: false })
};

async function tertiaireTelechargement(url, type = "mp3") {
  const format = type === "mp3" ? "mp3" : "720";
  const { data } = await axios.get(`${SaveNow.api}/ajax/download.php`, {
    params: { format, url, api: SaveNow.key },
    httpsAgent: SaveNow.agent
  });

  for (let i = 0; i < 40; i++) {
    try {
      const { data: res } = await axios.get(data.progress_url, { httpsAgent: SaveNow.agent });
      if (res.success && res.download_url) {
        return {
          titre: data.info?.title,
          lien: res.download_url,
          miniature: data.info?.image
        };
      }
    } catch {}
    await attendre(2500);
  }
  throw new Error("Timeout : SaveNow met trop de temps à répondre.");
}

// Méthode quaternaire (SSYoutube)
const SS_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/x-www-form-urlencoded',
  'origin': 'https://ssyoutube.online',
  'referer': 'https://ssyoutube.online/en12/'
};

async function quaternaireTelechargement(url, type = "mp3", qualite = "720") {
  const resolu = type === "mp3" ? "audio" : qualite;
  const r = await fetch("https://ssyoutube.online/yt-video-detail/", {
    method: "POST",
    headers: SS_HEADERS,
    body: new URLSearchParams({ videoURL: url })
  });

  const html = await r.text();
  const titre = (html.match(/videoTitle[^>]*>(.*?)</) || [])[1] || "Inconnu";
  const miniature = (html.match(/thumbnail" src="([^"]+)/) || [])[1];

  if (resolu === "audio") {
    const req = await fetch("https://ssyoutube.online/wp-admin/admin-ajax.php", {
      method: "POST",
      headers: SS_HEADERS,
      body: new URLSearchParams({ action: "get_mp3_conversion_url", videoUrl: url })
    });
    const json = await req.json();
    return { titre, miniature, lien: json.data.url };
  }

  throw new Error("SSYoutube ne supporte que l’extraction MP3 via ce bypass.");
}

// Fonction principale pour MP3
async function ytmp3(url) {
  try {
    return await primaireMP3(url);
  } catch (e1) {
    console.error(e1.message || e1);
    try {
      return await secondaireTelechargement(url, "mp3");
    } catch (e2) {
      console.error(e2.message || e2);
      try {
        return await tertiaireTelechargement(url, "mp3");
      } catch (e3) {
        console.error(e3.message || e3);
        try {
          return await quaternaireTelechargement(url, "mp3");
        } catch (e4) {
          console.error(e4.message || e4);
          throw new Error("Tous les serveurs ont échoué pour l’audio.");
        }
      }
    }
  }
}

// Fonction principale pour MP4
async function ytmp4(url, qualite = "720") {
  try {
    return await primaireMP4(url, qualite);
  } catch (e1) {
    console.error(e1.message || e1);
    try {
      return await secondaireTelechargement(url, "mp4", qualite);
    } catch (e2) {
      console.error(e2.message || e2);
      try {
        return await tertiaireTelechargement(url, "mp4");
      } catch (e3) {
        console.error(e3.message || e3);
        throw new Error("Tous les serveurs ont échoué pour la vidéo.");
      }
    }
  }
}

module.exports = { ytmp3, ytmp4 };