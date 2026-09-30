// Pure helpers for the multi-country App Store reviews exporter.

// Apple App Store storefront country codes (ISO 3166-1 alpha-2, lower case).
export const ALL_COUNTRIES = [
    'ae', 'ag', 'ai', 'al', 'am', 'ao', 'ar', 'at', 'au', 'az', 'ba', 'bb', 'be', 'bf', 'bg', 'bh', 'bj', 'bm', 'bn', 'bo',
    'br', 'bs', 'bt', 'bw', 'by', 'bz', 'ca', 'cd', 'cg', 'ch', 'ci', 'cl', 'cm', 'cn', 'co', 'cr', 'cv', 'cy', 'cz', 'de',
    'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg', 'es', 'fi', 'fj', 'fm', 'fr', 'ga', 'gb', 'gd', 'ge', 'gh', 'gm', 'gr', 'gt',
    'gw', 'gy', 'hk', 'hn', 'hr', 'hu', 'id', 'ie', 'il', 'in', 'iq', 'is', 'it', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'kn',
    'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'lk', 'lr', 'lt', 'lu', 'lv', 'ly', 'ma', 'md', 'me', 'mg', 'mk', 'ml', 'mm',
    'mn', 'mo', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na', 'ne', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nz',
    'om', 'pa', 'pe', 'pg', 'ph', 'pk', 'pl', 'pt', 'pw', 'py', 'qa', 'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'se', 'sg',
    'si', 'sk', 'sl', 'sn', 'sr', 'st', 'sv', 'sz', 'tc', 'td', 'th', 'tj', 'tm', 'tn', 'to', 'tr', 'tt', 'tw', 'tz', 'ua',
    'ug', 'us', 'uy', 'uz', 'vc', 've', 'vg', 'vn', 'vu', 'xk', 'ye', 'za', 'zm', 'zw',
];

export const TOP_COUNTRIES = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'es', 'it', 'nl', 'se', 'br', 'mx', 'in', 'jp', 'kr', 'cn', 'tw', 'tr', 'pl', 'ru'];

// Accepts a numeric id, "id123", or an apps.apple.com URL. Returns { id, country } or null.
export function parseApp(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(typeof raw === 'object' ? raw.url ?? '' : raw).trim();
    if (!s) return null;
    if (/^\d{5,12}$/.test(s)) return { id: s, country: null };
    const m = s.match(/(?:^|[/=])id(\d{5,12})(?:\D|$)/);
    if (!m) return null;
    const c = s.match(/apple\.com\/([a-z]{2})\//i);
    return { id: m[1], country: c ? c[1].toLowerCase() : null };
}

export function resolveCountries(input, appCountry = null) {
    const list = Array.isArray(input) ? input : (typeof input === 'string' ? input.split(/[\s,]+/) : []);
    const out = new Set();
    for (const raw of list) {
        const c = String(raw).trim().toLowerCase();
        if (!c) continue;
        if (c === 'all') ALL_COUNTRIES.forEach((x) => out.add(x));
        else if (c === 'top') TOP_COUNTRIES.forEach((x) => out.add(x));
        else if (c === 'uk') out.add('gb');
        else if (ALL_COUNTRIES.includes(c)) out.add(c);
    }
    if (!out.size) out.add(appCountry || 'us');
    return [...out];
}

export function feedUrl(country, id, page, sort = 'mostrecent') {
    return `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${id}/sortby=${sort}/json`;
}

const label = (v) => (v && typeof v === 'object' && 'label' in v ? v.label : null);

// Returns an array of raw review entries, [] for an empty feed, or null if the JSON is not a feed.
export function parseFeed(json) {
    if (!json || typeof json !== 'object' || !json.feed) return null;
    let entries = json.feed.entry;
    if (!entries) return [];
    if (!Array.isArray(entries)) entries = [entries];
    // Older feeds put app metadata in the first entry; it has no rating.
    return entries.filter((e) => e && e['im:rating']);
}

export function lastPage(json) {
    const links = json?.feed?.link;
    const arr = Array.isArray(links) ? links : links ? [links] : [];
    const last = arr.find((l) => l?.attributes?.rel === 'last');
    const m = last?.attributes?.href?.match(/page=(\d+)/);
    return m ? Number(m[1]) : null;
}

export function mapReview(e, { appId, appName = null, country }) {
    const num = (v) => {
        const n = Number(label(v));
        return Number.isFinite(n) ? n : null;
    };
    return {
        appId,
        appName,
        country,
        reviewId: label(e.id),
        rating: num(e['im:rating']),
        title: label(e.title),
        text: label(e.content),
        author: label(e.author?.name),
        authorUrl: label(e.author?.uri),
        appVersion: label(e['im:version']),
        date: label(e.updated),
        voteSum: num(e['im:voteSum']),
        voteCount: num(e['im:voteCount']),
    };
}

export function passesFilters(row, { minRating = 1, maxRating = 5, since = null, keyword = '' } = {}) {
    if (row.rating !== null && (row.rating < minRating || row.rating > maxRating)) return false;
    if (since && row.date && Date.parse(row.date) < since) return false;
    if (keyword) {
        const hay = `${row.title || ''} ${row.text || ''}`.toLowerCase();
        if (!keyword.toLowerCase().split(/\s*,\s*/).filter(Boolean).some((k) => hay.includes(k))) return false;
    }
    return true;
}

// Feeds sorted by mostrecent: once a whole page is older than `since`, later pages are older too.
export function pageIsBeforeSince(rows, since) {
    if (!since || !rows.length) return false;
    return rows.every((r) => r.date && Date.parse(r.date) < since);
}

export function parseSince(v) {
    if (!v) return null;
    const s = String(v).trim();
    const rel = s.match(/^(\d+)\s*(day|week|month)s?$/i);
    if (rel) {
        const n = Number(rel[1]);
        const days = { day: 1, week: 7, month: 30 }[rel[2].toLowerCase()] * n;
        return Date.now() - days * 86400000;
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
}
