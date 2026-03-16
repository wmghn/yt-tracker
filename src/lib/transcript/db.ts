/**
 * db.ts — IndexedDB storage for transcripts
 *
 * Why IndexedDB instead of localStorage:
 *   - localStorage limit: ~5MB (one transcript can be 50–200KB)
 *   - IndexedDB: effectively unlimited for local use
 *   - Supports full-text index on intro_text for fast search
 */

import type { FetchedTranscript } from "./fetcher";

const DB_NAME    = "yt_transcripts";
const DB_VERSION = 1;
const STORE      = "transcripts";

// ── DB schema ─────────────────────────────────────────────────────────────────

export interface StoredTranscript extends FetchedTranscript {
  title:    string;
  introText: string;  // first 600 chars — used for search preview
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "videoId" });
        store.createIndex("fetchedAt", "fetchedAt");
        store.createIndex("language",  "language");
      }
    };

    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveTranscript(
  transcript: FetchedTranscript,
  title: string
): Promise<void> {
  const db = await openDB();
  const record: StoredTranscript = {
    ...transcript,
    title,
    introText: transcript.text.slice(0, 600),
  };
  await tx(db, "readwrite", s => s.put(record));
}

export async function getTranscript(
  videoId: string
): Promise<StoredTranscript | null> {
  const db  = await openDB();
  const res = await tx(db, "readonly", s => s.get(videoId));
  return (res as StoredTranscript) ?? null;
}

export async function hasTranscript(videoId: string): Promise<boolean> {
  const t = await getTranscript(videoId);
  return t !== null;
}

export async function getAllTranscripts(): Promise<StoredTranscript[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t     = db.transaction(STORE, "readonly");
    const req   = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredTranscript[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteTranscript(videoId: string): Promise<void> {
  const db = await openDB();
  await tx(db, "readwrite", s => s.delete(videoId));
}

export async function getStats(): Promise<{
  total: number;
  totalChars: number;
  languages: Record<string, number>;
}> {
  const all   = await getAllTranscripts();
  const langs: Record<string, number> = {};
  let   chars = 0;
  for (const t of all) {
    chars += t.text.length;
    langs[t.language] = (langs[t.language] ?? 0) + 1;
  }
  return { total: all.length, totalChars: chars, languages: langs };
}

// ── Search (fuzzy in JS) ──────────────────────────────────────────────────────

export interface SearchResult {
  videoId:   string;
  title:     string;
  score:     number;
  introText: string;
  language:  string;
}

function normalise(t: string): string {
  return t.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreMatch(query: string, target: string): number {
  const nq = normalise(query);
  const nt = normalise(target);

  // Word overlap score
  const qWords = new Set(nq.split(" ").filter(w => w.length > 3));
  const tWords = nt.split(" ");
  let   hits   = 0;
  for (const w of qWords) {
    if (tWords.some(tw => tw.startsWith(w) || w.startsWith(tw))) hits++;
  }
  const wordScore = qWords.size ? (hits / qWords.size) * 100 : 0;

  // Substring score — longer match = higher score
  const queryBigrams = nq.slice(0, 80);
  const substringScore = nt.includes(queryBigrams)
    ? 95
    : nt.includes(nq.slice(0, 40))
    ? 70
    : 0;

  return Math.round(Math.max(wordScore, substringScore));
}

export async function searchTranscripts(
  query:  string,
  topN:   number = 5
): Promise<SearchResult[]> {
  const all = await getAllTranscripts();
  if (!all.length || !query.trim()) return [];

  const scored = all.map(t => ({
    videoId:   t.videoId,
    title:     t.title,
    introText: t.introText,
    language:  t.language,
    score:     scoreMatch(query, (t.introText || "") + " " + t.title),
  }));

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
