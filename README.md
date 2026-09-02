<div align="center">

# 🕹️ RECALBOX OS WEB

**Multi-system retro gaming desktop app** — plays games for **26 retro systems** in a Recalbox / RetroBat-style frontend that runs as a normal application. **No operating system to install or boot.**

![System view](www/img/screenshot.png)

[![Systems](https://img.shields.io/badge/systems-26-blue)](#-supported-systems)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](#-licenses)
[![Release](https://img.shields.io/github/v/release/Mylittlestories/recalbox-os-web?color=orange&label=release)](https://github.com/Mylittlestories/recalbox-os-web/releases)

</div>

## 📥 Download & Install

**Get the latest installer for your platform from the [Releases page](https://github.com/Mylittlestories/recalbox-os-web/releases):**

| Platform | File | Type |
|----------|------|------|
| 🪟 Windows | `Recalbox.OS.Web.Setup.2.0.0.exe` | Installer |
| 🪟 Windows | `Recalbox.OS.Web.2.0.0.exe` | Portable (no install) |
| 🐧 Linux | `Recalbox.OS.Web-2.0.0.AppImage` | AppImage |
| 🍎 macOS | `Recalbox.OS.Web-2.0.0.dmg` | Disk image |

<div align="center">

<a href="https://github.com/Mylittlestories/recalbox-os-web/releases/latest">
  <img src="https://img.shields.io/badge/⬇-Download%20Latest%20Release-orange?style=for-the-badge" alt="Download">
</a>

</div>

> **No Node.js needed** — the [GitHub Actions build](#️-cloud-build-option-b) compiles the installers in the cloud automatically. Just download and run.

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
npm run cores          # download the emulator cores (only needed once)
npm start              # launch the app window
```

Tip: the frontend is plain HTML/CSS/JS in `www/` — you can also serve that folder with any static
server that sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
headers and open it in Chrome for quick UI work.

## 📦 Build installers locally

```bash
npm install
npm run cores
npx electron-builder --win     # Windows .exe (needs Windows, or Wine on Linux)
npx electron-builder --linux   # Linux AppImage
npx electron-builder --mac     # macOS .dmg (needs macOS)
```

Output goes into `dist/`.

## ☁️ Cloud build (Option B)

Push this repo to GitHub, then either push a tag (`v2.0.0`) or run the
**"Build Recalbox OS Web"** workflow from the Actions tab. GitHub Actions:

1. checks out the code,
2. downloads all emulator cores (plus their build reports and the PPSSPP asset pack),
3. builds Windows (`.exe`), Linux (`.AppImage`) and macOS (`.dmg`) installers,
4. uploads them as workflow artifacts — and on a version tag, attaches them to a
   **GitHub Release** so you can download ready-made installers.

## 📂 Project layout

```
main.js                 Electron main (custom app:// protocol with COOP/COEP, offline EmulatorJS)
www/                    the app (frontend + EmulatorJS data)
  index.html            UI: boot · system view · game view · player · control center · dialogs
  js/app.js             frontend logic (library DB, navigation, hotkeys, settings, BIOS manager)
  css/                  theme + font
  img/                  screenshots for this README
  data/                 EmulatorJS 4.2.3 runtime (stable release) + cores (from `npm run cores`)
  roms/                 bundled free demo games
build/icon.png          app icon
scripts/download-cores.js   fetches all emulator cores
.github/workflows/build.yml  GitHub Actions cloud build
```

Where things are stored on your machine (all local): games, BIOS and box art in the app's
IndexedDB (`recalbox-web`), save states in `EmulatorJS-states`, in-game saves (SRAM / memory cards)
in the emulator's IDBFS, settings in `localStorage`.

## 📄 Licenses

- EmulatorJS and its RetroArch cores are **GPL-3.0**.
- This app is provided for playing games you own. Always respect copyright.
