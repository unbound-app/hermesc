'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decide, parsePublishedVersions } = require('./decide-version.js');

test('no versions published -> build <bytecode>.0.0', () => {
  assert.deepEqual(decide({ bytecodeVersion: '96', publishedVersions: [] }), {
    shouldBuild: true,
    packageVersion: '96.0.0',
  });
});

test('<bytecode>.0.0 already published -> skip', () => {
  assert.deepEqual(
    decide({ bytecodeVersion: '96', publishedVersions: ['95.0.0', '96.0.0'] }),
    { shouldBuild: false, packageVersion: '96.0.0' },
  );
});

test('explicit override -> build the overridden version', () => {
  assert.deepEqual(
    decide({
      bytecodeVersion: '96',
      publishedVersions: ['96.0.0'],
      versionOverride: '96.0.1',
    }),
    { shouldBuild: true, packageVersion: '96.0.1' },
  );
});

test('override that already exists -> skip', () => {
  assert.deepEqual(
    decide({
      bytecodeVersion: '96',
      publishedVersions: ['96.0.1'],
      versionOverride: '96.0.1',
    }),
    { shouldBuild: false, packageVersion: '96.0.1' },
  );
});

test('unreadable/malformed bytecode -> throws loudly', () => {
  assert.throws(() => decide({ bytecodeVersion: '', publishedVersions: [] }), /Invalid bytecode version/);
  assert.throws(() => decide({ bytecodeVersion: 'abc', publishedVersions: [] }), /Invalid bytecode version/);
  assert.throws(() => decide({ bytecodeVersion: undefined, publishedVersions: [] }), /Invalid bytecode version/);
});

test('parses npm array response', () => {
  assert.deepEqual(parsePublishedVersions('["95.0.0","96.0.0"]'), ['95.0.0', '96.0.0']);
});

test('parses npm bare-string response (single published version)', () => {
  assert.deepEqual(parsePublishedVersions('"96.0.0"'), ['96.0.0']);
});

test('parses empty/unpublished response as no versions', () => {
  assert.deepEqual(parsePublishedVersions(''), []);
  assert.deepEqual(parsePublishedVersions('   '), []);
});
