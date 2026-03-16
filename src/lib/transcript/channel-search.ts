/**
 * channel-search.ts
 * =================
 * Search YouTube channel for videos matching a title query.
 * Uses the channel search page via Vite proxy + cookies.txt.
 *
 * URL: youtube.com/@handle/search?query=TITLE
 * or:  youtube.com/channel/UCxxxxxx/search?query=TITLE
 */

export interface VideoCandidate {
  videoId:     string;
  title:       string;
  publishedAt: string;
  viewCount:   string;
  duration:    string;   // e.g. "12:34"
  thumbnail:   string;
}

export type SearchOutcome =
  | { type: "found";    candidates: [VideoCandidate] }  // exactly 1
  | { type: "multiple"; candidates: VideoCandidate[] }   // 2+, needs confirm
  | { type: "notfound"; candidates: [] }

/** Normalise a channel input to a URL-safe path prefix, e.g. "/@handle" */
export function normaliseChannelPath(input: string): string {
  const s = input.trim().replace(/\/$/, "");
  if (s.includes("/channel/") || s.includes("/@")) {
    // Extract just the path portion
    try {
      const u = new URL(s.startsWith("http") ? s : "https://youtube.com/" + s);
      return u.pathname;
    } catch { /**/ }
  }
  if (s.startsWith("@"))  return "/" + s;
  if (s.startsWith("UC")) return "/channel/" + s;
  return "/@" + s;
}

/** Parse ytInitialData from a YouTube page HTML */
function parseInitialData(html: string): Record<string, unknown> | null {
  const m = html.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});\s*(?:window\[|var |<\/script)/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Recursively walk a YouTube data structure looking for videoRenderer objects */
function findVideoRenderers(obj: unknown, out: VideoCandidate[] = []): VideoCandidate[] {
  if (!obj || typeof obj !== "object") return out;

  if ((obj as Record<string, unknown>).videoId) {
    const r = obj as Record<string, unknown>;
    const vid = String(r.videoId);
    if (/^[a-zA-Z0-9_-]{11}$/.test(vid) && !out.some(c => c.videoId === vid)) {
      const titleRuns = (r.title as Record<string, unknown>)?.runs as Array<Record<string, unknown>>;
      const titleText = titleRuns?.map(x => x.text).join("") ?? String((r.title as Record<string, unknown>)?.simpleText ?? "");
      const views = ((r.viewCountText as Record<string, unknown>)?.simpleText as string)
        ?? ((r.viewCountText as Record<string, unknown>)?.runs as Array<Record<string, unknown>>)?.map(x => x.text).join("") ?? "";
      const published = ((r.publishedTimeText as Record<string, unknown>)?.simpleText as string) ?? "";
      const duration  = ((r.lengthText as Record<string, unknown>)?.simpleText as string)
        ?? ((r.lengthText as Record<string, unknown>)?.accessibility as Record<string, unknown>)?.accessibilityData as string
        ?? "";
      const thumb = ((r.thumbnail as Record<string, unknown>)?.thumbnails as Array<Record<string, unknown>>)?.[0]?.url as string
        ?? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;

      if (titleText) {
        out.push({ videoId: vid, title: titleText, publishedAt: published, viewCount: views, duration: String(duration), thumbnail: String(thumb) });
      }
    }
  }

  for (const v of Object.values(obj as object)) {
    findVideoRenderers(v, out);
  }
  return out;
}

/** Score title similarity (0–100) */
function titleScore(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (c === q) return 100;
  if (c.includes(q) || q.includes(c)) return 90;
  // Word overlap
  const qw = new Set(q.split(/\W+/).filter(w => w.length > 3));
  const cw = c.split(/\W+/);
  let hits = 0;
  for (const w of qw) if (cw.some(cword => cword.startsWith(w) || w.startsWith(cword))) hits++;
  return qw.size ? Math.round((hits / qw.size) * 80) : 0;
}

/**
 * Extract only the search-results section from ytInitialData for a channel search page.
 * Channel search pages use twoColumnBrowseResultsRenderer > tabs > tabRenderer > content.
 * This avoids picking up recommended / related videos from other channels that sit
 * outside the primary results section.
 */
function extractSearchSection(data: Record<string, unknown>): unknown {
  // Channel search page: /@handle/search?query=...
  const tabs = (data?.contents as Record<string, unknown> | undefined)
    ?.twoColumnBrowseResultsRenderer as Record<string, unknown> | undefined;
  const tabList = tabs?.tabs as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(tabList)) {
    for (const tab of tabList) {
      const content = (tab?.tabRenderer as Record<string, unknown> | undefined)?.content;
      if (content) return content;
    }
  }
  // Regular search results page fallback
  const primary = (data?.contents as Record<string, unknown> | undefined)
    ?.twoColumnSearchResultsRenderer as Record<string, unknown> | undefined;
  if (primary?.primaryContents) return primary.primaryContents;
  // Last resort: use full data
  return data;
}

/** Search a YouTube channel for a title query */
export async function searchChannelForTitle(
  channelPath: string,
  query: string,
  minScore = 40
): Promise<SearchOutcome> {
  const encoded = encodeURIComponent(query);
  const url     = `/yt-proxy${channelPath}/search?query=${encoded}`;

  let html: string;
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "en-US,en;q=0.9" } });
    if (res.status === 429) throw new Error("429");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw e;
  }

  const data = parseInitialData(html);
  if (!data) return { type: "notfound", candidates: [] };

  const searchSection = extractSearchSection(data);
  const all     = findVideoRenderers(searchSection);
  const scored  = all
    .map(c => ({ ...c, score: titleScore(query, c.title) }))
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) return { type: "notfound", candidates: [] };
  if (scored.length === 1) return { type: "found", candidates: [scored[0]] };
  return { type: "multiple", candidates: scored };
}
