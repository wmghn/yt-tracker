/**
 * fetcher.ts
 * ==========
 * Fetch YouTube transcripts via Vite dev proxy + cookies.txt
 *
 * Uses the internal youtubei/v1/player API instead of the full watch page.
 * This is ~10x lighter per request and triggers rate limits far less often.
 *
 * Flow:
 *   POST /yt-proxy/youtubei/v1/player  →  get captionTracks from JSON response
 *   GET  /yt-proxy/<timedtext url>     →  fetch + parse transcript XML
 */

export interface TranscriptSnippet { text: string; start: number; }

export interface FetchedTranscript {
  videoId:   string;
  language:  string;
  isAuto:    boolean;
  text:      string;
  snippets:  TranscriptSnippet[];
  fetchedAt: number;
}

export type FetchResult =
  | { ok: true;  transcript: FetchedTranscript }
  | { ok: false; error: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: Error = new Error("unknown");

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      await sleep(2000 * Math.pow(2, attempt - 1));
    }

    try {
      const res = await fetch(url, init);

      if (res.status === 429) {
        console.warn(`[transcript] 429 rate limit, retry ${attempt + 1}/${maxRetries}`);
        lastErr = new Error("429 Too Many Requests");
        continue;
      }

      return res;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastErr;
}

// ── Step 1: get caption tracks via youtubei API ───────────────────────────────

interface CaptionTrack {
  baseUrl:      string;
  languageCode: string;
  name:         { simpleText: string };
  kind?:        string;  // "asr" = auto-generated
}

const PLAYER_PAYLOAD = (videoId: string) => ({
  videoId,
  context: {
    client: {
      clientName:    "WEB",
      clientVersion: "2.20240101",
      hl:            "en",
      gl:            "US",
    },
  },
});

async function getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  // First try: youtubei/v1/player (fast, JSON, no HTML parsing)
  try {
    const res = await fetchWithRetry(
      "/yt-proxy/youtubei/v1/player",
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(PLAYER_PAYLOAD(videoId)),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const tracks: CaptionTrack[] =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length) return tracks;
    }
  } catch (e) {
    console.warn("[transcript] youtubei/v1/player failed, trying watch page", e);
  }

  // Fallback: parse watch page HTML (heavier but more reliable with cookies)
  const res = await fetchWithRetry(
    `/yt-proxy/watch?v=${videoId}&hl=en`,
    { headers: { "Accept-Language": "en-US,en;q=0.9" } }
  );

  if (!res.ok) throw new Error(`Watch page ${res.status}`);

  const html   = await res.text();
  const match  = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*(?:var |const |let |if |<\/script)/);
  if (!match)  throw new Error("Player response not found in page");

  const data   = JSON.parse(match[1]);
  const tracks: CaptionTrack[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks;
}

// ── Step 2: pick best track ───────────────────────────────────────────────────

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return (
    tracks.find(t => t.languageCode.startsWith("en") && t.kind !== "asr") ??
    tracks.find(t => t.languageCode.startsWith("en")) ??
    tracks.find(t => t.kind !== "asr") ??
    tracks[0] ?? null
  );
}

// ── Step 3: fetch and parse transcript ───────────────────────────────────────

async function fetchTrackText(
  track: CaptionTrack
): Promise<{ text: string; snippets: TranscriptSnippet[] }> {
  // Rewrite absolute YouTube URL to go through Vite proxy
  const proxyUrl = track.baseUrl
    .replace("https://www.youtube.com", "/yt-proxy")
    .replace("http://www.youtube.com",  "/yt-proxy");

  // Try JSON3 first (cleaner), fall back to XML
  const jsonUrl = proxyUrl.includes("fmt=")
    ? proxyUrl
    : proxyUrl + "&fmt=json3";

  const res = await fetchWithRetry(jsonUrl, {});
  if (!res.ok) throw new Error(`Timedtext ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";

  if (ct.includes("json") || jsonUrl.includes("fmt=json3")) {
    try {
      return parseJson3(await res.json());
    } catch {
      // fall through to XML
    }
  }

  return parseXml(await res.text());
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseJson3(data: {
  events?: Array<{ segs?: Array<{ utf8?: string }>; tStartMs?: number }>;
}): { text: string; snippets: TranscriptSnippet[] } {
  const snippets: TranscriptSnippet[] = [];
  for (const event of data.events ?? []) {
    const t = (event.segs ?? [])
      .map(s => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (t) snippets.push({ text: t, start: (event.tStartMs ?? 0) / 1000 });
  }
  return {
    text:     snippets.map(s => s.text).join(" ").replace(/\s+/g, " ").trim(),
    snippets,
  };
}

function parseXml(xml: string): { text: string; snippets: TranscriptSnippet[] } {
  const doc      = new DOMParser().parseFromString(xml, "text/xml");
  const snippets: TranscriptSnippet[] = [];

  doc.querySelectorAll("text").forEach(node => {
    const raw = (node.textContent ?? "")
      .replace(/&#39;/g, "'").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/\n/g, " ")
      .trim();
    if (raw) snippets.push({
      text:  raw,
      start: parseFloat(node.getAttribute("start") ?? "0"),
    });
  });

  return {
    text:     snippets.map(s => s.text).join(" ").replace(/\s+/g, " ").trim(),
    snippets,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchTranscript(videoId: string): Promise<FetchResult> {
  try {
    const tracks = await getCaptionTracks(videoId);
    if (!tracks.length) return { ok: false, error: "No captions on this video" };

    const track = pickTrack(tracks);
    if (!track)  return { ok: false, error: "No suitable track found" };

    const { text, snippets } = await fetchTrackText(track);
    if (!text) return { ok: false, error: "Transcript text is empty" };

    return {
      ok: true,
      transcript: {
        videoId,
        language:  track.languageCode,
        isAuto:    track.kind === "asr",
        text,
        snippets,
        fetchedAt: Date.now(),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
