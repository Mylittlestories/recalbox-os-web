#!/usr/bin/env node
/**
 * Builds www/data/arcade/{mame2003plus,fbneo}.json — the romset databases the app uses to validate
 * arcade zips when they are added (driver name, files, BIOS parent) instead of letting the core fail
 * silently into the RetroArch menu.
 *
 * Sources (the cores' own metadata, fetched once; the generated JSON is committed):
 *   MAME 2003-Plus : https://raw.githubusercontent.com/libretro/mame2003-plus-libretro/master/metadata/mame2003-plus.xml
 *   FinalBurn Neo  : https://raw.githubusercontent.com/libretro/FBNeo/master/dats/FinalBurn Neo (ClrMame Pro XML, Arcade only).dat
 *
 * Output format (compact):  { "<romset>": [description, year, manufacturer, parent, bios, ["file:crc32"…]] }
 * File names + CRC32 are what the core opens/verifies; the app compares them with the zip's central directory
 * (names and stored CRCs) without inflating anything, so a wrong-version dump is caught before launch.
 *
 * Usage:  node scripts/build-arcade-db.js            (needs internet; run when the cores are upgraded)
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const OUT = path.join(__dirname, '..', 'www', 'data', 'arcade');
const SRC = {
  mame2003plus: 'https://raw.githubusercontent.com/libretro/mame2003-plus-libretro/master/metadata/mame2003-plus.xml',
  fbneo: 'https://raw.githubusercontent.com/libretro/FBNeo/master/dats/FinalBurn%20Neo%20(ClrMame%20Pro%20XML%2C%20Arcade%20only).dat',
};
function get(url) {
  return new Promise((res, rej) => https.get(url, (r) => {
    if (r.statusCode !== 200) return rej(new Error(url + ' → HTTP ' + r.statusCode));
    const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString('utf8')));
  }).on('error', rej));
}
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function attr(tag, name) { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? unesc(m[1]) : ''; }
function text(block, name) { const m = new RegExp('<' + name + '>([^<]*)</' + name + '>').exec(block); return m ? unesc(m[1]).trim() : ''; }
function parse(xml) {
  const db = {}, bios = new Set(), blocks = xml.split(/<game\s/).slice(1);
  for (const b of blocks) {
    const open = b.slice(0, b.indexOf('>'));
    const name = attr(' ' + open, 'name');
    if (attr(' ' + open, 'isbios') === 'yes' || attr(' ' + open, 'runnable') === 'no') { bios.add(name); }
  }
  for (const b of blocks) {
    const open = ' ' + b.slice(0, b.indexOf('>'));
    const name = attr(open, 'name');
    if (bios.has(name)) continue;
    const romof = attr(open, 'romof'), cloneof = attr(open, 'cloneof');
    const files = [];
    for (const r of b.matchAll(/<rom\s([^>]*)\/?>/g)) {
      const t = ' ' + r[1];
      if (attr(t, 'status') === 'nodump') continue;
      const merge = attr(t, 'merge');
      if (merge && cloneof) continue;                 // lives in the parent set (split/merged sets) — parent handled separately
      files.push(attr(t, 'name') + ':' + attr(t, 'crc').toLowerCase());
    }
    db[name] = [text(b, 'description') || name, text(b, 'year'), text(b, 'manufacturer'), cloneof, bios.has(romof) ? romof : '', files];
  }
  return { db, bios: [...bios].sort() };
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, url] of Object.entries(SRC)) {
    process.stdout.write(`${id}: downloading… `);
    const xml = await get(url);
    const { db, bios } = parse(xml);
    const json = JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: url, bios, sets: db });
    fs.writeFileSync(path.join(OUT, id + '.json'), json);
    console.log(`${Object.keys(db).length} romsets, ${bios.length} BIOS sets → ${(json.length / 1048576).toFixed(2)} MB`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
