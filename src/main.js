import { Actor, log } from 'apify';
import { feedUrl, lastPage, mapReview, pageIsBeforeSince, parseApp, parseFeed, parseSince, passesFilters, resolveCountries } from './lib.js';

const EVENT = 'review';
const UA = 'Mozilla/5.0 (compatible; app-store-reviews-exporter/1.0; Apify actor; +https://apify.com/mmaker-bot)';
const MAX_PAGES = 10; // Apple serves at most 10 pages x 50 reviews per storefront.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, timeoutMs) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
            if (res.status === 429 || res.status >= 500) {
                await sleep(1500 * (attempt + 1));
                continue;
            }
            const text = await res.text();
            try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: null }; }
        } catch (err) {
            if (attempt === 2) return { status: 0, json: null, error: err.name === 'AbortError' ? 'timeout' : err.message };
        } finally {
            clearTimeout(t);
        }
    }
    return { status: 429, json: null, error: 'rate limited' };
}

async function appName(id, country, timeoutMs) {
    const r = await getJson(`https://itunes.apple.com/lookup?id=${id}&country=${country}`, timeoutMs);
    return r.json?.results?.[0]?.trackName ?? null;
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const apps = [];
const seenApps = new Set();
for (const raw of [...(input.apps || []), ...(input.startUrls || [])]) {
    const a = parseApp(raw);
    if (a && !seenApps.has(a.id)) {
        seenApps.add(a.id);
        apps.push(a);
    }
}
if (!apps.length) throw new Error('Give at least one App Store app URL or numeric app ID in "apps".');

const opts = {
    maxPerCountry: Number(input.maxReviewsPerCountry) > 0 ? Math.min(Number(input.maxReviewsPerCountry), 500) : 500,
    maxPerApp: Number(input.maxReviewsPerApp) > 0 ? Number(input.maxReviewsPerApp) : Infinity,
    timeoutMs: 30000,
    filters: {
        minRating: Math.min(Math.max(Number(input.minRating) || 1, 1), 5),
        maxRating: Math.min(Math.max(Number(input.maxRating) || 5, 1), 5),
        since: parseSince(input.since),
        keyword: (input.keyword || '').trim(),
    },
};
const concurrency = Math.min(Math.max(Number(input.concurrency) || 4, 1), 10);

const jobs = [];
for (const a of apps) {
    for (const c of resolveCountries(input.countries, a.country)) jobs.push({ app: a, country: c });
}
log.info(`${apps.length} apps x countries = ${jobs.length} storefront feeds (concurrency ${concurrency})`);

const names = new Map();
const perApp = new Map();
let limitReached = false;
let total = 0;
const summary = [];

async function runJob({ app, country }) {
    if (!names.has(app.id)) names.set(app.id, appName(app.id, app.country || country, opts.timeoutMs).catch(() => null));
    const name = await names.get(app.id);
    let count = 0;
    let pages = MAX_PAGES;
    for (let page = 1; page <= pages; page++) {
        const r = await getJson(feedUrl(country, app.id, page), opts.timeoutMs);
        const entries = r.status === 200 ? parseFeed(r.json) : null;
        if (!entries) {
            if (page === 1 && r.status !== 200) return { count, error: r.error || `HTTP ${r.status}` };
            break;
        }
        if (page === 1) pages = Math.min(lastPage(r.json) || MAX_PAGES, MAX_PAGES);
        if (!entries.length) break;
        const rows = entries.map((e) => mapReview(e, { appId: app.id, appName: name, country }));
        for (const row of rows) {
            if (limitReached || count >= opts.maxPerCountry || (perApp.get(app.id) || 0) >= opts.maxPerApp) return { count };
            if (!passesFilters(row, opts.filters)) continue;
            perApp.set(app.id, (perApp.get(app.id) || 0) + 1);
            const charge = await Actor.pushData(row, EVENT);
            count++;
            total++;
            if (charge?.eventChargeLimitReached) limitReached = true;
            if (total % 500 === 0) await Actor.setStatusMessage(`Exported ${total} reviews`);
        }
        if (pageIsBeforeSince(rows, opts.filters.since)) break;
    }
    return { count };
}

let next = 0;
async function worker() {
    while (next < jobs.length && !limitReached) {
        const job = jobs[next++];
        let res;
        try {
            res = await runJob(job);
        } catch (err) {
            res = { count: 0, error: err.message };
        }
        summary.push({ appId: job.app.id, country: job.country, ...res });
        if (res.error) log.warning(`${job.app.id}/${job.country}: ${res.error}`);
        else if (res.count) log.info(`${job.app.id}/${job.country}: ${res.count} reviews`);
    }
}
await Promise.all(Array.from({ length: concurrency }, worker));

await Actor.setValue('FEEDS_SUMMARY', summary);
if (limitReached) log.info('Stopped at the maximum charge set for this run.');
const withReviews = summary.filter((s) => s.count).length;
await Actor.setStatusMessage(`Finished: ${total} reviews from ${withReviews}/${jobs.length} storefronts`, { isStatusMessageTerminal: true });
await Actor.exit();
