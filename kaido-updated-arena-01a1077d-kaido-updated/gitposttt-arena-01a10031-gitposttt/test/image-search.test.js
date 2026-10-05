'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchImages, _test } = require('../services/image-search');

const apiPayload = {
  query: {
    pages: [
      {
        index: 2,
        title: 'File:Second.png',
        imageinfo: [{ mime: 'image/png', url: 'https://upload.example/original.png', thumburl: 'https://upload.example/thumb.png', descriptionurl: 'https://commons.example/second' }]
      },
      {
        index: 1,
        title: 'File:First.svg',
        imageinfo: [{ mime: 'image/svg+xml', url: 'https://upload.example/vector.svg' }]
      },
      {
        index: 3,
        title: 'File:Third.jpg',
        imageinfo: [{ mime: 'image/jpeg', url: 'https://upload.example/third.jpg' }]
      }
    ]
  }
};

test('Wikimedia: trie, filtre les formats et préfère la miniature', () => {
  const images = _test.normaliseCommonsResponse(apiPayload, 5);
  assert.equal(images.length, 2);
  assert.equal(images[0].title, 'Second.png');
  assert.equal(images[0].url, 'https://upload.example/thumb.png');
  assert.equal(images[1].title, 'Third.jpg');
});

test('searchImages utilise l’API Wikimedia avec une limite sûre', async () => {
  let request;
  const http = {
    async get(url, config) {
      request = { url, config };
      return { data: apiPayload };
    }
  };
  const images = await searchImages('paysage Haïti', 4, http);
  assert.match(request.url, /commons\.wikimedia\.org/);
  assert.equal(request.config.params.gsrsearch, 'paysage Haïti');
  assert.equal(request.config.params.iiurlwidth, 1280);
  assert.equal(images.length, 2);
});

test('searchImages rejette une recherche vide', async () => {
  await assert.rejects(() => searchImages('   '), /vide/i);
});
