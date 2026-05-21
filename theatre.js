const { chromium } = require('playwright');
const open = require('opn');

// What we're waiting on — change these to retarget.
const VENUE_CODE = 'VMHE';
const VENUE_SLUG = 'vanitha-cineplex-rgb-laser-4k-3d-atmos-edappally';
const CITY = 'kochi';
const TARGET_DATE = '20260523'; // YYYYMMDD — the date we want bookings to open for

const VENUE_URL = `https://in.bookmyshow.com/cinemas/${CITY}/${VENUE_SLUG}/buytickets/${VENUE_CODE}/${TARGET_DATE}`;
const POLL_INTERVAL_MS = 40 * 60 * 1000; // 40 min — BMS is behind Cloudflare; keep polling polite

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Produces "Sat23May" — the text BMS renders inside each date pill on the strip.
const pillTextForDate = (yyyymmdd) => {
    const y = Number(yyyymmdd.slice(0, 4));
    const m = Number(yyyymmdd.slice(4, 6)) - 1;
    const d = Number(yyyymmdd.slice(6, 8));
    const date = new Date(Date.UTC(y, m, d));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getUTCDay()]}${d}${months[m]}`;
};

const TARGET_PILL_TEXT = pillTextForDate(TARGET_DATE);

const checkOnce = async (context) => {
    const page = await context.newPage();
    try {
        console.log(`Checking ${TARGET_DATE} (${TARGET_PILL_TEXT})…`);
        const resp = await page.goto(VENUE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (!resp) {
            console.log('  no response, will retry');
            return false;
        }

        try { await page.waitForLoadState('networkidle', { timeout: 10_000 }); } catch {}

        // Signal 1: did BMS keep us on the requested date, or silently redirect to today?
        const finalUrl = page.url();
        const urlMatches = finalUrl.includes(`/${TARGET_DATE}`);

        // Signal 2: is the date pill for our target rendered as enabled (opacity 1) on the strip?
        // BMS uses opacity 0.4 for not-yet-bookable dates and opacity 1 for bookable ones.
        const pillState = await page.evaluate((targetText) => {
            const all = document.querySelectorAll('div, button, a, li, span');
            for (const el of all) {
                const txt = (el.textContent || '').trim();
                if (txt !== targetText) continue;
                const style = window.getComputedStyle(el);
                return { found: true, opacity: parseFloat(style.opacity) };
            }
            return { found: false };
        }, TARGET_PILL_TEXT);

        const pillEnabled = pillState.found && pillState.opacity >= 0.95;

        console.log(`  finalUrl=${finalUrl}`);
        console.log(`  urlOnTargetDate=${urlMatches}  pill.found=${pillState.found}  pill.opacity=${pillState.opacity ?? 'n/a'}`);

        // Bookings are considered open when the URL didn't bounce AND the pill renders enabled.
        return urlMatches && pillEnabled;
    } catch (err) {
        console.log(`  request failed: ${err.message}. Will retry.`);
        return false;
    } finally {
        await page.close();
    }
};

const main = async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: 'en-IN',
        viewport: { width: 1280, height: 800 },
    });

    try {
        while (true) {
            if (await checkOnce(context)) {
                console.log(`\nBookings OPEN for ${TARGET_DATE} at ${VENUE_SLUG}. Opening browser.`);
                open(VENUE_URL);
                await sleep(500);
                break;
            }
            console.log(`  not yet. Sleeping ${POLL_INTERVAL_MS / 60_000} min.\n`);
            await sleep(POLL_INTERVAL_MS);
        }
    } finally {
        await context.close();
        await browser.close();
    }

    process.exit(0);
};

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
