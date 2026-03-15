const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYouTubeId(id: string): boolean {
  return VIDEO_ID_REGEX.test(id);
}

export function parseVideoIdList(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const id = line.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (isValidYouTubeId(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
