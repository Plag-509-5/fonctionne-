'use strict';

const axios = require('axios');

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function normaliseCommonsResponse(data, limit = 5) {
  const pages = Object.values(data?.query?.pages || {})
    .sort((a, b) => (a.index || Number.MAX_SAFE_INTEGER) - (b.index || Number.MAX_SAFE_INTEGER));

  const seen = new Set();
  const images = [];
  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    if (!info || !SUPPORTED_MIMES.has(String(info.mime || '').toLowerCase())) continue;
    const url = info.thumburl || info.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      url,
      originalUrl: info.url || url,
      sourceUrl: info.descriptionurl || null,
      title: String(page.title || 'Image').replace(/^File:/i, '')
    });
    if (images.length >= limit) break;
  }
  return images;
}

async function searchImages(query, limit = 5, http = axios) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('La recherche est vide.');
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 8);

  const response = await http.get(COMMONS_API, {
    params: {
      action: 'query',
      format: 'json',
      formatversion: 2,
      origin: '*',
      generator: 'search',
      gsrsearch: cleanQuery,
      gsrnamespace: 6,
      gsrlimit: Math.max(safeLimit * 3, 10),
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: 1280
    },
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KAIDO-MD/2.0 (WhatsApp image search)'
    },
    timeout: 20_000
  });

  return normaliseCommonsResponse(response.data, safeLimit);
}

module.exports = { searchImages, _test: { normaliseCommonsResponse, SUPPORTED_MIMES } };
