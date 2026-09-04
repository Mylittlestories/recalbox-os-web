#!/usr/bin/env node
/**
 * Fetches the *redistribution-restricted* free games of the bundled library.
 *
 * Almost every title in www/roms/ is homebrew / open source / freeware and is
 * committed to the repository. The classic arcade games released for free
 * non-commercial use through https://www.mamedev.org/roms/ are different: the
 * rights holders approved their distribution ON THAT SITE ONLY, so they must
 * not be re-hosted in this repository or baked into published installers
 * without permission. The app therefore downloads them straight from
 * mamedev.org at build/start time (exactly like `npm run cores` does for the
 * emulator cores) and verifies size + SHA-256 before use.
 *
 * The runtime never downloads anything: if a file is missing, the game is
 * simply listed as "not installed" in the library (app.js filters it out).
 *
 * Usage
 *   node scripts/download-roms.js           download what is missing, verify, exit 1 if incomplete
 *   node scripts/download-roms.js --check   verify only (no network)
 *   node scripts/download-roms.js --soft    never fail (used by `npm start`)
 *   node scripts/download-roms.js --force   re-download every file
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ROMS = path.join(ROOT, 'www', 'roms');
const LIB = path.join(ROMS, 'library.json');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const SOFT = args.includes('--soft');
const FORCE = args.includes('--force');
const QUIET = args.includes('--quiet');

/* romset → { size, sha256 } — MAME 0.78 (mame2003-plus) compatible sets as published on mamedev.org */
const RESTRICTED = {
  alienar:  { size: 17027, sha256: '7f87339f307625f7dd8dd9f36f480633e3a0df02ebcdc296614172f200e478bb' },
  circus:   { size: 6152,  sha256: '27d3952dba171d50ef63a7a651e063f83830d2e07e4799dadcc5c42e0371d424' },
  carpolo:  { size: 5562,  sha256: 'cde6077be7cf552f2147181a3ef858ee261b0adce47198cadd16d33dedaa928f' },
  sidetrac: { size: 5491,  sha256: '2ac03e47d67db378166b18ec3a7eaf40c3791a780a44042f80d24e9141a3f228' },
  ripcord:  { size: 5906,  sha256: 'bc89a9c731745b1a04c21541c28d383be96332498a6dfdd29a44f4225e04d006' },
  fireone:  { size: 23227, sha256: '2fd017b91d75d3c364510b639dc3d660b5697b4ab50de5fa19ba2bbf481736ff' },
  starfire: { size: 16748, sha256: '5ede6d40e3b577a810f5c02a98de2683b3c3e8d12c7fa46e12014d6e5197a408' },
  targ:     { size: 8157,  sha256: 'a24eb4fec6487c8d09ac44d87a4fefb1b453b8eb1ca5fdeb1dd73b98eaf272e3' },
  spectar:  { size: 10105, sha256: '222e4fb639571ffb0d73f4ad19376211ecfe9798067826b20e4b1790886705ba' },
  gridlee:  { size: 25516, sha256: 'df977ceba0ae1c8d0ecf489ae8423390ff5c7c76ce95f5ee6ba9bc892b18056e' },
  robby:    { size: 27915, sha256: 'd3f7ae3afeeedb7d2476ea05e326a6a6f6e851c969f07a1de36133fcb4d0a8d8' },
  supertnk: { size: 13383, sha256: 'c24002ca4e4a63ffe11f45cc96bed4441c2a95930bff79da413fd6197eca31c0' },
};
const urlFor = (id) => `https://www.mamedev.org/roms/${id}/${id}.zip`;

function log(...a) { if (!QUIET) console.log(...a); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function verify(id) {
  const file = path.join(ROMS, `${id}.zip`);
  if (!fs.existsSync(file)) return 'missing';
  const want = RESTRICTED[id];
  const size = fs.statSync(file).size;
  if (size !== want.size) return `wrong size (${size} ≠ ${want.size})`;
  if (sha256(file) !== want.sha256) return 'checksum mismatch';
  return null;
}
function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'recalbox-os-web/2.2 (+https://github.com/Mylittlestories/recalbox-os-web)' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume(); return resolve(download(new URL(res.headers.location, url).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
  const wanted = lib.games.filter((g) => g.restricted && RESTRICTED[g.file.replace(/\.zip$/, '')]);
  let failed = 0, fetched = 0;
  for (const g of wanted) {
    const id = g.file.replace(/\.zip$/, '');
    let problem = FORCE ? 'forced' : verify(id);
    if (problem && !CHECK) {
      try {
        log(`  ↓ ${g.name.padEnd(28)} ${urlFor(id)}`);
        await download(urlFor(id), path.join(ROMS, `${id}.zip`));
        fetched++;
        problem = verify(id);
        if (problem) { try { fs.unlinkSync(path.join(ROMS, `${id}.zip`)); } catch (e) {} }
      } catch (e) { problem = e.message; }
    }
    if (problem) { failed++; log(`  ✗ ${g.name.padEnd(28)} ${problem}`); }
    else log(`  ✓ ${g.name.padEnd(28)} ${id}.zip`);
  }
  const summary = `${wanted.length - failed}/${wanted.length} mamedev.org arcade games present${fetched ? ` (${fetched} downloaded)` : ''}`;
  if (failed && !SOFT) { console.error(`\n${summary} — ${failed} missing. They are only listed in the library when present.`); process.exit(CHECK ? 1 : 1); }
  log(`\n${summary}`);
})();
