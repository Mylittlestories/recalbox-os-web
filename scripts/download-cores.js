#!/usr/bin/env node
/**
 * Downloads the EmulatorJS core files needed by the Recalbox OS Web app.
 *
 * Cores are distributed on the EmulatorJS CDN as single ".data" files named:
 *   {core}{-thread}{-legacy}-wasm.data
 * The framework picks the variant at runtime based on WebGL2 + threading
 * support, so we bundle both normal and legacy variants (and thread for
 * threading cores).
 *
 * Usage:  node scripts/download-cores.js [--all]
 *   By default downloads the "core" set. With --all, downloads every system
 *   the frontend supports.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://cdn.emulatorjs.org/stable/data/cores/';
const OUT = path.join(__dirname, '..', 'www', 'data', 'cores');

// systemCore: map from EJS generic system name -> emulator core name
const systemCores = {
  nes: ['fceumm', 'nestopia'],
  snes: ['snes9x'],
  n64: ['mupen64plus_next'],
  gb: ['gambatte'],
  gba: ['mgba'],
  nds: ['melonds'],
  psx: ['pcsx_rearmed'],
  psp: ['ppsspp'],          // threading
  segaMD: ['genesis_plus_gx'],
  segaMS: ['smsplus'],
  segaGG: ['genesis_plus_gx'],
  segaCD: ['genesis_plus_gx'],
  segaSaturn: ['yabause'],
  atari2600: ['stella2014'],
  atari5200: ['a5200'],
  atari7800: ['prosystem'],
  lynx: ['handy'],
  jaguar: ['virtualjaguar'],
  pce: ['mednafen_pce'],
  ws: ['mednafen_wswan'],
  ngp: ['mednafen_ngp'],
  c64: ['vice_x64sc'],
  amiga: ['puae'],
  arcade: ['fbneo'],
  mame: ['mame2003_plus'],
  dos: ['dosbox_pure'],     // threading
};

// Which cores are needed
let allMode = process.argv.includes('--all');
const cores = new Set();
Object.values(systemCores).forEach(list => list.forEach(c => cores.add(c)));

function variantsFor(core) {
  const v = new Set();
  v.add(core + '-wasm.data');
  v.add(core + '-legacy-wasm.data');
  // threading cores also have a -thread build
  if (['ppsspp', 'dosbox_pure', 'azahar'].includes(core)) {
    v.add(core + '-thread-wasm.data');
    v.add(core + '-thread-legacy-wasm.data');
  }
  return [...v];
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        f.close();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        f.close();
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
      }
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
    });
    req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    // hard timeout so a hung connection can't stall the whole build
    req.setTimeout(30000, () => {
      req.destroy(new Error('Timeout downloading ' + url));
    });
  });
}

// retry wrapper
async function downloadRetry(url, dest, attempts = 4) {
  let lastErr;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await download(url, dest);
    } catch (e) {
      lastErr = e;
      console.warn(`  retry ${a}/${attempts} for ${url.split('/').pop()}: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tasks = [];
  for (const core of cores) {
    for (const variant of variantsFor(core)) {
      const dest = path.join(OUT, variant);
      if (fs.existsSync(dest)) { console.log('skip (exists) ' + variant); continue; }
      tasks.push({ url: BASE + variant, dest, variant });
    }
  }
  console.log(`Downloading ${tasks.length} core files...`);
  let done = 0, failed = 0;
  const concurrency = 6;
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++];
      try {
        await downloadRetry(t.url, t.dest);
        done++;
        console.log(`  [${done}/${tasks.length}] ${t.variant}  (${(fs.statSync(t.dest).size/1024).toFixed(0)} KB)`);
      } catch (e) {
        failed++;
        console.warn(`  FAILED ${t.variant}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, tasks.length)}, worker));
  console.log(`\nDone. ${done} ok, ${failed} failed. Cores dir: ${OUT}`);
})();
