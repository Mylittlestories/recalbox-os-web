<div align="center">

# 🕹️ RECALBOX OS WEB

**Standalone multi-system retro gaming desktop app** — plays games for **26 retro systems** in a Recalbox / RetroBat-style frontend that runs as a normal application. **No operating system to install, no internet connection needed: every emulator is bundled inside the app.**

![System view](www/img/screenshot.png)

[![Systems](https://img.shields.io/badge/systems-26-blue)](#-supported-systems)
[![Offline](https://img.shields.io/badge/runs-100%25%20offline-success)](#-standalone--offline-by-design)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](#-licenses)
[![Release](https://img.shields.io/github/v/release/Mylittlestories/recalbox-os-web?color=orange&label=release)](https://github.com/Mylittlestories/recalbox-os-web/releases)

</div>

## 📥 Download & Install

**Get the latest installer for your platform from the [Releases page](https://github.com/Mylittlestories/recalbox-os-web/releases):**

| Platform | File | Type |
|----------|------|------|
| 🪟 Windows | `Recalbox.OS.Web.Setup.2.1.0.exe` | Installer |
| 🪟 Windows | `Recalbox.OS.Web.2.1.0.exe` | Portable (no install) |
| 🐧 Linux | `Recalbox.OS.Web-2.1.0.AppImage` | AppImage |
| 🍎 macOS | `Recalbox.OS.Web-2.1.0.dmg` | Disk image |

<div align="center">

<a href="https://github.com/Mylittlestories/recalbox-os-web/releases/latest">
  <img src="https://img.shields.io/badge/⬇-Download%20Latest%20Release-orange?style=for-the-badge" alt="Download">
</a>

</div>

> **No Node.js needed** — the [GitHub Actions build](#️-cloud-build-option-b) compiles the installers in the cloud automatically. Just download and run.

## 🔌 Standalone — offline by design

Like **RetroArch** or **RetroPie**, the emulators are *part of the application*:

- **All 25 emulator cores are bundled** in the installer (`www/data/cores/`, ~92 MB) — RetroArch/libretro cores compiled to WebAssembly by the [EmulatorJS](https://emulatorjs.org) project (fceumm, snes9x, mupen64plus-next, pcsx-rearmed, ppsspp, genesis-plus-gx, fbneo, mame2003-plus, dosbox-pure…). They are pinned to the **exact runtime version** shipped in the app, so nothing can drift.
- **Nothing is downloaded at runtime.** The Electron shell blocks every network request that is not the app's own `app://` scheme (plus a strict Content-Security-Policy), and the frontend neutralises the two places where the emulator runtime would otherwise reach its CDN (update check, core "failsafe" download). Disconnect the cable, put the PC in a cupboard — it works.
- **Visible in the UI:** the boot screen reports `loading emulators ..... 25/25 cores · 92 MB · offline ready`, **Settings → Emulators** lists every core with its size, and the **CORE** chip in each system's library opens the core details. If a build ever lacked a core, that system is flagged `CORE MISSING` and its games are not launched (instead of a silent download attempt).
- **Guaranteed by the build:** `npm run dist` and the GitHub workflow refuse to package an incomplete core set (`npm run cores:check`).

Your games, BIOS, save states and settings are stored locally too — nothing ever leaves your machine.

![Core details](www/img/core-info.png)

## ✨ What's new in 2.0 — the RetroBat treatment

Version 2.0 rebuilds the frontend around the ideas that make [RetroBat](https://www.retrobat.org/) / EmulationStation pleasant to use with a controller from the couch:

| Area | What you get |
|------|--------------|
| **Persistent library** | Games you add are stored *inside the app* (IndexedDB) and survive restarts. Drop files **anywhere** in the window, multi-select, and the system is detected from the extension. `.cue` + `.bin` discs are packed together automatically. |
| **Collections** | **Recently played**, **Favorites** and **All games** appear next to the systems, with per-system game counts. Systems without games can be hidden. |
| **Full controller & keyboard navigation** | D-pad / left stick to move, **A** open · **B** back · **X** game options · **Y** search · **START** settings · **L1/R1** switch system. Every screen shows its button hints. |
| **Game view** | Type-to-filter, sort (A-Z / last played / date added / most played / system), grid or list view, random game, jump-to-letter, favorites on top, box art from your last screenshot, play count & play time. |
| **Game options** | Long-press / right-click / **SPACE**: play, favorite, rename, move to another system, clear saves, delete. |
| **RetroBat hotkeys in game** | F2 save · F4 load · F6/F7 slot · F8 screenshot · F9 rewind · SPACE fast-forward · P pause · F11 fullscreen · **CTRL+F12 Game Control Center** · ESC quit — and the same with **HOTKEY + button** on a gamepad (see table below). |
| **Game Control Center** | An in-game overlay: resume, save/load with slot picker, screenshot, controls "tattoo", emulator menu, fullscreen, favorite, reset, quit. The game is paused while it's open. |
| **Save states that stick** | 9 slots per game stored in the app, with **Auto save / load** ("resume where you left"). |
| **BIOS manager** | Per-system BIOS list with required/optional flags, one-click install, **missing BIOS check** before launch (like RetroBat). |
| **Settings** | Shader set (CRT etc.), rewind, fast-forward ratio, FPS counter, smooth/bilinear, volume, gamepad HOTKEY button, navigation sounds, 3 themes, kid mode, hide empty systems, storage report, library export. |
| **Controls tattoo** | The first time you play a system you get its default layout; it's always one press away (CONTROLS button / control center). |

## 🎮 In Action

![Game view](www/img/library.png)

![Game Control Center](www/img/control-center.png)

![Settings](www/img/settings.png)

## ⌨️ Controls & hotkeys

### Menus

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | Arrows | D-pad / left stick |
| Open / Play | `Enter` | **A** |
| Back | `Esc` / `Backspace` | **B** |
| Game options | `Space` / right-click | **X** |
| Search / filter | `F` | **Y** |
| Settings | `S` | **START** |
| View options (sort, view style, random…) | `O` sort · `V` view · `R` random | **SELECT** |
| Previous / next system (game view) | `PgUp` / `PgDn` | **L1 / R1** |
| Add games | `A` / `Insert` | — |
| Help | `H` | — |

### In game (RetroBat layout)

| Action | Keyboard | Gamepad (hold **HOTKEY**, default SELECT) |
|--------|----------|-------------------------------------------|
| Game Control Center | `Ctrl+F12` | HOTKEY + **B** |
| Quit game | `Esc` | HOTKEY + **START** |
| Emulator menu (shaders, remap, core options) | `F1` | HOTKEY + **L1** |
| Save state | `F2` | HOTKEY + **Y** |
| Load state | `F4` | HOTKEY + **X** |
| State slot − / + | `F6` / `F7` | HOTKEY + **D-pad ↓ / ↑** |
| Screenshot (also becomes box art) | `F8` | HOTKEY + **R3** |
| Rewind (hold; enable in Settings) | `F9` | HOTKEY + **D-pad ←** |
| Fast-forward (hold) | `Space` (`F10` on computer systems) | HOTKEY + **D-pad →** |
| Pause | `P` (not on computer systems) | HOTKEY + **A** |
| Fullscreen | `F11` | — |

Default game keys: **Arrows** = D-pad · **Z** = B/1 · **X** = A/2 · **A** = Y/3 · **S** = X/4 · **Enter** = START · **V** = SELECT · **Q/E** = L/R. Any standard gamepad works out of the box; remap in the emulator menu (`F1` → Control Settings).

## 🖥️ Supported systems

| System | Core | BIOS |
|--------|------|------|
| Nintendo NES / Famicom Disk System | fceumm | `disksys.rom` (FDS only) |
| Super Nintendo (SNES) | snes9x | — |
| Nintendo 64 | mupen64plus_next | — |
| Game Boy / Game Boy Color | gambatte | — |
| Game Boy Advance | mgba | optional `gba_bios.bin` |
| Nintendo DS | melonds | optional `bios7.bin`, `bios9.bin`, `firmware.bin` |
| Sony PlayStation | pcsx_rearmed | **`scph5501.bin`** (or 5500 / 5502 / 1001) |
| PlayStation Portable | ppsspp | — |
| Sega Genesis / Mega Drive | genesis_plus_gx | — |
| Sega Master System | smsplus | — |
| Sega Game Gear | genesis_plus_gx | — |
| Sega CD | genesis_plus_gx | **`bios_CD_U.bin`** / E / J |
| Sega Saturn | yabause | **`saturn_bios.bin`** |
| Atari 2600 / 5200 / 7800 | stella2014 / a5200 / prosystem | optional `5200.rom`, `7800 BIOS (U).rom` |
| Atari Lynx | handy | **`lynxboot.img`** |
| Atari Jaguar | virtualjaguar | — |
| PC Engine / TurboGrafx-16 | mednafen_pce | `syscard3.pce` (CD games) |
| WonderSwan / Color | mednafen_wswan | — |
| Neo Geo Pocket / Color | mednafen_ngp | — |
| Commodore 64 | vice_x64sc | — |
| Commodore Amiga | puae | **`kick34005.A500`** (Kickstart) |
| Arcade (FBNeo) | fbneo | `neogeo.zip` for Neo Geo games |
| MAME 2003 Plus | mame2003_plus | `neogeo.zip` for Neo Geo games |
| MS-DOS (DOSBox Pure) | dosbox_pure | — |

Bold = required. Install BIOS files from the **BIOS** button in a system's game view, or run **Settings → Missing BIOS check**.

## ⚠️ Important note about game ROMs

The app provides the **emulator engines** (open source, GPL). It does **not** include
copyrighted games. You add your own ROMs in the app (**ADD GAMES** or drag-and-drop);
they are stored inside the app's local database, never uploaded anywhere.
A few systems (PS1, Sega CD, Saturn, Lynx, Amiga…) require **BIOS files** that you supply yourself.

A bundled **free** demo game is included: **2048** for NES (homebrew).

## 🛠️ Run locally (development)

```bash
npm install
npm run cores          # bundle the emulator cores into www/data/cores (internet needed ONCE, ~92 MB)
npm start              # launch the app window — works offline from now on
npm run cores:check    # verify the bundle is complete without touching the network
```

`npm start` also runs the core script in "soft" mode: if something is missing and you are online it
completes the set, if you are offline it simply starts the app with what is there.

Tip: the frontend is plain HTML/CSS/JS in `www/` — you can also serve that folder with any static
server that sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
headers and open it in Chrome for quick UI work.

## 📦 Build installers locally

```bash
npm install
npm run cores
npm run dist -- --win     # Windows .exe (needs Windows, or Wine on Linux)
npm run dist -- --linux   # Linux AppImage
npm run dist -- --mac     # macOS .dmg (needs macOS)
```

Output goes into `dist/`. The cores are packaged **inside** the installer (unpacked next to the
asar archive so the emulator can stream them); `predist` aborts the build if any core is missing.

## ☁️ Cloud build (Option B)

Push this repo to GitHub, then either push a tag (`v2.1.0`) or run the
**"Build Recalbox OS Web"** workflow from the Actions tab. GitHub Actions:

1. checks out the code,
2. bundles all emulator cores (cached between runs, verified for completeness),
3. builds Windows (`.exe`), Linux (`.AppImage`) and macOS (`.dmg`) installers,
4. uploads them as workflow artifacts — and on a version tag, attaches them to a
   **GitHub Release** so you can download ready-made installers.

## 📂 Project layout

```
main.js                 Electron main (app:// protocol with COOP/COEP + CSP, network lockdown, core inventory)
www/                    the app (frontend + EmulatorJS data)
  index.html            UI: boot · system view · game view · player · control center · dialogs
  js/app.js             frontend logic (library DB, navigation, hotkeys, settings, BIOS manager)
  css/                  theme + font
  img/                  screenshots for this README
  data/                 EmulatorJS 4.2.3 runtime (stable release)
  data/cores/           bundled emulator cores + manifest.json (from `npm run cores`, not in git)
  roms/                 bundled free demo games
build/icon.png          app icon
scripts/download-cores.js   bundles/verifies the emulator cores (pinned to the runtime version)
.github/workflows/build.yml  GitHub Actions cloud build
```

Where things are stored on your machine (all local): games, BIOS and box art in the app's
IndexedDB (`recalbox-web`), save states in `EmulatorJS-states`, in-game saves (SRAM / memory cards)
in the emulator's IDBFS, settings in `localStorage`.

## 📄 Licenses

- EmulatorJS and its RetroArch cores are **GPL-3.0**.
- This app is provided for playing games you own. Always respect copyright.
