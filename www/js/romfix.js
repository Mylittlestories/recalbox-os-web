/* Recalbox OS Web — arcade romset rebuilder ("ROM fix").
 *
 * The two arcade engines bundled with the app (MAME 2003-Plus = MAME 0.78 romsets, FinalBurn Neo = its own
 * 1.0.0.03 romsets) open the files INSIDE a zip by name and CRC32, for that exact emulator version. A romset made
 * for another MAME (a MAME32 collection from 2001, a current 0.2xx set …) usually holds the very same data, but:
 *   - under other file names            → the cores mostly cope (CRC lookup), the app already accepts them
 *   - cut differently                   → two halves vs one file, byte/word-interleaved pairs vs one file
 *   - spread differently                → parent / clone / BIOS files moved between zips over the years
 *   - with files that came later        → PROMs, PLDs, sound ROMs added to the set after the user's version
 * This module rebuilds, offline, the zip the core expects from whatever the user has: every wanted file is looked
 * up by CRC32 in a "pool" (the dropped zip, the other zips of the drop, the zips already in the library, the installed
 * BIOS zips), and when it is not there as-is it is derived — joined from equal parts (CRC32 arithmetic, no data read),
 * cut out of a bigger file, or (de)interleaved — then written with the exact name the core wants. What is really
 * absent is reported with its name, size and CRC32, so the user knows precisely what to look for.
 *
 * Everything runs in the renderer, nothing leaves the machine. Shared helpers (crc32, zip read/write) are used by
 * app.js too. Loaded before app.js; also usable from Node for the tests (module.exports).
 */
(function (root) {
  "use strict";

  /* ---------------- CRC32 ---------------- */
  var TABLE = (function () { var t = new Int32Array(256), c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
  function crc32(u8, prev) {
    var c = (prev === undefined ? 0 : prev) ^ (-1);
    for (var i = 0, n = u8.length; i < n; i++) c = (c >>> 8) ^ TABLE[(c ^ u8[i]) & 0xFF];
    return (c ^ (-1)) >>> 0;
  }
  var hex8 = function (n) { return ("00000000" + (n >>> 0).toString(16)).slice(-8); };
  /* zlib's crc32_combine: crc of A+B from crc(A), crc(B) and len(B) — no data needed */
  function gf2Times(mat, vec) { var sum = 0, i = 0; vec >>>= 0; while (vec) { if (vec & 1) sum ^= mat[i]; vec >>>= 1; i++; } return sum >>> 0; }
  function gf2Square(sq, mat) { for (var n = 0; n < 32; n++) sq[n] = gf2Times(mat, mat[n]); }
  function crc32Combine(crc1, crc2, len2) {
    if (len2 <= 0) return crc1 >>> 0;
    var even = new Array(32), odd = new Array(32), n, row = 1;
    odd[0] = 0xEDB88320; for (n = 1; n < 32; n++) { odd[n] = row; row = (row << 1) >>> 0; }
    gf2Square(even, odd); gf2Square(odd, even);
    do {
      gf2Square(even, odd); if (len2 & 1) crc1 = gf2Times(even, crc1); len2 = Math.floor(len2 / 2); if (!len2) break;
      gf2Square(odd, even); if (len2 & 1) crc1 = gf2Times(odd, crc1); len2 = Math.floor(len2 / 2);
    } while (len2);
    return (crc1 ^ crc2) >>> 0;
  }
  /* operator matrix for "append len bytes": combine(crc1, crc2, len) === gf2Times(op(len), crc1) ^ crc2 — cached per length */
  var OPS = {};
  function opFor(len) { if (!OPS[len]) { var m = new Array(32); for (var n = 0; n < 32; n++) m[n] = crc32Combine((1 << n) >>> 0, 0, len); OPS[len] = m; } return OPS[len]; }
  function combineFast(crc1, crc2, len2) { return (gf2Times(opFor(len2), crc1) ^ crc2) >>> 0; }

  /* ---------------- zip reading (central directory only, entries inflated on demand) ---------------- */
  function zipEntries(blob) {
    var tail = Math.min(blob.size, 66 * 1024);
    return blob.slice(blob.size - tail).arrayBuffer().then(function (ab) {
      var u = new Uint8Array(ab), dv = new DataView(ab), eocd = -1;
      for (var i = u.length - 22; i >= 0; i--) { if (u[i] === 0x50 && u[i + 1] === 0x4b && u[i + 2] === 0x05 && u[i + 3] === 0x06) { eocd = i; break; } }
      if (eocd < 0) throw new Error("not a zip");
      var count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
      return blob.slice(cdOff, cdOff + cdSize).arrayBuffer().then(function (cd) {
        var c = new Uint8Array(cd), d = new DataView(cd), p = 0, list = [], td = new TextDecoder();
        for (var n = 0; n < count && p + 46 <= c.length; n++) {
          if (d.getUint32(p, true) !== 0x02014b50) break;
          var nl = d.getUint16(p + 28, true), el = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true);
          var e = { method: d.getUint16(p + 10, true), flags: d.getUint16(p + 8, true), crc: hex8(d.getUint32(p + 16, true)), csize: d.getUint32(p + 20, true), size: d.getUint32(p + 24, true), offset: d.getUint32(p + 42, true), name: td.decode(c.subarray(p + 46, p + 46 + nl)) };
          if (!/\/$/.test(e.name)) list.push(e);
          p += 46 + nl + el + cl;
        }
        return list;
      });
    });
  }
  /* the compressed bytes of an entry (verbatim) */
  function zipRaw(blob, e) {
    return blob.slice(e.offset, e.offset + 30).arrayBuffer().then(function (h) {
      var d = new DataView(h); if (d.getUint32(0, true) !== 0x04034b50) throw new Error("bad local header");
      var start = e.offset + 30 + d.getUint16(26, true) + d.getUint16(28, true);
      return blob.slice(start, start + e.csize).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    });
  }
  function inflateRaw(u8) {
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("no DecompressionStream"));
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function deflateRaw(u8) {
    return new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  /* inflated bytes of an entry (stored or deflate) */
  function zipRead(blob, e) {
    if (e.flags & 1) return Promise.reject(new Error("encrypted zip entry"));
    return zipRaw(blob, e).then(function (raw) {
      if (e.method === 0) return raw;
      if (e.method !== 8) throw new Error("unsupported compression method " + e.method);
      return inflateRaw(raw);
    });
  }

  /* ---------------- zip writing ----------------
     items: { name, data:Uint8Array }            → deflated (opts.store → stored)
            { name, blob:Blob }                  → stored (as before; used for BIOS packs / cue+bin bundles)
            { name, raw:Uint8Array, method, crc, size } → precompressed entry copied verbatim (no inflate/deflate) */
  function makeZip(items, zipName, opts) {
    opts = opts || {};
    var enc = new TextEncoder();
    return Promise.all(items.map(function (it) {
      if (it.raw) return { name: it.name, method: it.method, crc: typeof it.crc === "string" ? parseInt(it.crc, 16) >>> 0 : it.crc >>> 0, size: it.size, body: it.raw };
      var dataP = it.data ? Promise.resolve(it.data) : it.blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
      return dataP.then(function (u8) {
        var crc = crc32(u8);
        if (opts.store || it.blob || u8.length < 64) return { name: it.name, method: 0, crc: crc, size: u8.length, body: u8 };
        return deflateRaw(u8).then(function (z) { return z.length < u8.length ? { name: it.name, method: 8, crc: crc, size: u8.length, body: z } : { name: it.name, method: 0, crc: crc, size: u8.length, body: u8 }; });
      });
    })).then(function (list) {
      var parts = [], central = [], offset = 0;
      list.forEach(function (it) {
        var nameBytes = enc.encode(it.name);
        var lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, it.method, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
        lh.setUint32(14, it.crc, true); lh.setUint32(18, it.body.length, true); lh.setUint32(22, it.size, true); lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
        parts.push(lh.buffer, nameBytes, it.body);
        var ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, it.method, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
        ch.setUint32(16, it.crc, true); ch.setUint32(20, it.body.length, true); ch.setUint32(24, it.size, true); ch.setUint16(28, nameBytes.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
        central.push(ch.buffer, nameBytes);
        offset += 30 + nameBytes.length + it.body.length;
      });
      var cdSize = central.reduce(function (a, b) { return a + b.byteLength; }, 0);
      var eocd = new DataView(new ArrayBuffer(22));
      eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true); eocd.setUint16(8, list.length, true); eocd.setUint16(10, list.length, true); eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
      return new File(parts.concat(central, [eocd.buffer]), zipName, { type: "application/zip" });
    });
  }

  /* ---------------- 7z input (EmulatorJS' own extractor, local file, run in a worker) ---------------- */
  /* the worker script is fetched and started from a blob: URL — the way EmulatorJS itself runs this extractor, which
     works both over http and under Electron's app:// scheme (worker-src 'self' blob: in the CSP) */
  var workerBlobUrl = null;
  function extract7z(blob, workerUrl) {
    var url = workerUrl || "data/compression/extract7z.js";
    var scriptP = workerBlobUrl ? Promise.resolve(workerBlobUrl) : fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); }).then(function (txt) { workerBlobUrl = URL.createObjectURL(new Blob([txt], { type: "application/javascript" })); return workerBlobUrl; }).catch(function () { return url; });
    return Promise.all([blob.arrayBuffer(), scriptP]).then(function (r) {
      var ab = r[0], src = r[1];
      return new Promise(function (res, rej) {
        var w, files = [], t = setTimeout(function () { try { w.terminate(); } catch (e) { } rej(new Error("7z extraction timed out")); }, 120000);
        try { w = new Worker(src); } catch (e) { clearTimeout(t); rej(e); return; }
        w.onmessage = function (ev) {
          var m = ev.data || {};
          if (m.t === 2) files.push({ name: String(m.file || "").split("/").pop(), data: new Uint8Array(m.data) });
          if (m.t === 1) { clearTimeout(t); w.terminate(); res(files); }
        };
        w.onerror = function (e) { clearTimeout(t); rej(new Error("7z extraction failed" + (e && e.message ? ": " + e.message : ""))); };
        w.postMessage(new Uint8Array(ab));
      });
    });
  }

  /* ---------------- the core databases (www/data/arcade/*.json) ---------------- */
  var parseRef = function (w) { var p = w.split(":"); return { name: p[0], crc: p[1] || "", size: parseInt(p[2], 10) || 0 }; };
  /* crc → [{set, kind:"own"|"inh"|"bios", name, size}] — built once per database, lazily */
  function indexOf(db) {
    if (db._idx) return db._idx;
    var idx = {}, add = function (ref, set, kind) { var r = parseRef(ref); (idx[r.crc] = idx[r.crc] || []).push({ set: set, kind: kind, name: r.name, size: r.size }); };
    Object.keys(db.sets).forEach(function (s) { var e = db.sets[s]; e[5].forEach(function (w) { add(w, s, "own"); }); (e[6] || []).forEach(function (w) { add(w, s, "inh"); }); });
    Object.keys(db.biosSets || {}).forEach(function (b) { var d = db.biosSets[b]; d[1].concat(d[2]).forEach(function (w) { add(w, b, "bios"); }); });
    db._idx = idx; return idx;
  }
  /* which romset is this? scored by how many of a set's OWN files are inside (by CRC + size), ties → more inherited
     matches, then the zip's name, then parents before clones */
  function identify(db, entries, zipName) {
    var idx = indexOf(db), score = {}, base = (zipName || "").replace(/\.[^.]+$/, "").toLowerCase();
    entries.forEach(function (e) {
      (idx[e.crc] || []).forEach(function (h) {
        if (h.kind === "bios" || (h.size && e.size && h.size !== e.size)) return;
        var s = score[h.set] = score[h.set] || { own: 0, inh: 0, seen: {} };
        var key = h.kind + ":" + h.name; if (s.seen[key]) return; s.seen[key] = 1;
        if (h.kind === "own") s.own++; else s.inh++;
      });
    });
    var out = Object.keys(score).map(function (set) {
      var e = db.sets[set], own = e[5].length, s = score[set];
      return { set: set, title: e[0], year: e[1], maker: e[2], parent: e[3], bios: e[4], own: s.own, ownTotal: own, inh: s.inh, explained: s.own + s.inh, coverage: own ? s.own / own : 0 };
    }).filter(function (c) { return c.own > 0; });
    // rank: how much of the zip a set explains (its own + inherited files found), then how complete the set's own
    // files are, then the zip's own name, then parents before clones
    out.sort(function (a, b) {
      return (b.explained - a.explained) || (b.coverage - a.coverage) || ((b.set === base) - (a.set === base)) || ((a.parent ? 1 : 0) - (b.parent ? 1 : 0)) || a.set.localeCompare(b.set);
    });
    // a merged zip (parent + clone files) explains "more" through the clone; the complete parent is the canonical game
    if (out.length > 1 && out[0].parent) { var par = out.filter(function (c) { return c.set === out[0].parent && c.coverage === 1; })[0]; if (par && out[0].set !== base) { out.splice(out.indexOf(par), 1); out.unshift(par); } }
    return out.slice(0, 6);
  }

  /* deep identification: when the files are not there as-is (joined pairs, interleaved, split halves …) look at what
     the archive's files can be turned into: aligned power-of-two chunks, byte/word de-interleaves and joined pairs of
     equal-size files, all looked up in the same CRC index. Needs the data → async; only used when identify() is weak. */
  function identifyDeep(db, pool, zipName, srcIndex) {
    var idx = indexOf(db), items = pool.items.filter(function (it) { return (srcIndex === undefined || it.src === srcIndex) && it.size <= LIMITS.itemBytes && it.size >= 32; });
    var virt = {}, addV = function (crc, size) { if (idx[crc]) virt[crc + ":" + size] = { crc: crc, size: size }; };
    // joined pairs (CRC arithmetic only)
    var bySize = {}; items.forEach(function (it) { (bySize[it.size] = bySize[it.size] || []).push(it); });
    Object.keys(bySize).forEach(function (sz) { var l = bySize[sz]; if (l.length > 64) return; for (var i = 0; i < l.length; i++) for (var j = 0; j < l.length; j++) if (i !== j) addV(hex8(combineFast(parseInt(l[i].crc, 16), parseInt(l[j].crc, 16), l[j].size)), l[i].size * 2); });
    var pl = new Planner(pool), budget = LIMITS.deepHashBytes;
    // chunk sizes worth hashing = sizes that occur in the database (all DAT sizes are known up front)
    var dbSizes = {}; Object.keys(idx).forEach(function (c) { idx[c].forEach(function (h) { dbSizes[h.size] = 1; }); });
    items.sort(function (a, b) { return b.size - a.size; });
    return items.reduce(function (p, it) {
      return p.then(function () {
        if (it.size < 64 || it.size & (it.size - 1) || budget <= 0) return;   // only power-of-two files are cut/interleaved this way
        return pl.data(it).then(function (u8) {
          for (var S = it.size / 2; S >= 32 && budget > 0; S /= 2) { if (dbSizes[S]) { for (var off = 0; off + S <= u8.length; off += S) addV(hex8(crc32(u8.subarray(off, off + S))), S); budget -= u8.length; } if (S <= 256) break; }
          var half = it.size / 2; budget -= u8.length * 2;
          [1, 2].forEach(function (unit) {
            if (half % unit) return;
            var a = new Uint8Array(half), b = new Uint8Array(half), n = half / unit;
            for (var q = 0; q < n; q++) for (var k = 0; k < unit; k++) { a[q * unit + k] = u8[2 * q * unit + k]; b[q * unit + k] = u8[2 * q * unit + unit + k]; }
            addV(hex8(crc32(a)), half); addV(hex8(crc32(b)), half);
          });
        }).catch(function () { });
      });
    }, Promise.resolve()).then(function () {
      var entries = items.map(function (it) { return { crc: it.crc, size: it.size }; }).concat(Object.keys(virt).map(function (k) { return virt[k]; }));
      return identify(db, entries, zipName);
    });
  }

  /* ---------------- the pool: every file the user has at hand ----------------
     sources: [{ label, blob, entries? , files? }]  (entries from zipEntries; files = [{name,data}] for 7z / loose files) */
  function makePool(sources) {
    var items = [], byCrc = {}, bySize = {};
    sources.forEach(function (src, si) {
      var push = function (it) { it.src = si; it.label = src.label; items.push(it); (byCrc[it.crc] = byCrc[it.crc] || []).push(it); (bySize[it.size] = bySize[it.size] || []).push(it); };
      (src.entries || []).forEach(function (e) { if (e.size > 0) push({ name: e.name.split("/").pop(), crc: e.crc, size: e.size, entry: e, blob: src.blob }); });
      (src.files || []).forEach(function (f) { if (f.data && f.data.length) push({ name: f.name, crc: hex8(crc32(f.data)), size: f.data.length, data: f.data }); });
    });
    return { items: items, byCrc: byCrc, bySize: bySize, sources: sources };
  }

  /* ---------------- planning ---------------- */
  var LIMITS = { dataBytes: 256 * 1024 * 1024, itemBytes: 64 * 1024 * 1024, joinTries: 250000, interleaveBytes: 768 * 1024 * 1024, deepHashBytes: 512 * 1024 * 1024 };
  function Planner(pool, hooks) {
    this.pool = pool; this.hooks = hooks || {};
    this.cache = new Map(); this.cacheBytes = 0;           // item → Uint8Array
    this.derived = {};                                     // crc → {how, from:item, offset|unit|phase, size}
    this.splitDone = {}; this.deintDone = {}; this.ilBytes = 0;
  }
  Planner.prototype.data = function (it) {
    var self = this;
    if (it.data) return Promise.resolve(it.data);
    if (this.cache.has(it)) return Promise.resolve(this.cache.get(it));
    if (it.size > LIMITS.itemBytes) return Promise.reject(new Error("too big"));
    return zipRead(it.blob, it.entry).then(function (u8) {
      if (self.cacheBytes + u8.length > LIMITS.dataBytes) { self.cache.clear(); self.cacheBytes = 0; }
      self.cache.set(it, u8); self.cacheBytes += u8.length; return u8;
    });
  };
  Planner.prototype.matched = function (crc) { return !!(this.wantedCrc && this.wantedCrc[crc]); };
  /* aligned chunks of size S in every unmatched bigger item → derived[crc] */
  Planner.prototype.splitsFor = function (S) {
    var self = this, key = "s" + S; if (this.splitDone[key]) return Promise.resolve(); this.splitDone[key] = 1;
    var cands = this.pool.items.filter(function (it) { return it.size > S && it.size % S === 0 && it.size <= LIMITS.itemBytes && !self.matched(it.crc); });
    return cands.reduce(function (p, it) {
      return p.then(function () { return self.data(it).then(function (u8) {
        for (var off = 0; off + S <= u8.length; off += S) { var c = hex8(crc32(u8.subarray(off, off + S))); if (!self.derived[c]) self.derived[c] = { how: "split", from: it, offset: off, size: S }; }
      }).catch(function () { }); });
    }, Promise.resolve());
  };
  /* even/odd streams (byte and word interleave) of every unmatched item of size 2S → derived[crc] */
  Planner.prototype.deinterleavesFor = function (S) {
    var self = this, key = "d" + S; if (this.deintDone[key]) return Promise.resolve(); this.deintDone[key] = 1;
    var cands = this.pool.items.filter(function (it) { return it.size === 2 * S && it.size <= LIMITS.itemBytes && !self.matched(it.crc); });
    return cands.reduce(function (p, it) {
      return p.then(function () { return self.data(it).then(function (u8) {
        [1, 2].forEach(function (unit) {
          if (S % unit) return;
          var a = new Uint8Array(S), b = new Uint8Array(S), n = S / unit;
          for (var i = 0; i < n; i++) { for (var k = 0; k < unit; k++) { a[i * unit + k] = u8[2 * i * unit + k]; b[i * unit + k] = u8[2 * i * unit + unit + k]; } }
          var ca = hex8(crc32(a)), cb = hex8(crc32(b));
          if (!self.derived[ca]) self.derived[ca] = { how: "deinterleave", from: it, unit: unit, phase: 0, size: S };
          if (!self.derived[cb]) self.derived[cb] = { how: "deinterleave", from: it, unit: unit, phase: 1, size: S };
        });
      }).catch(function () { }); });
    }, Promise.resolve());
  };
  /* k equal parts (k = 2..4) whose concatenation has the wanted CRC — CRC arithmetic only */
  Planner.prototype.join = function (want) {
    var S = want.size, crc = parseInt(want.crc, 16) >>> 0, tries = 0;
    for (var k = 2; k <= 4; k++) {
      if (S % k) continue;
      var ps = S / k, cands = (this.pool.bySize[ps] || []);
      if (cands.length < k) continue;
      var op = opFor(ps), seq = [], found = null, self = this;
      var dfs = function (partial, depth) {
        if (found) return;
        if (depth === k) { if ((partial >>> 0) === crc) found = seq.slice(); return; }
        for (var i = 0; i < cands.length && !found; i++) {
          if (seq.indexOf(cands[i]) >= 0) continue;
          if (++tries > LIMITS.joinTries) return;
          var c = parseInt(cands[i].crc, 16) >>> 0;
          seq.push(cands[i]); dfs(depth === 0 ? c : ((gf2Times(op, partial) ^ c) >>> 0), depth + 1); seq.pop();
        }
      };
      dfs(0, 0);
      if (found) return { how: "join", parts: found, size: S };
      if (tries > LIMITS.joinTries) break;
    }
    return null;
  };
  /* two items of size S/2 interleaved (byte or word, either order) — needs the data */
  Planner.prototype.interleave = function (want) {
    var self = this, S = want.size; if (S % 2) return Promise.resolve(null);
    var half = S / 2, cands = (this.pool.bySize[half] || []).filter(function (it) { return it.size <= LIMITS.itemBytes; });
    if (cands.length < 2 || cands.length > 24) return Promise.resolve(null);
    var pairs = [];
    for (var i = 0; i < cands.length; i++) for (var j = 0; j < cands.length; j++) if (i !== j) pairs.push([cands[i], cands[j]]);
    // unmatched pairs first (files that are not already a wanted file are the likely halves)
    pairs.sort(function (a, b) { return (self.matched(a[0].crc) + self.matched(a[1].crc)) - (self.matched(b[0].crc) + self.matched(b[1].crc)); });
    var crc = want.crc, out = new Uint8Array(S);
    var tryPair = function (idx) {
      if (idx >= pairs.length) return Promise.resolve(null);
      if (self.ilBytes > LIMITS.interleaveBytes) return Promise.resolve(null);
      var a = pairs[idx][0], b = pairs[idx][1];
      return Promise.all([self.data(a), self.data(b)]).then(function (d) {
        var A = d[0], B = d[1], units = [1, 2];
        for (var u = 0; u < units.length; u++) {
          var unit = units[u]; if (half % unit) continue;
          for (var n = half / unit, q = 0; q < n; q++) { for (var k = 0; k < unit; k++) { out[2 * q * unit + k] = A[q * unit + k]; out[2 * q * unit + unit + k] = B[q * unit + k]; } }
          self.ilBytes += S;
          if (hex8(crc32(out)) === crc) return { how: "interleave", parts: [a, b], unit: unit, size: S };
        }
        return tryPair(idx + 1);
      }, function () { return tryPair(idx + 1); });
    };
    return tryPair(0);
  };
  Planner.prototype.resolve = function (want) {
    var self = this;
    var substitute = function () {   // a file the core accepts under another checksum (newer dump, warning only)
      var alts = self.alt && self.alt[want.name.toLowerCase()]; if (!alts) return null;
      var it = self.pool.items.filter(function (x) { return alts.indexOf(x.name.toLowerCase()) >= 0 && (!want.size || x.size === want.size) && (x.data || x.entry.method === 0 || x.entry.method === 8); })[0];
      return it ? { how: "substitute", from: it } : null;
    };
    var exact = (this.pool.byCrc[want.crc] || []).filter(function (it) { return !want.size || it.size === want.size; });
    if (exact.length) {
      // prefer a readable entry (stored / deflate) and the same name
      exact.sort(function (a, b) { var ra = (a.data || a.entry.method === 0 || a.entry.method === 8) ? 0 : 1, rb = (b.data || b.entry.method === 0 || b.entry.method === 8) ? 0 : 1; return (ra - rb) || ((b.name.toLowerCase() === want.name.toLowerCase()) - (a.name.toLowerCase() === want.name.toLowerCase())); });
      var it = exact[0];
      if (it.data || it.entry.method === 0 || it.entry.method === 8) return Promise.resolve({ how: it.name.toLowerCase() === want.name.toLowerCase() ? "same" : "rename", from: it });
      return Promise.resolve({ how: "unreadable", from: it, method: it.entry.method });
    }
    if (!want.size) return Promise.resolve(substitute());
    return this.splitsFor(want.size).then(function () { return self.deinterleavesFor(want.size); }).then(function () {
      var d = self.derived[want.crc]; if (d) return d;
      var j = self.join(want); if (j) return j;
      return self.interleave(want);
    }).then(function (r) { return r || substitute(); });
  };
  /* plan(db, setName, pool, opts) → { set, title, year, maker, parent, bios, files:[{name,crc,size,origin:"game"|"parent",how,...}], missing:[…], bios:{…} }
     opts.biosInstalled → skip the BIOS part; opts.progress(i, n) */
  function plan(db, setName, pool, opts) {
    opts = opts || {};
    var e = db.sets[setName]; if (!e) return Promise.reject(new Error("unknown set " + setName));
    var own = e[5].map(parseRef), inh = (e[6] || []).map(parseRef), bios = e[4], biosDef = bios && db.biosSets ? db.biosSets[bios] : null;
    var biosNames = {}; if (biosDef) biosDef[1].concat(biosDef[2]).forEach(function (w) { biosNames[parseRef(w).name.toLowerCase()] = 1; });
    var parentFiles = inh.filter(function (f) { return !biosNames[f.name.toLowerCase()]; });
    var wanted = own.map(function (f) { f.origin = "game"; return f; }).concat(parentFiles.map(function (f) { f.origin = "parent"; return f; }));
    var pl = new Planner(pool); pl.alt = opts.alt || null; pl.wantedCrc = {}; wanted.forEach(function (w) { pl.wantedCrc[w.crc] = 1; });
    var result = { set: setName, title: e[0], year: e[1], maker: e[2], parent: e[3], bios: bios, biosDesc: biosDef ? biosDef[0] : bios, files: [], missing: [], bios_: null, stats: {} };
    var i = 0;
    return wanted.reduce(function (p, w) {
      return p.then(function () {
        if (opts.progress) opts.progress(++i, wanted.length);
        return pl.resolve(w).then(function (r) {
          var f = { name: w.name, crc: w.crc, size: w.size, origin: w.origin, how: r ? r.how : "missing" };
          if (r) { f.res = r; if (r.from) f.from = r.from.label; if (r.parts) f.from = r.parts.map(function (x) { return x.label; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).join(" + "); }
          if (!r || r.how === "unreadable") result.missing.push(f);
          result.files.push(f);
        });
      });
    }, Promise.resolve()).then(function () {
      // BIOS set: not part of the game zip — but old merged sets carry its files, so it can be produced too
      if (biosDef && !opts.biosInstalled) {
        var req = biosDef[1].map(parseRef), opt = biosDef[2].map(parseRef), bp = { name: bios + ".zip", desc: biosDef[0], files: [], missing: [] };
        pl.wantedCrc = {}; req.concat(opt).forEach(function (w) { pl.wantedCrc[w.crc] = 1; });
        return req.concat(opt).reduce(function (p, w, k) {
          return p.then(function () { return pl.resolve(w).then(function (r) {
            var f = { name: w.name, crc: w.crc, size: w.size, required: k < req.length, how: r ? r.how : "missing" };
            if (r) { f.res = r; if (r.from) f.from = r.from.label; }
            if ((!r || r.how === "unreadable")) { if (f.required) bp.missing.push(f); } else bp.files.push(f);
          }); });
        }, Promise.resolve()).then(function () { bp.complete = !bp.missing.length && bp.files.length > 0; bp.anyFound = bp.files.length > 0; result.bios_ = bp; });
      }
    }).then(function () {
      var st = result.stats = { total: result.files.length, same: 0, rename: 0, join: 0, split: 0, interleave: 0, deinterleave: 0, substitute: 0, unreadable: 0, parent: 0 };
      result.files.forEach(function (f) { if (st[f.how] !== undefined) st[f.how]++; if (f.origin === "parent" && f.how !== "missing" && f.how !== "unreadable") st.parent++; });
      st.missing = result.missing.length; st.derived = st.join + st.split + st.interleave + st.deinterleave;
      result.complete = !result.missing.length;
      result.changed = st.rename + st.derived > 0 || result.files.some(function (f) { return f.res && f.res.from && f.res.from.src !== 0; }) || result.files.some(function (f) { return f.res && f.res.parts && f.res.parts.some(function (x) { return x.src !== 0; }); });
      result.planner = pl;
      return result;
    });
  }
  /* human summary of a plan */
  function describe(p) {
    var st = p.stats, bits = [];
    if (st.rename) bits.push(st.rename + " file" + (st.rename > 1 ? "s" : "") + " renamed");
    if (st.join) bits.push(st.join + " joined from parts");
    if (st.split) bits.push(st.split + " cut out of bigger files");
    if (st.interleave) bits.push(st.interleave + " interleaved from pairs");
    if (st.deinterleave) bits.push(st.deinterleave + " de-interleaved");
    if (st.substitute) bits.push(st.substitute + " replaced by a newer dump the core accepts");
    if (st.parent) bits.push(st.parent + " parent-set file" + (st.parent > 1 ? "s" : "") + " merged in");
    if (st.missing) bits.push(st.missing + " still missing");
    return bits.join(" · ") || "all files present";
  }
  /* which pool sources were actually used */
  function sourcesUsed(p) {
    var used = {};
    p.files.forEach(function (f) { if (!f.res) return; if (f.res.from) used[f.res.from.src] = 1; (f.res.parts || []).forEach(function (x) { used[x.src] = 1; }); });
    return Object.keys(used).map(function (k) { return p.planner.pool.sources[k].label; });
  }

  /* ---------------- building ---------------- */
  function produce(pl, res) {
    if (res.how === "same" || res.how === "rename" || res.how === "substitute") {
      var it = res.from;
      if (it.data) return Promise.resolve({ data: it.data });
      if (it.entry.method === 8 || it.entry.method === 0) return zipRaw(it.blob, it.entry).then(function (raw) { return { raw: raw, method: it.entry.method, crc: it.crc, size: it.size }; });
      return Promise.reject(new Error("unreadable"));
    }
    if (res.how === "split") return pl.data(res.from).then(function (u8) { return { data: u8.slice(res.offset, res.offset + res.size) }; });
    if (res.how === "deinterleave") return pl.data(res.from).then(function (u8) {
      var S = res.size, unit = res.unit, out = new Uint8Array(S), n = S / unit;
      for (var i = 0; i < n; i++) for (var k = 0; k < unit; k++) out[i * unit + k] = u8[2 * i * unit + res.phase * unit + k];
      return { data: out };
    });
    if (res.how === "join") return Promise.all(res.parts.map(function (x) { return pl.data(x); })).then(function (ds) {
      var out = new Uint8Array(res.size), off = 0; ds.forEach(function (d) { out.set(d, off); off += d.length; }); return { data: out };
    });
    if (res.how === "interleave") return Promise.all(res.parts.map(function (x) { return pl.data(x); })).then(function (ds) {
      var A = ds[0], B = ds[1], unit = res.unit, half = A.length, out = new Uint8Array(res.size), n = half / unit;
      for (var q = 0; q < n; q++) for (var k = 0; k < unit; k++) { out[2 * q * unit + k] = A[q * unit + k]; out[2 * q * unit + unit + k] = B[q * unit + k]; }
      return { data: out };
    });
    return Promise.reject(new Error("cannot produce " + res.how));
  }
  /* build the zip of a plan: every resolved file, exact wanted name; derived data is verified against the wanted CRC */
  function build(p, zipName, which) {
    var pl = p.planner, list = (which || p.files).filter(function (f) { return f.res && f.how !== "unreadable"; }), items = [], failed = [];
    return list.reduce(function (pr, f) {
      return pr.then(function () {
        return produce(pl, f.res).then(function (o) {
          if (o.data && hex8(crc32(o.data)) !== f.crc) { failed.push(f); return; }
          items.push(o.raw ? { name: f.name, raw: o.raw, method: o.method, crc: o.crc, size: o.size } : { name: f.name, data: o.data });
        }, function () { failed.push(f); });
      });
    }, Promise.resolve()).then(function () {
      return makeZip(items, zipName).then(function (file) { return { file: file, failed: failed, count: items.length }; });
    });
  }

  var api = { crc32: crc32, crc32Combine: crc32Combine, combineFast: combineFast, hex8: hex8, zipEntries: zipEntries, zipRead: zipRead, zipRaw: zipRaw, makeZip: makeZip, deflateRaw: deflateRaw, inflateRaw: inflateRaw, extract7z: extract7z, indexOf: indexOf, identify: identify, identifyDeep: identifyDeep, makePool: makePool, plan: plan, build: build, describe: describe, sourcesUsed: sourcesUsed, parseRef: parseRef, LIMITS: LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ROMFIX = api;
})(typeof window !== "undefined" ? window : globalThis);
