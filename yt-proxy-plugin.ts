/**
 * yt-proxy-plugin.ts
 * ==================
 * Vite middleware that proxies /yt-proxy/* → youtube.com
 * and injects cookies from cookies.txt on every request.
 */

import fs   from "fs";
import path from "path";
import http  from "http";
import https from "https";
import type { Plugin, ViteDevServer } from "vite";

const COOKIES_FILE = path.resolve(__dirname, "cookies.txt");

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Encoding": "identity",          // avoid gzip — simpler piping
  "Origin": "https://www.youtube.com",
  "Referer": "https://www.youtube.com/",
};

// ── Parse Netscape cookies.txt ────────────────────────────────────────────────

function loadCookies(): string {
  if (!fs.existsSync(COOKIES_FILE)) return "";
  const lines = fs.readFileSync(COOKIES_FILE, "utf-8").split("\n");
  const pairs: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    const cols = line.trim().split("\t");
    // Netscape: domain flag path secure expiry name value
    if (cols.length >= 7 && cols[5] && cols[6]) {
      pairs.push(`${cols[5]}=${cols[6]}`);
    }
  }
  return pairs.join("; ");
}

// ── Proxy one request ─────────────────────────────────────────────────────────

function proxy(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const cookies    = loadCookies();
  const targetPath = (req.url ?? "/").replace(/^\/yt-proxy/, "") || "/";

  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (cookies) headers["Cookie"] = cookies;

  // For POST requests (youtubei API), pass Content-Type through
  const ct = req.headers["content-type"];
  if (ct) headers["Content-Type"] = ct as string;

  const options: https.RequestOptions = {
    hostname: "www.youtube.com",
    path:     targetPath,
    method:   req.method ?? "GET",
    headers,
  };

  const ytReq = https.request(options, (ytRes) => {
    const skip = new Set(["transfer-encoding", "connection", "keep-alive",
                          "content-encoding", "content-length"]);

    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    for (const [k, v] of Object.entries(ytRes.headers)) {
      if (!skip.has(k.toLowerCase()) && v) {
        res.setHeader(k, v as string | string[]);
      }
    }

    res.writeHead(ytRes.statusCode ?? 200);
    ytRes.pipe(res);
  });

  ytReq.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502);
    res.end(`Proxy error: ${e.message}`);
  });

  // Pipe request body (needed for POST)
  req.pipe(ytReq);
}

// ── Vite plugin ───────────────────────────────────────────────────────────────

export default function ytProxyPlugin(): Plugin {
  return {
    name: "yt-proxy",

    configureServer(server: ViteDevServer) {
      const exists = fs.existsSync(COOKIES_FILE);
      if (!exists) {
        console.log("\n⚠  cookies.txt not found — transcript download will fail.");
        console.log("   See COOKIES_SETUP.md for instructions.\n");
      } else {
        const cookies = loadCookies();
        console.log(`\n✓  cookies.txt loaded (${cookies.split(";").length} cookies)\n`);
      }

      // OPTIONS preflight
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/yt-proxy") && req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin",  "*");
          res.setHeader("Access-Control-Allow-Headers", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.writeHead(204);
          res.end();
          return;
        }
        next();
      });

      // Proxy all /yt-proxy/* requests
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/yt-proxy")) {
          proxy(req, res);
          return;
        }
        next();
      });
    },
  };
}
