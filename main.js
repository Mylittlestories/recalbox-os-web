const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const WWW_DIR = path.join(__dirname, 'www');
const CORES_DIR = path.join(WWW_DIR, 'data', 'cores');

/*
 * OFFLINE BY DESIGN
 * -----------------
 * Like RetroArch / RetroPie, every emulator core ships inside the application
 * (www/data/cores/*.data — bundled by scripts/download-cores.js at build time).
 * The renderer only ever talks to the app:// scheme below; any other protocol
 * (http, https, ws, wss, ftp…) is refused at the session level, so the app works
 * with no network connection at all and never "phones home".
 */
const ALLOWED_URL = /^(app:\/\/recalbox\/|blob:|data:|devtools:|chrome-extension:)/i;
const CSP = [
  "default-src 'self' app://recalbox blob: data:",
  "script-src 'self' app://recalbox blob: 'wasm-unsafe-eval' 'unsafe-eval'",
  "style-src 'self' app://recalbox 'unsafe-inline'",
  "img-src 'self' app://recalbox blob: data:",
  "media-src 'self' app://recalbox blob: data:",
  "font-src 'self' app://recalbox data:",
  "worker-src 'self' app://recalbox blob:",
  "connect-src 'self' app://recalbox blob: data:",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

/** Count the bundled cores so a broken/incomplete build is visible in the log. */
function coreInventory() {
  try {
    const files = fs.readdirSync(CORES_DIR).filter((f) => f.endsWith('-wasm.data'));
    const bytes = files.reduce((a, f) => a + fs.statSync(path.join(CORES_DIR, f)).size, 0);
    return { count: files.length, bytes };
  } catch (e) {
    return { count: 0, bytes: 0 };
  }
}

// Custom scheme must be registered as privileged BEFORE app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.nes': 'application/octet-stream',
  '.smc': 'application/octet-stream',
  '.sfc': 'application/octet-stream',
  '.gb': 'application/octet-stream',
  '.gbc': 'application/octet-stream',
  '.gba': 'application/octet-stream',
  '.n64': 'application/octet-stream',
  '.z64': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.cue': 'application/octet-stream',
  '.iso': 'application/octet-stream',
  '.img': 'application/octet-stream',
  '.md': 'application/octet-stream',
  '.gen': 'application/octet-stream',
  '.sms': 'application/octet-stream',
  '.gg': 'application/octet-stream',
  '.a26': 'application/octet-stream',
  '.a52': 'application/octet-stream',
  '.a78': 'application/octet-stream',
  '.lyx': 'application/octet-stream',
  '.j64': 'application/octet-stream',
  '.pce': 'application/octet-stream',
  '.wsc': 'application/octet-stream',
  '.ngp': 'application/octet-stream',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.d64': 'application/octet-stream',
  '.adf': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  // added: more ROM / disc formats that the frontend accepts
  '.fds': 'application/octet-stream',
  '.unf': 'application/octet-stream',
  '.unif': 'application/octet-stream',
  '.fig': 'application/octet-stream',
  '.swc': 'application/octet-stream',
  '.bs': 'application/octet-stream',
  '.v64': 'application/octet-stream',
  '.ndd': 'application/octet-stream',
  '.sgb': 'application/octet-stream',
  '.nds': 'application/octet-stream',
  '.pbp': 'application/octet-stream',
  '.chd': 'application/octet-stream',
  '.cso': 'application/octet-stream',
  '.m3u': 'application/octet-stream',
  '.ecm': 'application/octet-stream',
  '.smd': 'application/octet-stream',
  '.sg': 'application/octet-stream',
  '.lnx': 'application/octet-stream',
  '.jag': 'application/octet-stream',
  '.rom': 'application/octet-stream',
  '.abs': 'application/octet-stream',
  '.cof': 'application/octet-stream',
  '.sgx': 'application/octet-stream',
  '.ws': 'application/octet-stream',
  '.pc2': 'application/octet-stream',
  '.ngc': 'application/octet-stream',
  '.npc': 'application/octet-stream',
  '.t64': 'application/octet-stream',
  '.prg': 'application/octet-stream',
  '.crt': 'application/octet-stream',
  '.g64': 'application/octet-stream',
  '.x64': 'application/octet-stream',
  '.tap': 'application/octet-stream',
  '.adz': 'application/octet-stream',
  '.hdf': 'application/octet-stream',
  '.lha': 'application/octet-stream',
  '.ipf': 'application/octet-stream',
  '.dms': 'application/octet-stream',
  '.exe': 'application/octet-stream',
  '.com': 'application/octet-stream',
  '.bat': 'application/octet-stream',
  '.dosz': 'application/octet-stream',
  '.state': 'application/octet-stream',
  '.srm': 'application/octet-stream',
};

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e12',
    autoHideMenuBar: true,
    title: 'Recalbox OS Web',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Gamepads / audio should keep running when the window loses focus briefly
      backgroundThrottling: false,
      // Booting with a gamepad button gives no "user activation" — allow audio to start anyway.
      autoplayPolicy: 'no-user-gesture-required',
      // Chromium's spellchecker downloads dictionaries from Google's CDN — not wanted in an offline app.
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  // External links (e.g. license URLs from the emulator menu) open in the default browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://recalbox/')) event.preventDefault();
  });
  win.loadURL('app://recalbox/index.html');
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  // --- Network lockdown: nothing but our own app:// scheme may be requested. ---
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (ALLOWED_URL.test(details.url)) return callback({});
    console.warn('[offline] blocked network request:', details.url);
    callback({ cancel: true });
  });
  // No proxy, no DNS-over-HTTPS lookups, no Chromium "network prediction" background traffic.
  ses.setProxy({ mode: 'direct' }).catch(() => {});
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    // gamepads / fullscreen / pointer lock don't go through here; deny everything that does (geolocation, notifications…)
    cb(false);
  });

  const inv = coreInventory();
  if (inv.count === 0) {
    console.warn('[cores] No emulator cores found in ' + CORES_DIR + ' — run `npm run cores` once (needs internet), then restart.');
  } else {
    console.log(`[cores] ${inv.count} core files bundled (${(inv.bytes / 1048576).toFixed(0)} MB) — running fully offline.`);
  }

  // Serve files from www/ over the app:// scheme with COOP/COEP so that
  // SharedArrayBuffer-based threading cores (PSP, DOSBox) can load.
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '' || p === '/') p = '/index.html';
    let fullPath = path.normalize(path.join(WWW_DIR, p));
    // Prevent path traversal outside www/
    if (!fullPath.startsWith(WWW_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    const headers = (len) => ({
      'Content-Type': mimeFor(fullPath),
      'Content-Length': String(len),
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': CSP,
    });
    if (request.method === 'HEAD') {
      return fs.promises
        .stat(fullPath)
        .then((st) => new Response(null, { status: 200, headers: headers(st.size) }))
        .catch(() => new Response(null, { status: 404 }));
    }
    return fs.promises
      .readFile(fullPath)
      .then((data) => new Response(data, { status: 200, headers: headers(data.length) }))
      .catch((err) => {
        if (err.code === 'ENOENT') {
          return new Response('Not Found: ' + p, { status: 404 });
        }
        return new Response('Server Error', { status: 500 });
      });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
