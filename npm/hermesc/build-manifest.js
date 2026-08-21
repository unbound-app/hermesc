#!/usr/bin/env node
// Manifest generator for the hermesc raw-GitHub source of truth.
//
// Pure core: given the versions published to npm and how many bytecode majors
// to keep, group by semver major, keep the newest npm version per major, sort
// majors descending and take the newest `held`, then build { latest, versions }.
//
// CLI wrapper reads the npm `versions --json` payload from `npm view`, calls
// buildManifest, and writes manifest.json to the repo root.

'use strict';

const DEFAULT_HELD = 3;

// Parse the semver major (the first dotted segment) as a number.
function majorOf(version) {
  return Number(String(version).split('.')[0]);
}

// Numeric compare of every dotted segment; returns > 0 when a is newer than b.
function compareVersions(a, b) {
  const as = String(a).split('.').map(Number);
  const bs = String(b).split('.').map(Number);

  for (let i = 0, len = Math.max(as.length, bs.length); i < len; i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0);
    if (diff) return diff;
  }

  return 0;
}

function buildManifest({ publishedVersions, held = DEFAULT_HELD }) {
  const newestByMajor = new Map();

  for (const version of publishedVersions) {
    const major = majorOf(version);
    if (!Number.isInteger(major)) continue;

    const current = newestByMajor.get(major);
    if (!current || compareVersions(version, current) > 0) {
      newestByMajor.set(major, version);
    }
  }

  const latest = [...newestByMajor.keys()].sort((a, b) => b - a).slice(0, held);

  const versions = {};
  for (const major of latest) {
    versions[major] = { npm: newestByMajor.get(major) };
  }

  return { latest, versions };
}

// npm returns a JSON array of versions, a bare JSON string when only one
// version exists, or nothing when the package is unpublished.
function parsePublishedVersions(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readPublishedVersions() {
  const { execFileSync } = require('child_process');

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const raw = execFileSync(
    npm,
    ['view', '@unbound-app/hermesc', 'versions', '--json'],
    { encoding: 'utf-8', shell: process.platform === 'win32' },
  );

  return parsePublishedVersions(raw);
}

function main() {
  const path = require('path');
  const fs = require('fs');

  const publishedVersions = readPublishedVersions();
  const manifest = buildManifest({ publishedVersions });

  const target = path.join(__dirname, '..', '..', 'manifest.json');
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Wrote ${target}\n`);
}

module.exports = { buildManifest, parsePublishedVersions };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
