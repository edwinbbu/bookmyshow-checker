# bookmyshow-checker

A small Node.js polling script that watches a [BookMyShow](https://in.bookmyshow.com) buytickets page and notifies you (by auto-opening the page in your browser) the moment a specific date becomes bookable at a specific theatre.

Originally a `request-promise` + `cheerio` HTML scraper. BookMyShow now sits behind Cloudflare, which blocks plain HTTP clients at the TLS-fingerprint / JS-challenge layer regardless of headers. The current implementation drives a real headless Chromium via [Playwright](https://playwright.dev), which Cloudflare treats as a normal browser.

## What it does

- Loads `https://in.bookmyshow.com/cinemas/<city>/<venue-slug>/buytickets/<VENUE_CODE>/<YYYYMMDD>` every N minutes.
- Detects whether bookings have opened for that exact date using two signals:
  1. **URL stability** — BMS silently redirects to today's date when the requested one isn't bookable yet. If the URL stays on the target date after navigation, that's the strongest signal.
  2. **Date-pill opacity** — bookable dates render at `opacity: 1`; not-yet-open dates render at `opacity: 0.4`.
- When both signals say "open", opens the buytickets page in your default browser and exits.

## Files

| File | Purpose |
|---|---|
| `theatre.js` | Main script — polls a venue/date for booking availability. |
| `movie.js` | Original-era script (kept for reference) that polls a specific movie page. Uses the legacy `request-promise` approach and **will not work today** without the same Playwright treatment. |
| `diagnose.js` | One-shot diagnostic — loads the page once and prints final URL, date pill states, JSON XHRs containing your keyword, etc. Useful when adapting the script to a new venue/date or after BMS changes their markup. |
| `package.json` | Dependencies. |
| `checker.log` | Created at runtime when you launch the script with `nohup`. |

## Requirements

- Node.js 18+ (tested on 24)
- ~300 MB free disk for Playwright's Chromium download
- A working internet connection from a residential IP (datacenter IPs are more likely to hit Cloudflare blocks)

## Setup

```bash
git clone <this repo>
cd bookmyshow-checker

npm install
npx playwright install chromium
```

The Chromium download is a one-time ~170 MB step. It lives in `~/Library/Caches/ms-playwright/` (macOS) and is shared across all Playwright projects on your machine.

## Configure what to watch

Edit the constants at the top of [`theatre.js`](./theatre.js):

```js
const VENUE_CODE = 'VMHE';                                                 // BMS internal venue id (look at the URL)
const VENUE_SLUG = 'vanitha-cineplex-rgb-laser-4k-3d-atmos-edappally';     // the human slug from the URL
const CITY = 'kochi';                                                      // city slug
const TARGET_DATE = '20260523';                                            // YYYYMMDD — date you want to be notified about
const POLL_INTERVAL_MS = 40 * 60 * 1000;                                   // polling interval (40 min default)
```

### How to find these values

Open the BMS buytickets page for your theatre in any browser. The URL looks like:

```
https://in.bookmyshow.com/cinemas/<CITY>/<VENUE_SLUG>/buytickets/<VENUE_CODE>/<DATE>
```

Copy each segment directly into the constants above. `DATE` is `YYYYMMDD` (no separators).

## Run it

### Foreground (terminal stays attached)

```bash
node theatre.js
```

Stop with `Ctrl+C`. The script and browser die when the terminal closes.

### Background (survives terminal close, recommended for multi-hour runs)

```bash
nohup node theatre.js > checker.log 2>&1 &
echo $! > checker.pid
```

Watch progress:

```bash
tail -f checker.log
```

Stop it later:

```bash
kill $(cat checker.pid)
```

Check if it's still running:

```bash
ps -p $(cat checker.pid)
```

## Output

While waiting:

```
Checking 20260523 (Sat23May)…
  finalUrl=https://in.bookmyshow.com/cinemas/kochi/.../buytickets/VMHE/20260521
  urlOnTargetDate=false  pill.found=true  pill.opacity=0.4
  not yet. Sleeping 40 min.
```

When the date opens:

```
Checking 20260523 (Sat23May)…
  finalUrl=https://in.bookmyshow.com/cinemas/kochi/.../buytickets/VMHE/20260523
  urlOnTargetDate=true  pill.found=true  pill.opacity=1

Bookings OPEN for 20260523 at vanitha-cineplex-rgb-laser-4k-3d-atmos-edappally. Opening browser.
```

…and the buytickets page auto-opens in your default browser. The script then exits cleanly.

## Tuning

- **Polling interval.** At the default 40 minutes (36 requests/day) you're firmly in "casual human" territory from Cloudflare's perspective. Going as low as ~5 minutes is still safe; lower than that starts to look mechanical. Going lower than 1 minute is asking for a block.
- **Headed vs headless.** The script runs Chromium headlessly. To watch what it's doing, change `chromium.launch({ headless: true })` to `chromium.launch({ headless: false })`.
- **Jittered polling.** If you want to break the every-40-minutes-on-the-dot pattern, add a small random offset to the sleep:
  ```js
  await sleep(POLL_INTERVAL_MS + Math.floor(Math.random() * 5 * 60_000));
  ```

## When things break

Re-run `diagnose.js`:

```bash
node diagnose.js
```

It prints the final URL, every date pill it found with its opacity/class, and any JSON XHRs that mentioned your keyword. Two common failure modes and what they look like:

- **Cloudflare blocking the headless browser.** The `final URL` will be the CF block page or about:blank, and no date pills will be detected. Try running headed (`headless: false`), switch networks, or wait a few hours.
- **BMS changed the date-strip markup.** Date pills still detected but `opacity` is no longer `1` / `0.4`. Update the threshold in `theatre.js` (the `pill.opacity >= 0.95` check) based on what `diagnose.js` reports.

## Caveats

- BookMyShow does **not** offer a public API. Everything here uses undocumented endpoints / page structure that can change at any time. Expect to re-tune occasionally.
- BMS's Terms of Service forbid automated access. Personal "ping me when bookings open" use at hourly-ish intervals is typically tolerated; do not point this script at high-demand events or run it from multiple IPs in parallel.
- This is a personal-use polling utility. Don't use it to scalp.

## Dependencies

- [`playwright`](https://playwright.dev) — drives the headless Chromium.
- [`opn`](https://github.com/sindresorhus/opn) — opens the BMS page in your default browser when bookings open.

(The legacy `request`, `request-promise`, `cheerio`, and `execa` are still listed in `package.json` because `movie.js` references them; they're not used by `theatre.js` and can be removed once `movie.js` is migrated.)

## License

ISC (inherited from `package.json`).
