#!/usr/bin/env node
/**
 * Builds www/data/bios-db.json — the checksum table the app uses to VERIFY and ROUTE BIOS files offline
 * (BIOS manager "verified ✓", one-drop import of a RetroBIOS / RetroArch `system` / Recalbox `bios` folder).
 *
 * Source: RetroBIOS (https://github.com/Abdess/retrobios) — a source-verified BIOS catalogue with per-file
 * SHA-1 / CRC32 and install manifests for RetroArch, Recalbox, RomM, Batocera … Only its METADATA is used here
 * (MIT); no BIOS data is fetched, bundled or downloaded by the app. Run when RetroBIOS changes:
 *
 *   node scripts/build-bios-db.js        (needs internet; the generated JSON is committed)
 *
 * Output (compact):
 *   files:   { "<name the app lists>": { sys, size:[...accepted sizes], ok:[ {crc, sha1, size, src, label} … ] } }
 *   byCrc:   { "<crc32>": "<name>" }             identify a dump whatever it is called
 *   aliases: { "<retrobios file name, lower>": "<name>" }   RetroBIOS' own file names → the name the cores open
 *   zips:    { "<arcade bios zip>": [sysIds] }   handled by the arcade romset check, listed here for routing
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const OUT = path.join(__dirname, '..', 'www', 'data', 'bios-db.json');
const RAW = 'https://raw.githubusercontent.com/Abdess/retrobios/main/';
const LOCAL = process.env.RETROBIOS_DIR || '';           // optional: a local clone / download dir instead of fetching

// the BIOS files the app lists per system (www/js/app.js SYSTEMS[].bios) + the arcade BIOS zips
const WANT = {
  nes: ['disksys.rom'],
  gba: ['gba_bios.bin'],
  nds: ['bios7.bin', 'bios9.bin', 'firmware.bin'],
  psx: ['scph5501.bin', 'scph5500.bin', 'scph5502.bin', 'scph1001.bin'],
  segaCD: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'],
  segaSaturn: ['saturn_bios.bin', 'sega_101.bin', 'mpr-17933.bin'],
  atari5200: ['5200.rom'],
  atari7800: ['7800 BIOS (U).rom'],
  lynx: ['lynxboot.img'],
  pce: ['syscard3.pce'],
  amiga: ['kick34005.A500', 'kick40068.A1200'],
};
// arcade BIOS zips: every BIOS set of the two arcade cores (from the committed arcade DBs) → which app systems take it
const ZIPS = {};
for (const [core, sys] of [['fbneo', 'arcade'], ['mame2003plus', 'mame']]) {
  const adb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'www', 'data', 'arcade', core + '.json'), 'utf8'));
  for (const set of Object.keys(adb.biosSets || {})) (ZIPS[set + '.zip'] = ZIPS[set + '.zip'] || []).push(sys);
}
// extra accepted dumps that RetroBIOS files under another name but that the cores take under ours
const EXTRA = {
  'saturn_bios.bin': ['bios/Sega/Saturn/SAT_1.01-(J).bin', 'bios/Sega/Saturn/SAT_1.00-(U+E).bin', 'bios/Sega/Saturn/sega_100a.bin', 'bios/Sega/Saturn/sega1003.bin'],
  'scph1001.bin': ['bios/Sony/PlayStation/scph1001_v20.bin', 'bios/Sony/PlayStation/scph1001_v21.bin'],
  'bios_CD_U.bin': ['bios/Sega/Mega CD/us_scd2_9306.bin', 'bios/Sega/Mega CD/.variants/segacd_v100_us.bin', 'bios/Sega/Mega CD/.variants/segacd2_v211x_us.bin', 'bios/Sega/Mega CD/.variants/segacdx_v221x_us.bin'],
  'bios_CD_E.bin': ['bios/Sega/Mega CD/eu_mcd2_9303.bin', 'bios/Sega/Mega CD/eu_mcd2_9306.bin'],
  'bios_CD_J.bin': ['bios/Sega/Mega CD/jp_mcd1_9112.bin', 'bios/Sega/Mega CD/jp_mcd2_921222.bin', 'bios/Sega/Mega CD/.variants/megacd_v100s_jp.bin', 'bios/Sega/Mega CD/.variants/megacd_v100g_jp.bin', 'bios/Sega/Mega CD/.variants/megacd_v100l_jp.bin', 'bios/Sega/Mega CD/.variants/megacd_v100o_jp.bin'],
  'disksys.rom': ['bios/Nintendo/Famicom Disk System/.variants/disksys.rom.af5af53f'],
  'syscard3.pce': ['bios/NEC/PC Engine/.variants/syscard3.pce.1b4c2603', 'bios/NEC/PC Engine/syscard3u.pce'],
  'firmware.bin': ['bios/Nintendo/Nintendo DS/.variants/firmware.bin.8497afdd', 'bios/Nintendo/DS/NDS_Lite_Firmware.bin', 'bios/Nintendo/Nintendo DS/dsfirmware.bin'],
};
const MANIFESTS = ['retroarch', 'recalbox', 'romm', 'batocera'];

function get(url) {
  return new Promise((res, rej) => https.get(url, (r) => {
    if (r.statusCode !== 200) return rej(new Error(url + ' → HTTP ' + r.statusCode));
    const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString('utf8')));
  }).on('error', rej));
}
async function load(rel) {
  if (LOCAL) return fs.readFileSync(path.join(LOCAL, rel), 'utf8');
  return get(RAW + rel);
}
function label(p) {                       // "bios/Sega/Saturn/SAT_1.00-(U+E).bin" → "Sega / Saturn · SAT_1.00-(U+E).bin"
  const parts = p.replace(/^bios\//, '').replace('/.variants/', '/').split('/');
  const file = parts.pop().replace(/\.[0-9a-f]{8}$/, '');
  return parts.join(' / ') + ' · ' + file;
}
(async () => {
  const db = JSON.parse(await load('database.json'));
  const files = db.files, byName = db.indexes.by_name, byPathSuffix = db.indexes.by_path_suffix || {};
  const manifests = {};
  for (const m of MANIFESTS) { try { manifests[m] = JSON.parse(await load('install/' + m + '.json')); } catch (e) { console.warn('skip manifest', m, e.message); } }
  const bySha = (sha) => files[sha];
  const byPath = (p) => Object.values(files).find((f) => f.path === p);
  const out = { source: 'RetroBIOS (github.com/Abdess/retrobios) database.json ' + (db.generated || '') + ' — metadata only', generated: new Date().toISOString().slice(0, 10), files: {}, byCrc: {}, aliases: {}, zips: ZIPS };
  for (const sys of Object.keys(WANT)) for (const name of WANT[sys]) {
    const seen = new Set(), ok = [];
    const add = (f, why) => { if (!f || seen.has(f.sha1)) return; seen.add(f.sha1); ok.push({ crc: f.crc32, sha1: f.sha1, size: f.size, src: f.path, label: label(f.path), via: why }); };
    // 1. files the install manifests put under exactly this name (root or <core>/<name>)
    for (const m of Object.keys(manifests)) for (const f of manifests[m].files || []) {
      if (path.posix.basename(f.dest) === name) add(bySha(f.sha1), m);
    }
    // 2. files literally named so in the repository (incl. .variants)
    for (const sha of (byName[name] || [])) add(bySha(sha), 'name');
    for (const sha of (byName[name.toLowerCase()] || [])) add(bySha(sha), 'name');
    // 3. curated alternates
    for (const p of (EXTRA[name] || [])) add(byPath(p), 'alt');
    if (!ok.length) { console.warn('no dump found for', name); continue; }
    const sizes = [...new Set(ok.map((o) => o.size))].sort((a, b) => a - b);
    // the primary dump = what the RetroArch pack installs under this name (first entry via retroarch), else the first
    ok.sort((a, b) => (a.via === 'retroarch' ? 0 : 1) - (b.via === 'retroarch' ? 0 : 1));
    out.files[name] = { sys, size: sizes, ok: ok.map((o) => ({ crc: o.crc, sha1: o.sha1, size: o.size, src: o.src, label: o.label })) };
    ok.forEach((o, i) => {
      // byCrc: the name whose PRIMARY dump this is wins (sega_101.bin over saturn_bios.bin for the Japanese Saturn ROM)
      if (!out.byCrc[o.crc] || i === 0) out.byCrc[o.crc] = name;
      const base = path.posix.basename(o.src).replace(/\.[0-9a-f]{8}$/, '').toLowerCase();
      if (base !== name.toLowerCase() && !out.aliases[base]) out.aliases[base] = name;
    });
  }
  // arcade BIOS zips: whole-file CRCs of the RetroBIOS copies (informational — content is verified by the arcade check)
  out.zipDumps = {};
  for (const z of Object.keys(ZIPS)) {
    const shas = new Set([...(byName[z] || [])]);
    for (const m of Object.keys(manifests)) for (const f of manifests[m].files || []) if (path.posix.basename(f.dest) === z) shas.add(f.sha1);
    out.zipDumps[z] = [...shas].map((s) => files[s]).filter(Boolean).map((f) => ({ crc: f.crc32, sha1: f.sha1, size: f.size, src: f.path }));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const n = Object.keys(out.files).length, d = Object.values(out.files).reduce((a, f) => a + f.ok.length, 0);
  console.log(`bios-db.json: ${n} BIOS names, ${d} accepted dumps, ${Object.keys(out.aliases).length} aliases, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB → ${OUT}`);
  for (const name of Object.keys(out.files)) console.log('  ' + name.padEnd(20) + out.files[name].sys.padEnd(11) + out.files[name].ok.map((o) => o.crc).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
