# MicUp Player 🎤

[![Deploy to GitHub Pages](https://github.com/MicUp-live/micup-player/actions/workflows/deploy.yml/badge.svg)](https://github.com/MicUp-live/micup-player/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A 100% clean-room, browser-based professional karaoke player and live stage engine for KJs, venue hosts, and house parties.

Runs directly inside modern browsers with zero installation, zero mandatory backend servers, and local-first execution.

## Features

- **CD+G Canvas Renderer:** Clean-room implementation of the Philips/Sony Red Book Subcode Graphic Specification (1987) with keyframe seeking, 300x216 16-color palette decoding, and tile XOR support.
- **Real-Time Pitch Shifting:** Web Audio API `AudioWorkletProcessor` providing -12 to +12 semitones of time-domain pitch transposition without tempo alteration.
- **YouTube Karaoke Search & Playout:** Integrated YouTube Karaoke search client and seamless embedded video playout directly inside the stage monitor.
- **Local Media Playback:** Support for zipped or loose `.cdg` + `.mp3` pairs, standalone audio files, and local videos (`.mp4`, `.webm`) with automatic track progression and object URL lifecycle cleanup.
- **Local File System Access:** Reads local or external hard drives directly via `showDirectoryPicker()`, with directory handles persisted across page reloads in IndexedDB.
- **In-Memory ZIP Unpacking:** Uses `fflate` for fast, zero-dependency client-side extraction of `.cdg` + `.mp3` archives.
- **Dual Screen / TV Stage Display:** Broadcasts clean, borderless lyrics and singer callouts to a second monitor, projector, or TV window via `BroadcastChannel` (`stage.html`), coordinating synchronized media playback between host and stage windows.
- **Atmosphere & Sound FX Pads:** 6 hot sound pads (Applause, Air Horn, Drum Roll, Rimshot, Laugh, Scratch) with synthesized Web Audio sound generation and keyboard shortcuts `1`–`6`.
- **Mobile Party Mode:** Mobile guest queueing and sound triggers over MQTT WebSockets (HiveMQ / EMQX WSS), featuring host-side peer admission verification, duplicate prevention, and request throttling.

## Planned / Roadmap

- **MicUp.live Cloud Sync:** Integration with `micup.live` cloud backend to automatically pull singer requests and remembered pitch preferences across venues.
- **Direct WebRTC P2P DataChannels:** Alternative direct peer-to-peer transport for environments where external MQTT WSS brokers are restricted.

## Tech Stack & Architecture

- **Core Framework:** Vite + Preact (`@preact/signals` for high-frequency reactive state)
- **Styling:** Vanilla CSS using the *Stage Obsidian & Neon Spotlight* design tokens
- **Testing:** Native Node.js `node:test` and `node:assert/strict` test runner (sub-2s execution)
- **Audio Processing:** W3C Web Audio API + custom circular-buffer pitch shifter `AudioWorklet`
- **Party Transport:** MQTT over Secure WebSockets (`paho-mqtt`) with host-side membership verification and rate limiting
- **Multi-Window Display:** HTML5 `BroadcastChannel` for zero-latency host-to-stage sync

## Getting Started

```bash
# Install dependencies
npm install

# Start the local development server (Host console on :3001, Stage TV on :3001/stage.html)
npm run dev

# Build the production static site bundle
npm run build
```

## Testing & Verification

```bash
# Run unit and controller integration tests (Node.js test runner)
npm test

# Run browser integration smoke test in headless Chromium
npm run test:browser
```

> [!NOTE]
> `npm run test:browser` is an automated smoke test verifying mounted DOM rendering, canvas initialization, and iframe window-provenance event routing in Chromium. It does not replace live venue verification: actual YouTube video streaming/playback, real-time AudioWorklet pitch-shifting audio quality, hardware audio device routing, and multi-hour show-length reliability still require verification in live rehearsal.

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details. Commercial KJs, hobbyists, and party hosts are 100% free to use and adapt this software.
