# Bundled free games — credits & licences

Every game shipped in this folder is either **open source**, **freeware/homebrew released
for free by its author**, a **freely distributable shareware episode**, or an arcade ROM set
**released by its rights holder for free, non-commercial use**. Nothing here is a commercial
ROM. If you are an author and want a title removed or its credit corrected, open an issue.

| System | Game | Author / rights holder | Year | Licence / terms | Obtained from |
|---|---|---|---|---|---|
| NES | 2048 | tsone | 2014 | MIT | github.com/tsone/2048-nes |
| NES | Nova the Squirrel | NovaSquirrel | 2018 | GPL-3.0 (code) · CC BY-NC-SA 4.0 (assets) | RetroArch content server / github.com/NovaSquirrel/NovaTheSquirrel |
| NES | Alter Ego | Shiru | 2011 | Freeware (author's site) | RetroArch content server |
| NES | Spacegulls | Morphcat Games | 2021 | Freeware | RetroArch content server |
| SNES | Super Boss Gaiden | Dieter von Laser / Chilly Willy | 2015 | Freeware homebrew | RetroArch content server |
| SNES | N-Warp Daisakusen | d4s | 2008 | Freeware homebrew | RetroArch content server |
| N64 | Kumi-Daiko Beatoff 64 | Team Riistahillo (N64brew Game Jam 2020) | 2020 | CC0 1.0 | github.com/N64brew-Game-Jam-2020/Kumi-Daiko-Beatoff-64 · zhamul.itch.io |
| GB | Tobu Tobu Girl | Tangram Games | 2017 | MIT (code) · CC BY 4.0 (assets) | RetroArch content server |
| GB | Deadeus | -IZMA- | 2019 | Freeware | RetroArch content server |
| GBA | Celeste Classic | Maddy Thorson & Noel Berry · port JeffRuLz | 2020 | Free (original PICO-8 release), port open source | RetroArch content server |
| Genesis | Cave Story MD | Studio Pixel · port andwn | 2019 | MIT (port) · freeware original | RetroArch content server |
| Genesis | Ultimate Tetris | Haroldo O. Pinheiro | 2021 | Freeware / open source | RetroArch content server |
| Genesis | Break An Egg | Studio Vetea | 2017 | Freeware | RetroArch content server |
| Master System | 6-Button Controller Test | Charles MacDonald | 2000 | Public domain | RetroArch content server |
| Game Gear | Button Test | libretro | 2019 | Public domain | RetroArch content server |
| Atari 2600 | Sheep It Up! | Dr. Ludos | 2017 | Freeware (open source) | RetroArch content server |
| WonderSwan | Swan Driving | Sebastian Mihai | 2012 | Freeware | RetroArch content server |
| PC Engine | 240p Test Suite (HuCard) | Artemio Urbina | 2013 | GPLv2 | RetroArch content server |
| Lynx | Handy Rogue | james7780 | 2024 | Open source (GitHub) | github.com/james7780/Handy-Rogue |
| Jaguar | BlueRetro Jaguar Pad Test | Jacques Gagnon (darthcloud) | 2021 | Apache-2.0 | github.com/darthcloud/AtariJaguarPadtest (release v1.0) |
| Neo Geo Pocket | Asteroids neo | Steven MacDonald (studioNOTsnk) | 2026 | MIT | github.com/underscore42/ngpc-asteroids-neo |
| PlayStation | PSX Test Program | libretro | 2019 | Open source | RetroArch content server |
| PSP | Cube Test | PPSSPP project | 2019 | Open source | RetroArch content server |
| Saturn | Saturn demo (cue/iso/bin) | Yabause project | 2012 | GPL | RetroArch content server |
| Arcade (FBNeo) | Alien Arena | Duncan Brown | 1985 | Free for home use, by the author | mamedev.org/roms/alienar |
| MAME | Gridlee | Videa (H. Delman, E. Rotberg, R. Hector) | 1982 | Free non-commercial use | mamedev.org/roms |
| MAME | Robby Roto | Bally/Midway (Jamie Fenton) | 1981 | Free non-commercial use | mamedev.org/roms |
| MAME | Circus, Car Polo, Side Trak, Rip Cord, Fire One!, Star Fire, Targ, Spectar | Exidy (H.R. Kauffman) | 1977–1980 | Free non-commercial use | mamedev.org/roms |
| MAME | Super Tank | Video Games GmbH | 1981 | Free non-commercial use | mamedev.org/roms |
| DOS | Commander Keen 4 (shareware ep.) | id Software / Apogee | 1991 | Freely distributable shareware episode (a `dosbox.conf` auto-start file was added) | RetroArch content server |
| DOS | Wolfenstein 3D (shareware ep.) | id Software / Apogee | 1992 | Freely distributable shareware episode (a `dosbox.conf` auto-start file was added) | RetroArch content server |

The mamedev.org ROMs carry the note that they are approved for free distribution on
mamedev.org; they are included here strictly for personal, non-commercial use, unchanged,
with this credit. If you redistribute this app commercially you must remove them.

Systems without a bundled game (NDS, Atari 5200/7800, Sega CD, C64, Amiga): no clearly
licensed free title was found at build time — add your own files with **ADD GAMES**.

## Compatibility notes (why some titles were swapped)

* **N64** — ROMs built with modern *libdragon* (e.g. Flappy Bird 64) need a low-level-accurate emulator (ares) and crash
  mupen64plus-next in WASM. Kumi-Daiko Beatoff 64 is built with libultra and runs fine.
* **Jaguar** — the Virtual Jaguar core only produces video when its built-in BIOS boot is enabled; the app sets
  `virtualjaguar_bios = enabled` for every Jaguar game. Even so, most homebrew we tried (jag2048, JagTris, Do The Same)
  shows the BIOS boot animation and then a black screen with this 2025-06 WASM build of the core; the JagStudio-built
  pad test is the one open-source binary that keeps rendering, so it is bundled as the Jaguar sample. Commercial-style
  `.j64` cartridge dumps you add yourself run normally.
* **PC Engine** — the "Flappy Bird" pack on the content server is a SuperGrafx (`.sgx`) build that Mednafen-PCE shows black;
  the 240p Test Suite HuCard exercises the core properly.
* **MAME** — Looping and Victory (also free on mamedev.org) render a black / solid-magenta screen in the MAME 2003-Plus WASM
  build, so they were replaced by Side Trak and Star Fire. The MAME copyright/known-problems disclaimers are skipped via
  core options; ROM zips must keep their exact romset name (`circus.zip` …).
* **DOS** — DOSBox Pure receives the extracted game folder; a tiny `dosbox.conf` with `mount c .` + the game EXE was added so
  both games auto-start instead of dropping to the `Z:\>` prompt.
