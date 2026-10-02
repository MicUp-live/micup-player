/**
 * Clean-Room CD+G (Compact Disc + Graphics) Parser and Canvas Renderer
 * 
 * Implements the Philips/Sony Red Book Subcode Graphic Specification (1987).
 * CD+G streams run at 300 packets/second (7.2 KB/s).
 * Total screen resolution: 300 x 216 pixels.
 * Active visible area: 288 x 192 pixels (12px top/bottom border, 6px left/right border).
 * 16-color indexed palette. 6x12 pixel character tiles.
 */

export const CDG_WIDTH = 300;
export const CDG_HEIGHT = 216;
export const CDG_PACKET_SIZE = 24;
export const CDG_PACKETS_PER_SEC = 300;

// Command and Instruction codes
const CDG_COMMAND = 0x09;
const CDG_INST_MEMORY_PRESET = 1;
const CDG_INST_BORDER_PRESET = 2;
const CDG_INST_TILE_BLOCK = 6;
const CDG_INST_SCROLL_PRESET = 20;
const CDG_INST_SCROLL_COPY = 24;
const CDG_INST_DEF_TRANSPARENT_COL = 28;
const CDG_INST_LOAD_COL_TBL_0_7 = 30;
const CDG_INST_LOAD_COL_TBL_8_15 = 31;
const CDG_INST_TILE_BLOCK_XOR = 38;

export class CDGRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    
    // Pixel buffer: 300 x 216 indexed colors (0-15)
    this.pixels = new Uint8Array(CDG_WIDTH * CDG_HEIGHT);
    // 16-color palette: [r, g, b, a] for each index
    this.palette = new Uint8Array(16 * 4);
    // RGBA image data for fast canvas blitting
    this.imageData = this.ctx ? this.ctx.createImageData(CDG_WIDTH, CDG_HEIGHT) : null;
    this.rgba = this.imageData ? this.imageData.data : new Uint8ClampedArray(CDG_WIDTH * CDG_HEIGHT * 4);
    
    this.borderColor = 0;
    this.transparentColor = -1;
    this.hOffset = 0;
    this.vOffset = 0;

    // CDG file data buffer
    this.packetData = null;
    this.totalPackets = 0;
    this.currentPacketIndex = 0;

    // Keyframes for instant seeking (snapshot every 5 seconds = 1500 packets)
    this.keyframes = [];
    this.keyframeInterval = 1500;

    this.reset();
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    if (canvas) {
      this.ctx = canvas.getContext('2d', { willReadFrequently: true });
      this.imageData = this.ctx.createImageData(CDG_WIDTH, CDG_HEIGHT);
      this.rgba = this.imageData.data;
      this.renderToCanvas();
    }
  }

  reset() {
    this.pixels.fill(0);
    this.palette.fill(0);
    // Default alpha to 255 for all colors
    for (let i = 0; i < 16; i++) {
      this.palette[i * 4 + 3] = 255;
    }
    this.borderColor = 0;
    this.transparentColor = -1;
    this.hOffset = 0;
    this.vOffset = 0;
    this.currentPacketIndex = 0;
    this.updateRGBA();
  }

  /**
   * Load raw .cdg file ArrayBuffer or Uint8Array
   */
  loadData(buffer) {
    const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.packetData = raw;
    this.totalPackets = Math.floor(raw.length / CDG_PACKET_SIZE);
    this.currentPacketIndex = 0;
    this.keyframes = [];

    this.reset();
    this.buildKeyframes();
    this.renderToCanvas();
  }

  /**
   * Precompute keyframe snapshots across the song so seeking is instant
   */
  buildKeyframes() {
    if (!this.packetData || this.totalPackets === 0) return;

    // Save initial state at 0
    this.keyframes = [{
      packetIndex: 0,
      pixels: new Uint8Array(this.pixels),
      palette: new Uint8Array(this.palette),
      borderColor: this.borderColor,
      hOffset: this.hOffset,
      vOffset: this.vOffset
    }];

    // Simulate playback to capture snapshots
    const tempPixels = new Uint8Array(this.pixels);
    const tempPalette = new Uint8Array(this.palette);
    let border = this.borderColor;
    let hOff = this.hOffset;
    let vOff = this.vOffset;

    for (let p = 0; p < this.totalPackets; p++) {
      this.processPacket(p, tempPixels, tempPalette, (b) => { border = b; }, (h, v) => { hOff = h; vOff = v; });

      if ((p + 1) % this.keyframeInterval === 0) {
        this.keyframes.push({
          packetIndex: p + 1,
          pixels: new Uint8Array(tempPixels),
          palette: new Uint8Array(tempPalette),
          borderColor: border,
          hOffset: hOff,
          vOffset: vOff
        });
      }
    }
  }

  /**
   * Seek to timestamp in seconds
   */
  seek(timeInSeconds) {
    if (!this.packetData) return;

    const targetPacket = Math.min(
      Math.floor(timeInSeconds * CDG_PACKETS_PER_SEC),
      this.totalPackets
    );

    // Find the closest preceding keyframe
    let kf = this.keyframes[0];
    for (let i = this.keyframes.length - 1; i >= 0; i--) {
      if (this.keyframes[i].packetIndex <= targetPacket) {
        kf = this.keyframes[i];
        break;
      }
    }

    // Restore keyframe state
    if (kf) {
      this.pixels.set(kf.pixels);
      this.palette.set(kf.palette);
      this.borderColor = kf.borderColor;
      this.hOffset = kf.hOffset;
      this.vOffset = kf.vOffset;
      this.currentPacketIndex = kf.packetIndex;
    } else {
      this.reset();
    }

    // Fast-forward from keyframe to target packet
    while (this.currentPacketIndex < targetPacket) {
      this.processPacket(
        this.currentPacketIndex,
        this.pixels,
        this.palette,
        (b) => { this.borderColor = b; },
        (h, v) => { this.hOffset = h; this.vOffset = v; }
      );
      this.currentPacketIndex++;
    }

    this.updateRGBA();
    this.renderToCanvas();
  }

  /**
   * Advance playback to match audio time
   */
  syncToTime(timeInSeconds) {
    if (!this.packetData) return;
    const targetPacket = Math.min(
      Math.floor(timeInSeconds * CDG_PACKETS_PER_SEC),
      this.totalPackets
    );

    // If seeking backwards or jumping forward > 2 seconds, use seek()
    if (targetPacket < this.currentPacketIndex || (targetPacket - this.currentPacketIndex) > 600) {
      this.seek(timeInSeconds);
      return;
    }

    let modified = false;
    while (this.currentPacketIndex < targetPacket) {
      this.processPacket(
        this.currentPacketIndex,
        this.pixels,
        this.palette,
        (b) => { this.borderColor = b; },
        (h, v) => { this.hOffset = h; this.vOffset = v; }
      );
      this.currentPacketIndex++;
      modified = true;
    }

    if (modified) {
      this.updateRGBA();
      this.renderToCanvas();
    }
  }

  /**
   * Process a single 24-byte packet
   */
  processPacket(pktIndex, pixels, palette, onBorder, onOffset) {
    const offset = pktIndex * CDG_PACKET_SIZE;
    const cmd = this.packetData[offset] & 0x3F;
    if (cmd !== CDG_COMMAND) return;

    const inst = this.packetData[offset + 1] & 0x3F;
    const dataOffset = offset + 4; // 16 bytes of data

    switch (inst) {
      case CDG_INST_MEMORY_PRESET: {
        const color = this.packetData[dataOffset] & 0x0F;
        const repeat = this.packetData[dataOffset + 1] & 0x0F;
        if (repeat === 0) {
          pixels.fill(color);
        }
        break;
      }

      case CDG_INST_BORDER_PRESET: {
        const color = this.packetData[dataOffset] & 0x0F;
        onBorder(color);
        // Paint 12px top/bottom and 6px left/right borders
        for (let y = 0; y < CDG_HEIGHT; y++) {
          const isVertBorder = (y < 12 || y >= 204);
          for (let x = 0; x < CDG_WIDTH; x++) {
            if (isVertBorder || x < 6 || x >= 294) {
              pixels[y * CDG_WIDTH + x] = color;
            }
          }
        }
        break;
      }

      case CDG_INST_LOAD_COL_TBL_0_7:
      case CDG_INST_LOAD_COL_TBL_8_15: {
        const startIndex = (inst === CDG_INST_LOAD_COL_TBL_0_7) ? 0 : 8;
        for (let i = 0; i < 8; i++) {
          const byte0 = this.packetData[dataOffset + i * 2] & 0x3F;
          const byte1 = this.packetData[dataOffset + i * 2 + 1] & 0x3F;

          const r = ((byte0 >> 2) & 0x0F) * 17;
          const g = (((byte0 & 0x03) << 2) | ((byte1 >> 4) & 0x03)) * 17;
          const b = (byte1 & 0x0F) * 17;

          const palIdx = (startIndex + i) * 4;
          palette[palIdx] = r;
          palette[palIdx + 1] = g;
          palette[palIdx + 2] = b;
          palette[palIdx + 3] = 255;
        }
        break;
      }

      case CDG_INST_TILE_BLOCK:
      case CDG_INST_TILE_BLOCK_XOR: {
        const isXOR = (inst === CDG_INST_TILE_BLOCK_XOR);
        const color0 = this.packetData[dataOffset] & 0x0F;
        const color1 = this.packetData[dataOffset + 1] & 0x0F;
        const row = this.packetData[dataOffset + 2] & 0x1F;
        const col = this.packetData[dataOffset + 3] & 0x3F;

        if (row >= 18 || col >= 50) break; // Out of bounds safety

        const topY = row * 12;
        const leftX = col * 6;

        for (let line = 0; line < 12; line++) {
          const tileByte = this.packetData[dataOffset + 4 + line] & 0x3F;
          const y = topY + line;
          if (y >= CDG_HEIGHT) break;

          const rowOffset = y * CDG_WIDTH;
          for (let bit = 0; bit < 6; bit++) {
            const x = leftX + bit;
            if (x >= CDG_WIDTH) break;

            const isBitSet = (tileByte & (1 << (5 - bit))) !== 0;
            const pixelIndex = rowOffset + x;

            if (isXOR) {
              const currentColor = pixels[pixelIndex];
              const targetColor = isBitSet ? color1 : color0;
              pixels[pixelIndex] = currentColor ^ targetColor;
            } else {
              pixels[pixelIndex] = isBitSet ? color1 : color0;
            }
          }
        }
        break;
      }

      case CDG_INST_SCROLL_PRESET:
      case CDG_INST_SCROLL_COPY: {
        const color = this.packetData[dataOffset] & 0x0F;
        const hCmd = this.packetData[dataOffset + 1] & 0x3F;
        const vCmd = this.packetData[dataOffset + 2] & 0x3F;

        const hShift = (hCmd & 0x0F);
        const vShift = (vCmd & 0x0F);
        onOffset(hShift, vShift);

        // Simple scroll copy
        const copy = (inst === CDG_INST_SCROLL_COPY);
        // Horizontal direction: 0 = none, 1 = right 6px, 2 = left 6px
        const hDir = (hCmd >> 4) & 0x03;
        // Vertical direction: 0 = none, 1 = down 12px, 2 = up 12px
        const vDir = (vCmd >> 4) & 0x03;

        let dx = 0;
        let dy = 0;
        if (hDir === 1) dx = 6;
        else if (hDir === 2) dx = -6;

        if (vDir === 1) dy = 12;
        else if (vDir === 2) dy = -12;

        if (dx !== 0 || dy !== 0) {
          const temp = new Uint8Array(pixels);
          for (let y = 0; y < CDG_HEIGHT; y++) {
            for (let x = 0; x < CDG_WIDTH; x++) {
              const srcX = x - dx;
              const srcY = y - dy;
              const destIdx = y * CDG_WIDTH + x;

              if (srcX >= 0 && srcX < CDG_WIDTH && srcY >= 0 && srcY < CDG_HEIGHT) {
                pixels[destIdx] = temp[srcY * CDG_WIDTH + srcX];
              } else if (copy) {
                // Wrap around
                const wrapX = (srcX + CDG_WIDTH) % CDG_WIDTH;
                const wrapY = (srcY + CDG_HEIGHT) % CDG_HEIGHT;
                pixels[destIdx] = temp[wrapY * CDG_WIDTH + wrapX];
              } else {
                pixels[destIdx] = color;
              }
            }
          }
        }
        break;
      }

      case CDG_INST_DEF_TRANSPARENT_COL: {
        this.transparentColor = this.packetData[dataOffset] & 0x0F;
        break;
      }
    }
  }

  /**
   * Convert indexed pixels + palette to RGBA
   */
  updateRGBA() {
    const len = CDG_WIDTH * CDG_HEIGHT;
    for (let i = 0; i < len; i++) {
      const colIdx = this.pixels[i] * 4;
      const rgbaIdx = i * 4;
      this.rgba[rgbaIdx] = this.palette[colIdx];
      this.rgba[rgbaIdx + 1] = this.palette[colIdx + 1];
      this.rgba[rgbaIdx + 2] = this.palette[colIdx + 2];
      this.rgba[rgbaIdx + 3] = (this.pixels[i] === this.transparentColor) ? 0 : 255;
    }
  }

  /**
   * Draw current frame to canvas
   */
  renderToCanvas() {
    if (!this.ctx || !this.imageData) return;
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
