/**
 * Local Media Library Indexer using File System Access API & IndexedDB
 * 
 * Scans local or external hard drives for karaoke files (.zip, .mp4, .mp3).
 * Persists directory handles in IndexedDB so folders survive page reloads.
 * Matches incoming cloud requests to local tracks.
 */

import { MediaLoader } from '../media/media-loader.js';

const DB_NAME = 'micup_player_db';
const DB_VERSION = 1;
const STORE_HANDLES = 'handles';

export class LibraryStore {
  constructor() {
    this.tracks = [];
    this.directoryHandle = null;
    this.isScanning = false;
    this.scanProgress = { scanned: 0, found: 0 };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const fn of this.listeners) {
      try { fn(this); } catch (e) {}
    }
  }

  // --- IndexedDB for Directory Handle Persistence ---
  async getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveHandle(handle) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_HANDLES, 'readwrite');
      tx.objectStore(STORE_HANDLES).put(handle, 'karaoke_root');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadSavedHandle() {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_HANDLES, 'readonly');
        const req = tx.objectStore(STORE_HANDLES).get('karaoke_root');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Request user to pick a karaoke folder
   */
  async selectDirectory() {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('Your browser does not support the File System Access API. Please use Google Chrome or Microsoft Edge.');
    }

    const handle = await window.showDirectoryPicker({ mode: 'read' });
    this.directoryHandle = handle;
    await this.saveHandle(handle);
    await this.scanDirectory(handle);
  }

  /**
   * Restore previously connected folder on startup
   */
  async restoreSavedDirectory() {
    const handle = await this.loadSavedHandle();
    if (!handle) return false;

    // Check permission
    const opts = { mode: 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') {
      this.directoryHandle = handle;
      await this.scanDirectory(handle);
      return true;
    }
    return false;
  }

  /**
   * Recursively walk directory and build track index
   */
  async scanDirectory(dirHandle) {
    this.isScanning = true;
    this.tracks = [];
    this.scanProgress = { scanned: 0, found: 0 };
    this.notify();

    const supportedExts = new Set(['zip', 'mp4', 'm4v', 'webm', 'mp3']);

    async function walk(handle, path = '') {
      for await (const [name, entry] of handle.entries()) {
        if (name.startsWith('.')) continue; // skip hidden files

        if (entry.kind === 'directory') {
          await walk(entry, `${path}${name}/`);
        } else if (entry.kind === 'file') {
          const ext = name.split('.').pop().toLowerCase();
          if (supportedExts.has(ext)) {
            const meta = MediaLoader.parseFilename(name);
            results.push({
              id: `${path}${name}`,
              filename: name,
              path: `${path}${name}`,
              handle: entry,
              ...meta
            });
          }
        }
      }
    }

    const results = [];
    try {
      await walk(dirHandle);
      this.tracks = results;
    } catch (err) {
      console.error('Error scanning folder:', err);
    } finally {
      this.isScanning = false;
      this.scanProgress = { scanned: results.length, found: results.length };
      this.notify();
    }
  }

  /**
   * Instant search over indexed library
   */
  search(query, limit = 50) {
    if (!query || !query.trim()) {
      return this.tracks.slice(0, limit);
    }
    const q = query.toLowerCase().trim();
    const hits = [];

    for (const t of this.tracks) {
      if (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.code && t.code.toLowerCase().includes(q))
      ) {
        hits.push(t);
        if (hits.length >= limit) break;
      }
    }
    return hits;
  }

  /**
   * Auto-match a cloud request (artist + title) to a local file handle
   */
  matchRequest(artist, title) {
    const a = artist.toLowerCase().trim();
    const t = title.toLowerCase().trim();

    // 1. Exact match (artist & title)
    for (const track of this.tracks) {
      if (track.artist.toLowerCase() === a && track.title.toLowerCase() === t) {
        return track;
      }
    }

    // 2. Normalized contains match
    for (const track of this.tracks) {
      const trackA = track.artist.toLowerCase();
      const trackT = track.title.toLowerCase();
      if ((trackA.includes(a) || a.includes(trackA)) && (trackT.includes(t) || t.includes(trackT))) {
        return track;
      }
    }

    return null;
  }
}

export const libraryStore = new LibraryStore();
