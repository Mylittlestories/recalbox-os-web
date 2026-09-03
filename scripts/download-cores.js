#!/usr/bin/env node
/**
 * Bundles the emulator cores INSIDE the app — www/data/cores/ — so the packaged
 * application runs 100% offline, the way RetroArch / RetroPie ship their cores.
 *
 * Cores are RetroArch (libretro) emulators compiled to WebAssembly by the
 * EmulatorJS project. Each core is one ".data" file (a 7z archive containing
 * the .js loader, the .wasm binary and its metadata):
 *
 *     {core}{-thread}{-legacy}-wasm.data
 *
 *   -legacy  = WebGL1 build (the runtime picks it when WebGL2 is unavailable
 *              or when the core is not flagged "defaultWebGL2")
 *   -thread  = pthread build (PSP and DOSBox Pure ONLY exist in this form)
 *
 * The files are fetched from the EmulatorJS CDN for the *exact* runtime version
 * that is bundled in www/data/emulator.min.js (never "stable"/"latest"), so the
 * cores can never drift away from the runtime. At runtime nothing is downloaded:
 * the app blocks every network request (see main.js / www/js/app.js).
 *
 * Usage
 *   node scripts/download-cores.js           download what is missing, verify, exit 1 if incomplete
 *   node scripts/download-cores.js --check   verify only (no network), exit 1 if incomplete
 *   node scripts/download-cores.js --soft    download what you can, never fail (used by `npm start`)
 *   node scripts/download-cores.js --force   re-download every file
 *   node scripts/download-cores.js --quiet   less output
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const RUNTIME = path.join(ROOT, 'www', 'data', 'emulator.min.js');
const OUT = path.join(ROOT, 'www', 'data', 'cores');
const MANIFEST = path.join(OUT, 'manifest.json');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const SOFT = args.includes('--soft');
const FORCE = args.includes('--force');
const QUIET = args.includes('--quiet');

/* ------------------------------------------------------------------------ */
/* Which cores the frontend needs (single source of truth is mirrored in     */
/* www/js/app.js → CORE_FILES; keep both lists in sync).                     */
/* ------------------------------------------------------------------------ */
const SYSTEM_CORES = {
  nes: ['fceumm', 'nestopia'],
  snes: ['snes9x'],
  n64: ['mupen64plus_next'],
  gb: ['gambatte'],
  gba: ['mgba'],
  nds: ['melonds'],
  psx: ['pcsx_rearmed'],
  psp: ['ppsspp'],
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
  dos: ['dosbox_pure'],
};

// Build variants that actually exist on the CDN for each core.
const VARIANTS = {
  ppsspp: ['-thread'],                       // WebGL2 + threads only
  dosbox_pure: ['-thread', '-thread-legacy'], // threads only
};
const DEFAULT_VARIANTS = ['', '-legacy'];

// Extra assets some cores read from data/cores/ at start.
const EXTRAS = { ppsspp: ['ppsspp-assets.zip'] };

const MAGIC_7Z = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const MAGIC_ZIP = Buffer.from([0x50, 0x4b]);

/* ------------------------------------------------------------------------ */
function log(msg) { if (!QUIET) console.log(msg); }

function runtimeVersion() {
  try {
    const m = fs.readFileSync(RUNTIME, 'utf8').match(/ejs_version\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  } catch (e) { /* fallthrough */ }
  throw new Error('Cannot read the EmulatorJS version from ' + RUNTIME);
}

function coreList() {
  const cores = [];
  for (const sys of Object.keys(SYSTEM_CORES)) {
    for (const c of SYSTEM_CORES[sys]) if (!cores.includes(c)) cores.push(c);
  }
  return cores;
}
function filesFor(core) {
  const list = (VARIANTS[core] || DEFAULT_VARIANTS).map((v) => `${core}${v}-wasm.data`);
  return list.concat(EXTRAS[core] || []);
}
function systemsFor(core) {
  return Object.keys(SYSTEM_CORES).filter((s) => SYSTEM_CORES[s].includes(core));
}

/** Verify one bundled file: exists, plausible size, correct magic bytes. */
function verifyFile(file) {
  const p = path.join(OUT, file);
  let st;
  try { st = fs.statSync(p); } catch (e) { return { ok: false, why: 'missing' }; }
  if (!st.isFile()) return { ok: false, why: 'not a file' };
  const isReport = file.startsWith('reports/');
  if (isReport) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return j && j.buildStart ? { ok: true, size: st.size } : { ok: false, why: 'invalid report' };
    } catch (e) { return { ok: false, why: 'invalid json' }; }
  }
  if (st.size < 100 * 1024) return { ok: false, why: 'too small (' + st.size + ' B)' };
  const fd = fs.openSync(p, 'r');
  const head = Buffer.alloc(6);
  fs.readSync(fd, head, 0, 6, 0);
  fs.closeSync(fd);
  const magic = file.endsWith('.zip') ? MAGIC_ZIP : MAGIC_7Z;
  if (!head.subarray(0, magic.length).equals(magic)) return { ok: false, why: 'corrupt (bad header)' };
  return { ok: true, size: st.size };
}

/** Full inventory of what is on disk. */
function inventory() {
  const cores = {};
  let missing = 0, total = 0, bytes = 0;
  for (const core of coreList()) {
    const entry = { files: {}, report: false, systems: systemsFor(core), ok: true };
    for (const f of filesFor(core)) {
      const v = verifyFile(f);
      total++;
      if (v.ok) { entry.files[f] = v.size; bytes += v.size; } else { entry.files[f] = null; entry.ok = false; missing++; }
    }
    const r = verifyFile('reports/' + core + '.json');
    entry.report = r.ok;
    total++;
    if (!r.ok) missing++;          // report is not fatal for playing, but core caching is disabled without it
    cores[core] = entry;
  }
  return { cores, missing, total, bytes };
}

/* ------------------------------------------------------------------------ */
/* Downloading                                                              */
/* ------------------------------------------------------------------------ */
const NET_ERRORS = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'ETIMEDOUT'];
let offline = false;

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const f = fs.createWriteStream(tmp);
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        f.close(); fs.unlink(tmp, () => {});
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        f.close(); fs.unlink(tmp, () => {});
        res.resume();
        return reject(Object.assign(new Error('HTTP ' + res.statusCode), { code: 'HTTP' + res.statusCode }));
      }
      res.pipe(f);
      f.on('finish', () => f.close(() => { fs.rename(tmp, dest, (e) => (e ? reject(e) : resolve())); }));
    });
    req.on('error', (e) => { f.close(); fs.unlink(tmp, () => {}); reject(e); });
    req.setTimeout(SOFT ? 10000 : 30000, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
  });
}

async function downloadRetry(url, dest, attempts) {
  let lastErr;
  for (let a = 1; a <= attempts; a++) {
    if (offline) throw lastErr || new Error('offline');
    try { return await download(url, dest); }
    catch (e) {
      lastErr = e;
      if (NET_ERRORS.includes(e.code)) { offline = true; throw e; }   // no point retrying without a network
      if (String(e.code).startsWith('HTTP4')) throw e;                // 404: retrying won't help
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

async function fetchMissing(version) {
  const base = `https://cdn.emulatorjs.org/${version}/data/cores/`;
  fs.mkdirSync(path.join(OUT, 'reports'), { recursive: true });
  const tasks = [];
  for (const core of coreList()) {
    for (const f of filesFor(core).concat(['reports/' + core + '.json'])) {
      if (!FORCE && verifyFile(f).ok) continue;
      tasks.push({ url: base + f, dest: path.join(OUT, f), name: f });
    }
  }
  if (!tasks.length) { log('All core files already present and verified.'); return; }
  log(`Fetching ${tasks.length} file(s) from ${base}`);
  let i = 0, done = 0, failed = 0;
  async function worker() {
    while (i < tasks.length && !offline) {
      const t = tasks[i++];
      try {
        await downloadRetry(t.url, t.dest, SOFT ? 1 : 4);
        const v = verifyFile(t.name);
        if (!v.ok) { failed++; fs.unlinkSync(t.dest); console.warn(`  BAD  ${t.name}: ${v.why}`); continue; }
        done++;
        log(`  [${done}/${tasks.length}] ${t.name}  (${(v.size / 1024).toFixed(0)} KB)`);
      } catch (e) {
        failed++;
        if (!offline || !QUIET) console.warn(`  FAIL ${t.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, tasks.length) }, worker));
  if (offline) console.warn('  No network connection — stopped downloading.');
  log(`Downloaded ${done}, failed ${failed}.`);
}

/* ------------------------------------------------------------------------ */
function writeManifest(version, inv) {
  if (!fs.existsSync(OUT)) return;
  const manifest = {
    ejsVersion: version,
    source: `https://cdn.emulatorjs.org/${version}/data/cores/`,
    generated: new Date().toISOString(),
    complete: inv.missing === 0,
    totalBytes: inv.bytes,
    cores: inv.cores,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

function printSummary(version, inv) {
  const pad = (s, n) => String(s).padEnd(n);
  log('');
  log(`EmulatorJS runtime ${version} — bundled cores in ${path.relative(ROOT, OUT)}/`);
  log(pad('CORE', 20) + pad('SYSTEMS', 30) + pad('SIZE', 10) + 'STATUS');
  for (const core of Object.keys(inv.cores)) {
    const c = inv.cores[core];
    const size = Object.values(c.files).reduce((a, b) => a + (b || 0), 0);
    const missing = Object.keys(c.files).filter((f) => c.files[f] === null);
    const status = c.ok ? (c.report ? 'ok' : 'ok (no report)') : 'MISSING ' + missing.join(', ');
    log(pad(core, 20) + pad(c.systems.join(','), 30) + pad((size / 1048576).toFixed(1) + ' MB', 10) + status);
  }
  log('');
  const ok = inv.missing === 0;
  log(`${ok ? 'COMPLETE' : 'INCOMPLETE'}: ${inv.total - inv.missing}/${inv.total} files, ${(inv.bytes / 1048576).toFixed(0)} MB on disk.` +
      (ok ? ' The app runs fully offline.' : ` ${inv.missing} file(s) missing — affected systems will show "CORE MISSING" in the app.`));
}

(async () => {
  const version = runtimeVersion();
  if (!CHECK) await fetchMissing(version);
  const inv = inventory();
  writeManifest(version, inv);
  printSummary(version, inv);
  if (inv.missing && !SOFT) {
    console.error(CHECK
      ? '\nRun `npm run cores` (needs internet once) to bundle the missing cores.'
      : '\nBuild aborted: refusing to package an app that would not work offline.');
    process.exit(1);
  }
})().catch((e) => { console.error(e.message || e); process.exit(SOFT ? 0 : 1); });
