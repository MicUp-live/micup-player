# MicUp Player 🎤

[![Deploy to GitHub Pages](https://github.com/MicUp-live/micup-player/actions/workflows/deploy.yml/badge.svg)](https://github.com/MicUp-live/micup-player/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A 100% clean-room, browser-based professional karaoke player and live stage engine for KJs, venue hosts, and house parties.

Runs directly inside modern browsers with zero installation, zero server costs, and total client-side privacy.

## Features

- **CD+G Canvas Renderer:** Clean-room implementation of the Philips/Sony Red Book Subcode Graphic Specification (1987) with keyframe seeking, 300x216 16-color palette decoding, and tile XOR support.
- **Real-Time Pitch Shifting:** Web Audio API `AudioWorkletProcessor` providing -12 to +12 semitones of time-domain pitch transposition without tempo alteration.
- **YouTube Karaoke Search & Playout:** Integrated YouTube Karaoke search client and seamless embedded video playout directly inside the stage monitor.
- **Local File System Access:** Reads local or external hard drives directly via `showDirectoryPicker()`, with directory handles persisted across page reloads in IndexedDB.
- **In-Memory ZIP Unpacking:** Uses `fflate` for fast, zero-dependency client-side extraction of `.cdg` + `.mp3` archives.
- **Dual Screen / TV Stage Display:** Broadcasts clean, borderless lyrics and singer callouts to a second monitor, projector, or TV window via `BroadcastChannel` (`stage.html`).
- **Atmosphere & Sound FX Pads:** 6 hot sound pads (Applause, Air Horn, Drum Roll, Rimshot, Laugh, Scratch) with synthesized Web Audio sound generation and keyboard shortcuts `1`–`6`.
- **MicUp.live Cloud Sync:** Connects to `micup.live` shows to automatically pull singer requests and remembered pitch preferences into the live rotation queue.
- **P2P House Party Mode:** Direct peer-to-peer mobile queueing for living room and house party guests, powered by the MPL-2.0 licensed **VDO.Ninja SDK** over WebRTC DataChannels.

## Tech Stack & Architecture

- **Core Framework:** Vite + Preact (`@preact/signals` for high-frequency reactive state)
- **Styling:** Vanilla CSS using the *Stage Obsidian & Neon Spotlight* design tokens
- **Testing:** Native Node.js `node:test` and `node:assert/strict` test runner (sub-100ms execution)
- **Audio Processing:** W3C Web Audio API + custom dual-delay pitch shifter `AudioWorklet`
- **P2P Networking:** WebRTC DataChannels + VDO.Ninja SDK (MPL-2.0)

## Getting Started

```bash
# Install dependencies
mise exec -- npm install

# Run the automated TDD test suite
mise exec -- npm test

# Start the local development server (Host console on :3001, Stage TV on :3001/stage.html)
mise exec -- npm run dev

# Build the production static site bundle
mise exec -- npm run build
```

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details. Commercial KJs, hobbyists, and party hosts are 100% free to use and adapt this software.
