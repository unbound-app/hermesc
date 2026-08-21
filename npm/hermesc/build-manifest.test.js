'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildManifest, parsePublishedVersions } = require('./build-manifest.js');

test('multiple npm versions per major -> newest wins', () => {
  assert.deepEqual(
    buildManifest({ publishedVersions: ['98.0.0', '98.0.1'] }),
    { latest: [98], versions: { 98: { npm: '98.0.1' } } },
  );
});

test('newest is by numeric semver, not string compare', () => {
  assert.deepEqual(
    buildManifest({ publishedVersions: ['98.0.9', '98.0.10'] }),
    { latest: [98], versions: { 98: { npm: '98.0.10' } } },
  );
});

test('fewer than 3 majors present -> keep all descending', () => {
  assert.deepEqual(
    buildManifest({ publishedVersions: ['94.0.0', '96.0.0'] }),
    {
      latest: [96, 94],
      versions: { 96: { npm: '96.0.0' }, 94: { npm: '94.0.0' } },
    },
  );
});

test('exactly 3 majors -> keep all descending', () => {
  assert.deepEqual(
    buildManifest({ publishedVersions: ['94.0.0', '96.0.0', '98.0.0'] }),
    {
      latest: [98, 96, 94],
      versions: {
        98: { npm: '98.0.0' },
        96: { npm: '96.0.0' },
        94: { npm: '94.0.0' },
      },
    },
  );
});

test('more than 3 majors -> oldest dropped, newest 3 kept descending', () => {
  assert.deepEqual(
    buildManifest({ publishedVersions: ['90.0.0', '94.0.0', '96.0.0', '98.0.0'] }),
    {
      latest: [98, 96, 94],
      versions: {
        98: { npm: '98.0.0' },
        96: { npm: '96.0.0' },
        94: { npm: '94.0.0' },
      },
    },
  );
});

test('parses npm array response', () => {
  assert.deepEqual(parsePublishedVersions('["94.0.0","96.0.0"]'), ['94.0.0', '96.0.0']);
});

test('parses npm bare-string response (single published version)', () => {
  assert.deepEqual(parsePublishedVersions('"98.0.0"'), ['98.0.0']);
});

test('parses empty/unpublished response as no versions', () => {
  assert.deepEqual(parsePublishedVersions(''), []);
  assert.deepEqual(parsePublishedVersions('   '), []);
});
