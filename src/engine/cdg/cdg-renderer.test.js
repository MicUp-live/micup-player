import test from 'node:test';
import assert from 'node:assert/strict';
import { CDGRenderer, CDG_WIDTH, CDG_HEIGHT, CDG_PACKET_SIZE } from './cdg-renderer.js';

/**
 * Helper to construct a synthetic 24-byte CD+G packet
 */
function createCDGPacket(instruction, dataBytes = []) {
  const packet = new Uint8Array(CDG_PACKET_SIZE);
  packet[0] = 0x09; // CDG Command (0x09)
  packet[1] = instruction & 0x3F; // Instruction
  // Bytes 2-3 are parity/q
  // Bytes 4-19 are 16 bytes of data
  for (let i = 0; i < 16 && i < dataBytes.length; i++) {
    packet[4 + i] = dataBytes[i] & 0x3F;
  }
  return packet;
}

test('CDGRenderer initializes with 300x216 pixels and default palette', () => {
  const renderer = new CDGRenderer(null);
  assert.equal(renderer.pixels.length, CDG_WIDTH * CDG_HEIGHT);
  assert.equal(renderer.palette.length, 16 * 4);
  assert.equal(renderer.borderColor, 0);

  // All initial pixels should be 0
  assert.equal(renderer.pixels[0], 0);
  assert.equal(renderer.pixels[1000], 0);
});

test('CDGRenderer Memory Preset fills pixel buffer with color when repeat is 0', () => {
  const renderer = new CDGRenderer(null);

  // CDG_INST_MEMORY_PRESET = 1. Data: [color, repeat]
  const color = 5;
  const repeat = 0;
  const packet = createCDGPacket(1, [color, repeat]);

  renderer.loadData(packet);
  renderer.syncToTime(1 / 300);

  // All pixels should now be color 5
  assert.equal(renderer.pixels[0], 5);
  assert.equal(renderer.pixels[CDG_WIDTH * CDG_HEIGHT - 1], 5);
});

test('CDGRenderer Border Preset paints borders and sets borderColor', () => {
  const renderer = new CDGRenderer(null);

  // Memory Preset to set background to 1
  const clearPacket = createCDGPacket(1, [1, 0]);
  // Border Preset = 2. Data: [color]
  const borderPacket = createCDGPacket(2, [7]);

  const combined = new Uint8Array(48);
  combined.set(clearPacket, 0);
  combined.set(borderPacket, 24);

  renderer.loadData(combined);
  renderer.syncToTime(2 / 300);

  assert.equal(renderer.borderColor, 7);

  // Top border pixel (y = 5, x = 50) should be border color 7
  assert.equal(renderer.pixels[5 * CDG_WIDTH + 50], 7);
  // Left border pixel (y = 50, x = 2) should be border color 7
  assert.equal(renderer.pixels[50 * CDG_WIDTH + 2], 7);
  // Active area center pixel (y = 100, x = 150) should remain clear color 1
  assert.equal(renderer.pixels[100 * CDG_WIDTH + 150], 1);
});

test('CDGRenderer Load Color Table decodes 12-bit RGB into 8-bit RGBA palette', () => {
  const renderer = new CDGRenderer(null);

  // Load Color Table 0-7 (instruction 30)
  // Color 0: Red 15, Green 0, Blue 0 -> High byte: (15 << 2) = 0x3C, Low byte: 0x00
  // Color 1: Red 0, Green 15, Blue 15 -> High byte: 0x03, Low byte: ((3 << 4) | 15) & 0x3F = 0x3F
  const data = [
    0x3C, 0x00, // color 0
    0x03, 0x3F  // color 1
  ];
  const packet = createCDGPacket(30, data);

  renderer.loadData(packet);
  renderer.syncToTime(1 / 300);

  // Color 0 should be Red: (15 * 17 = 255), Green: 0, Blue: 0, Alpha: 255
  assert.equal(renderer.palette[0], 255); // R
  assert.equal(renderer.palette[1], 0);   // G
  assert.equal(renderer.palette[2], 0);   // B
  assert.equal(renderer.palette[3], 255); // A

  // Color 1 should be Cyan: Red: 0, Green: (15 * 17 = 255), Blue: (15 * 17 = 255)
  assert.equal(renderer.palette[4], 0);   // R
  assert.equal(renderer.palette[5], 255); // G
  assert.equal(renderer.palette[6], 255); // B
  assert.equal(renderer.palette[7], 255); // A
});

test('CDGRenderer Tile Block Normal renders a 6x12 pixel block', () => {
  const renderer = new CDGRenderer(null);

  // Tile Block (inst = 6)
  // color0 = 2, color1 = 4, row = 1 (y = 12), col = 2 (x = 12)
  // Lines 0-11: 0x3F (all 6 bits set = color1 for all lines)
  const data = [2, 4, 1, 2, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F, 0x3F];
  const packet = createCDGPacket(6, data);

  renderer.loadData(packet);
  renderer.syncToTime(1 / 300);

  // Check top-left pixel of tile (row 1 * 12 = 12, col 2 * 6 = 12)
  const pixelIndex = 12 * CDG_WIDTH + 12;
  assert.equal(renderer.pixels[pixelIndex], 4);
  assert.equal(renderer.pixels[pixelIndex + 5], 4);
  // Outside tile should still be 0
  assert.equal(renderer.pixels[11 * CDG_WIDTH + 12], 0);
});

test('CDGRenderer Tile Block XOR inverts pixels according to bitmask', () => {
  const renderer = new CDGRenderer(null);

  // First, set background to color 3 using Memory Preset
  const clearPacket = createCDGPacket(1, [3, 0]);

  // Tile Block XOR (inst = 38)
  // color0 = 0, color1 = 5, row = 1, col = 2
  // Line 0: 0x3F (all bits 1 -> XOR with color1 = 5)
  // 3 ^ 5 = 6
  const data = [0, 5, 1, 2, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const xorPacket = createCDGPacket(38, data);

  const combined = new Uint8Array(48);
  combined.set(clearPacket, 0);
  combined.set(xorPacket, 24);

  renderer.loadData(combined);
  renderer.syncToTime(2 / 300);

  const pixelIndex = 12 * CDG_WIDTH + 12;
  assert.equal(renderer.pixels[pixelIndex], 3 ^ 5); // 6
});

test('CDGRenderer keyframe seeking restores state accurately when seeking backwards', () => {
  const renderer = new CDGRenderer(null);
  renderer.keyframeInterval = 2; // Snapshot every 2 packets for test

  // Packet 0: Clear screen to 1
  const p0 = createCDGPacket(1, [1, 0]);
  // Packet 1: Clear screen to 2
  const p1 = createCDGPacket(1, [2, 0]);
  // Packet 2: Clear screen to 3
  const p2 = createCDGPacket(1, [3, 0]);
  // Packet 3: Clear screen to 4
  const p3 = createCDGPacket(1, [4, 0]);

  const stream = new Uint8Array(24 * 4);
  stream.set(p0, 0);
  stream.set(p1, 24);
  stream.set(p2, 48);
  stream.set(p3, 72);

  renderer.loadData(stream);

  // Advance to end (time = 4 / 300)
  renderer.syncToTime(4 / 300);
  assert.equal(renderer.pixels[0], 4);

  // Seek backward to time = 1 / 300 (Packet 0 executed)
  renderer.seek(1 / 300);
  assert.equal(renderer.pixels[0], 1);

  // Seek forward to time = 3 / 300 (Packet 2 executed)
  renderer.seek(3 / 300);
  assert.equal(renderer.pixels[0], 3);
});
