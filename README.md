# MicUp Player

A 100% clean-room, browser-based professional karaoke player and live stage engine for KJs and venue hosts.

Runs directly inside Chromium browsers (Google Chrome, Microsoft Edge) with zero installation, zero server costs, and client-side privacy.

## Features

- **CD+G Canvas Renderer:** Clean-room implementation of the Philips/Sony Red Book Subcode Graphic Specification (1987) with keyframe seeking, 300x216 16-color palette decoding, and tile XOR support.
- **Real-Time Pitch Shifting:** Web Audio API `AudioWorkletProcessor` providing -12 to +12 semitones of time-domain pitch transposition without tempo alteration.
- **Local File System Access:** Reads local or external hard drives directly via `showDirectoryPicker()`, with directory handles persisted across page reloads in IndexedDB.
- **In-Memory ZIP Unpacking:** Uses `fflate` for fast, zero-dependency client-side extraction of `.cdg` + `.mp3` archives.
- **Dual Screen / TV Stage Display:** Broadcasts clean, borderless lyrics and singer callouts to a second monitor, projector, or TV window via `BroadcastChannel` (`stage.html`).
- **Atmosphere & Sound FX Pads:** 6 hot sound pads (Applause, Air Horn, Drum Roll, Rimshot, Laugh, Scratch) with synthesized Web Audio fallbacks and keyboard shortcuts `1`–`6`.
- **MicUp.live Cloud Ready:** Built to sync incoming mobile singer requests and remembered pitch transpositions directly into the live rotation queue.

## Tech Stack

- **Framework:** Vite + Preact (`@preact/signals` for reactive state)
- **Styling:** Vanilla CSS with the *Stage Obsidian & Neon Spotlight* design tokens
- **Testing:** Native `node:test` and `node:assert/strict` test runner

## Development & Testing

```bash
# Install dependencies
mise exec -- npm install

# Run the TDD test suite
mise exec -- npm test

# Start the dev server (Host on :3001, Stage TV on :3001/stage.html)
mise exec -- npm run dev

# Build for production
mise exec -- npm run build
```
