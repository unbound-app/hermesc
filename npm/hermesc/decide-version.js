#!/usr/bin/env node
// Skip/version decision for the hermesc auto-sync pipeline.
//
// Pure core: given the upstream bytecode version, the list of versions already
// published to npm, and an optional explicit override, decide whether to build
// and which version to publish. One npm version per bytecode version
// (<bytecode>.0.0), no patch revisions.
//
// CLI wrapper reads the npm `versions --json` payload from stdin and takes
// bytecodeVersion / versionOverride from the environment (never interpolated
// into code) so untrusted inputs can't inject.

'use strict';

function decide({ bytecodeVersion, publishedVersions, versionOverride }) {
  if (!/^[0-9]+$/.test(String(bytecodeVersion ?? '').trim())) {
    throw new Error(
      `Invalid bytecode version: ${JSON.stringify(bytecodeVersion)} (expected a non-empty integer)`,
    );
  }

  const packageVersion =
    versionOverride && String(versionOverride).length
      ? String(versionOverride)
      : `${String(bytecodeVersion).trim()}.0.0`;

  const shouldBuild = !publishedVersions.includes(packageVersion);

  return { shouldBuild, packageVersion };
}

// npm returns a JSON array of versions, a bare JSON string when only one
// version exists, or nothing when the package is unpublished.
function parsePublishedVersions(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function main() {
  const publishedVersions = parsePublishedVersions(readStdin());

  const { shouldBuild, packageVersion } = decide({
    bytecodeVersion: process.env.BYTECODE_VERSION,
    publishedVersions,
    versionOverride: process.env.VERSION_OVERRIDE,
  });

  process.stdout.write(
    `bytecode_version=${String(process.env.BYTECODE_VERSION).trim()}\n` +
      `package_version=${packageVersion}\n` +
      `should_build=${shouldBuild}\n`,
  );
}

module.exports = { decide, parsePublishedVersions };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
