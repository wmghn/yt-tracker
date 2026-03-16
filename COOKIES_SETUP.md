# Cookies Setup (one time)

YouTube blocks automated requests without login cookies.
You need to export your browser cookies once.

## Steps

1. **Install extension** in Chrome:
   [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)

   For Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. **Go to youtube.com** — make sure you're logged in

3. **Click the extension icon** → "Export cookies for this tab"

4. **Save as `cookies.txt`** in the `yt-tracker/` folder (same folder as package.json)

5. **Run as normal:**
   ```bash
   npm run dev
   ```
   You should see:
   ```
   ✓  yt-tracker: cookies.txt loaded (XX cookies)
   ```

## Notes
- Refresh `cookies.txt` every 1–3 months when your YouTube session expires
- The file is in `.gitignore` — it won't be committed to git
- `npm run build` doesn't need cookies (transcript fetch only works in dev mode)
