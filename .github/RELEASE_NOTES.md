<p align="center"><img src="https://raw.githubusercontent.com/Mylittlestories/recalbox-os-web/main/www/img/banner.svg" width="100%" alt="Recalbox OS Web"></p>

**Standalone multi-system retro gaming desktop app — 26 systems, every emulator bundled, 100 % offline, 38 free games pre-installed.**

## 📥 Downloads

| Platform | File | Notes |
|---|---|---|
| 🪟 Windows 10/11 | `RecalboxOSWeb-<version>-win-x64-setup.exe` | one-click installer — `…-portable.exe` runs without installing |
| 🐧 Linux | `RecalboxOSWeb-<version>-linux-x86_64.AppImage` | `chmod +x` and run |
| 🍎 macOS | `RecalboxOSWeb-<version>-mac-arm64.dmg` (Apple Silicon) · `…-mac-x64.dmg` (Intel) | unsigned build: if macOS refuses to open it, allow it under *System Settings → Privacy & Security → Open Anyway* |

Windows SmartScreen / macOS Gatekeeper warn because the installers are not code-signed (no certificate) — the source that produced them is this repository, built by the public GitHub Actions workflow linked above each release.

Nothing else to install: the installers contain all 25 emulator cores (~92 MB) and the free game library.

## 🆕 What's new in 2.2.3

- **Neo Geo games: the BIOS set is now a one-step install, not a confusing "missing files" list.** A complete `mslug3.zip` (or any Neo Geo / PGM set) without its `neogeo.zip` is reported as *ONE MORE FILE: NEOGEO.ZIP* — informational, the game is fine — with **Add the game and install `neogeo.zip` now** as the first choice. Until the BIOS is there the card says **NEEDS BIOS**, the library's BIOS chip reads *BIOS NEEDED · n games*, and pressing Play asks to install it instead of dropping into the emulator menu.
- **The BIOS manager verifies arcade BIOS zips.** A current-MAME / FBNeo `neogeo.zip` given to MAME 2003-Plus (or a MAME 0.78 one given to FBNeo) is refused with the reason and the version that *is* needed; a minimal set is accepted; the installed row shows what it contains (*4/4 system files · 14/14 optional BIOS versions*). Only the required BIOS files count — alternate region / Universe BIOS ROMs are optional, exactly as in the cores.
- Clones inherit their parent's BIOS (`garoup`, `kof98k` …) and are checked for both; MAME *WRONG CHECKSUMS* warnings no longer abort a game that actually boots (a toast names the bad zip instead), while dumps from another MAME version are still stopped with an explanation.

## 🆕 What's new in 2.2.2

- **Arcade check — BIOS & parent sets.** Files that live in a BIOS set (`neogeo.zip`, `pgm.zip` …) or in a clone's parent game are no longer flagged as "missing" from the game zip. They are verified in the BIOS zip installed via the BIOS manager / the parent zip in the library, with precise verdicts: *needs `neogeo.zip`* (+ **Add and install now** shortcut), *installed `neogeo.zip` does not match this set*, *clone of `puckman` — parent set needed*.

## 🆕 What's new in 2.2.1

- **Arcade romset check.** Adding a MAME / FinalBurn Neo zip now validates it against the core's own database (romset name, files, CRC32s, BIOS/parent) and explains any problem with the fix — e.g. *"Circus (Exidy 1977).zip" is not a romset name MAME 2003-Plus knows → Add as `circus.zip`*, *files are from another MAME version*, *needs `neogeo.zip`*, *.7z not supported*. Before, a wrong zip silently opened RetroArch's own menu instead of the game.
- Recognised arcade games are added under their real title with year and manufacturer; problem files get a **WON'T RUN / INCOMPLETE** badge; a failing arcade launch shows the reason and `ESC` leaves directly.
- README: a guide to arcade romsets (which versions the two cores need and why the file name matters).

## 🆕 What's new in 2.2

- **38 legally free games for 20 systems are bundled** — NES, SNES, N64, Game Boy, GBA, Mega Drive, Master System, Game Gear, Atari 2600, Lynx, Jaguar, PC Engine, WonderSwan, Neo Geo Pocket, PlayStation, PSP, Saturn, Arcade (FBNeo), MAME and DOS. Homebrew, open-source and freeware titles plus the mamedev.org arcade classics (Gridlee, Robby Roto, Super Tank, Circus, Car Polo, Side Trak, Rip Cord, Fire One!, Star Fire, Targ, Spectar); each one verified running on its bundled core, offline. Credits and licences: `www/roms/LICENSES.md`.
- **Game info dialog** (`I` / *Game options → Game info*): description, author, year, genre, players, licence, source, file, size, play stats and box art for every game.
- **New app icon and logo** — Windows `.ico`, macOS `.icns`, Linux icon set, boot screen and header mark.
- Per-system libretro core options are applied on first launch (Jaguar renders, MAME skips the disclaimers).
- Fixes: a held gamepad button no longer re-triggers a menu action after quitting a game; focus follows a game after rename/favourite; PSX `.exe`, Jaguar `.prg`, PSP `.elf/.prx` accepted; ROM/core downloaders retry with timeouts so builds cannot stall.

### Since 1.0
- **2.1** — all 25 emulator cores packaged inside the installer; the app blocks every network request (`app://` only); *Settings → Emulators* core inventory.
- **2.0** — RetroBat-style frontend: persistent library (IndexedDB), collections, full controller + keyboard navigation, RetroBat hotkeys, Game Control Center, 9 save slots + auto save/load, BIOS manager, settings, controls tattoo, 3 themes.

## ⚠️ ROMs
The bundled games are free titles distributed with their authors' permission. For everything else, only use games you legally own — see the README.
