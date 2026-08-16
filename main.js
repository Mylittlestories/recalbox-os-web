const { app, BrowserWindow, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const WWW_DIR = path.join(__dirname, 'www');

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
};

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0e12',
    autoHideMenuBar: true,
    title: 'Recalbox OS Web',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.loadURL('app://recalbox/index.html');
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Serve files from www/ over the app:// scheme with COOP/COEP so that
  // SharedArrayBuffer-based threading cores (PSP, DOSBox, 3DS) can load.
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '' || p === '/') p = '/index.html';
    let fullPath = path.normalize(path.join(WWW_DIR, p));
    // Prevent path traversal outside www/
    if (!fullPath.startsWith(WWW_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return fs.promises
      .readFile(fullPath)
      .then((data) => {
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': mimeFor(fullPath),
            'Content-Length': data.length,
            'Cache-Control': 'no-store',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Access-Control-Allow-Origin': '*',
          },
        });
      })
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
