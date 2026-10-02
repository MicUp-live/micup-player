/**
 * Media Loader for MicUp Player
 * 
 * Extracts ZIP files (CDG + MP3) client-side using fflate,
 * loads MP4/WebM video files, and parses artist/title metadata from filenames.
 */

import * as fflate from 'fflate';

export class MediaLoader {
  constructor() {
    this.activeObjectUrls = new Set();
  }

  /**
   * Release all created Object URLs to prevent browser memory leaks
   */
  cleanup() {
    for (const url of this.activeObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
    this.activeObjectUrls.clear();
  }

  /**
   * Parse Song Info (Code, Artist, Title) from filename
   * Supports:
   *  "SC8812 - Bon Jovi - Livin On A Prayer.zip" -> code: "SC8812", artist: "Bon Jovi", title: "Livin On A Prayer"
   *  "Queen - Bohemian Rhapsody.mp4" -> artist: "Queen", title: "Bohemian Rhapsody"
   *  "Adele - Rolling In The Deep (Karaoke Version).zip"
   */
  static parseFilename(filename) {
    // Strip file extension
    const base = filename.replace(/\.[^/.]+$/, '').trim();
    
    // Split by hyphen with at least one surrounding whitespace (e.g. " - ")
    // This preserves hyphenated names like "Blink-182" and "Jay-Z"
    let parts = base.split(/\s+-\s+/);
    if (parts.length === 1) {
      // Fallback: check for underscore delimiter " _ "
      parts = base.split(/\s+_\s+/);
    }

    if (parts.length >= 3) {
      // DiscCode - Artist - Title
      // Check if parts[0] looks like a disc code (e.g. alphanumeric without spaces, usually <= 12 chars)
      const isCode = /^[A-Za-z0-9_-]{2,12}$/.test(parts[0].trim());
      if (isCode) {
        return {
          code: parts[0].trim(),
          artist: parts[1].trim(),
          title: parts.slice(2).join(' - ').trim(),
          filename
        };
      } else {
        // e.g. Artist - Album - Title
        return {
          code: '',
          artist: parts[0].trim(),
          title: parts.slice(1).join(' - ').trim(),
          filename
        };
      }
    } else if (parts.length === 2) {
      // Artist - Title
      return {
        code: '',
        artist: parts[0].trim(),
        title: parts[1].trim(),
        filename
      };
    } else {
      return {
        code: '',
        artist: 'Unknown Artist',
        title: base,
        filename
      };
    }
  }

  /**
   * Load a File object and extract playable assets
   * Returns: { type: 'cdg'|'video', audioUrl?, videoUrl?, cdgData?, artist, title, code }
   */
  async loadFile(file) {
    const filename = file.name;
    const metadata = MediaLoader.parseFilename(filename);
    const ext = filename.split('.').pop().toLowerCase();

    // 1. ZIP File (.zip, .cdg.zip)
    if (ext === 'zip') {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      
      const unzipped = await new Promise((resolve, reject) => {
        fflate.unzip(uint8, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      let cdgData = null;
      let audioBlob = null;

      for (const [entryName, entryBytes] of Object.entries(unzipped)) {
        const lowerName = entryName.toLowerCase();
        if (lowerName.endsWith('.cdg')) {
          cdgData = entryBytes;
        } else if (lowerName.endsWith('.mp3') || lowerName.endsWith('.m4a') || lowerName.endsWith('.wav') || lowerName.endsWith('.ogg')) {
          const mime = lowerName.endsWith('.mp3') ? 'audio/mpeg' :
                       lowerName.endsWith('.m4a') ? 'audio/mp4' :
                       lowerName.endsWith('.ogg') ? 'audio/ogg' : 'audio/wav';
          audioBlob = new Blob([entryBytes], { type: mime });
        }
      }

      if (!cdgData && !audioBlob) {
        throw new Error('No .cdg or audio file found inside the ZIP archive.');
      }

      let audioUrl = null;
      if (audioBlob) {
        audioUrl = URL.createObjectURL(audioBlob);
        this.activeObjectUrls.add(audioUrl);
      }

      return {
        type: 'cdg',
        audioUrl,
        cdgData,
        ...metadata,
        file
      };
    }

    // 2. MP4 / WebM Video File
    if (['mp4', 'm4v', 'webm', 'mov'].includes(ext)) {
      const videoUrl = URL.createObjectURL(file);
      this.activeObjectUrls.add(videoUrl);

      return {
        type: 'video',
        videoUrl,
        ...metadata,
        file
      };
    }

    // 3. Standalone MP3/Audio
    if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) {
      const audioUrl = URL.createObjectURL(file);
      this.activeObjectUrls.add(audioUrl);

      return {
        type: 'audio',
        audioUrl,
        ...metadata,
        file
      };
    }

    throw new Error(`Unsupported format (.${ext}). Supported formats: .zip (MP3+G), .mp4, .webm, .mp3`);
  }
}

export const mediaLoader = new MediaLoader();
