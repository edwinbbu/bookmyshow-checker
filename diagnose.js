const { chromium } = require('playwright');

const URL =
    'https://in.bookmyshow.com/cinemas/kochi/vanitha-cineplex-rgb-laser-4k-3d-atmos-edappally/buytickets/VMHE/20260523';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-IN',
        viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();

    const jsonHits = [];
    page.on('response', async (r) => {
        const ct = r.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        try {
            const body = await r.text();
            if (body.toLowerCase().includes('drishyam')) {
                jsonHits.push({ url: r.url(), status: r.status(), len: body.length });
            }
        } catch {}
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try { await page.waitForLoadState('networkidle', { timeout: 12_000 }); } catch {}

    const title = await page.title();
    const url = page.url();
    const html = await page.content();
    const lower = html.toLowerCase();

    const indices = [];
    let i = 0;
    while ((i = lower.indexOf('drishyam', i)) !== -1) {
        indices.push(i);
        i += 1;
    }

    console.log('Final URL :', url);
    console.log('Title     :', title);
    console.log('HTML size :', html.length);
    console.log('"drishyam" occurrences in HTML:', indices.length);
    indices.slice(0, 5).forEach((idx, n) => {
        const snippet = html.slice(Math.max(0, idx - 120), idx + 120).replace(/\s+/g, ' ');
        console.log(`  #${n + 1} @${idx}: …${snippet}…`);
    });

    const noShows = /no shows|no showtimes|not available|sold out|coming soon/i.test(html);
    console.log('Page mentions any "no shows / coming soon" phrasing?:', noShows);

    console.log('JSON responses containing "drishyam":', jsonHits.length);
    jsonHits.slice(0, 5).forEach((h, n) => console.log(`  #${n + 1} [${h.status}] ${h.len}B  ${h.url}`));

    // Inspect the date strip: find anything that looks like the 21/22/23/24/25 tab list.
    const datePills = await page.evaluate(() => {
        const pills = [];
        const candidates = document.querySelectorAll('a, button, div, li, span');
        for (const el of candidates) {
            const txt = (el.textContent || '').trim();
            if (!/^(MON|TUE|WED|THU|FRI|SAT|SUN)\s*\d{1,2}\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(txt)) continue;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            pills.push({
                tag: el.tagName,
                text: txt,
                href: el.getAttribute('href'),
                className: el.className,
                disabledAttr: el.getAttribute('disabled'),
                ariaDisabled: el.getAttribute('aria-disabled'),
                pointerEvents: style.pointerEvents,
                opacity: style.opacity,
                color: style.color,
                top: Math.round(rect.top),
            });
        }
        return pills;
    });
    console.log('\nDate pills detected:', datePills.length);
    datePills.forEach((p) => console.log(' ', JSON.stringify(p)));

    await browser.close();
})();
