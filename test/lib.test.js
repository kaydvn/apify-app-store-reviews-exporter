import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_COUNTRIES, feedUrl, lastPage, mapReview, pageIsBeforeSince, parseApp, parseFeed, parseSince, passesFilters, resolveCountries } from '../src/lib.js';

const entry = (id, rating, date, extra = {}) => ({
    author: { uri: { label: 'https://itunes.apple.com/us/reviews/id1' }, name: { label: 'Jane' } },
    updated: { label: date },
    'im:rating': { label: String(rating) },
    'im:version': { label: '5.2.1' },
    id: { label: String(id) },
    title: { label: 'Great app' },
    content: { label: 'Love the new sync feature', attributes: { type: 'text' } },
    'im:voteSum': { label: '3' },
    'im:voteCount': { label: '4' },
    ...extra,
});

const feed = {
    feed: {
        entry: [{ 'im:name': { label: 'App meta' } }, entry(1, 5, '2026-09-01T10:00:00-07:00'), entry(2, 1, '2026-08-01T10:00:00-07:00')],
        link: [
            { attributes: { rel: 'alternate', href: 'https://apps.apple.com/us/app/id1' } },
            { attributes: { rel: 'last', href: 'https://itunes.apple.com/us/rss/customerreviews/page=7/id=1/sortby=mostrecent/json' } },
        ],
    },
};

test('parseApp', () => {
    assert.deepEqual(parseApp('284882215'), { id: '284882215', country: null });
    assert.deepEqual(parseApp('https://apps.apple.com/de/app/facebook/id284882215?l=en'), { id: '284882215', country: 'de' });
    assert.deepEqual(parseApp({ url: 'https://apps.apple.com/us/app/x/id12345678' }), { id: '12345678', country: 'us' });
    assert.equal(parseApp('https://example.com/foo'), null);
    assert.equal(parseApp(''), null);
});

test('resolveCountries', () => {
    assert.deepEqual(resolveCountries(undefined), ['us']);
    assert.deepEqual(resolveCountries([], 'de'), ['de']);
    assert.deepEqual(resolveCountries('US, uk, xx'), ['us', 'gb']);
    assert.equal(resolveCountries(['all']).length, ALL_COUNTRIES.length);
    assert.equal(resolveCountries(['top', 'us']).length, 20);
});

test('feedUrl', () => {
    assert.equal(feedUrl('gb', '1', 3), 'https://itunes.apple.com/gb/rss/customerreviews/page=3/id=1/sortby=mostrecent/json');
});

test('parseFeed skips metadata entry and handles single/empty', () => {
    assert.equal(parseFeed(feed).length, 2);
    assert.equal(parseFeed({ feed: { entry: entry(9, 4, '2026-01-01') } }).length, 1);
    assert.deepEqual(parseFeed({ feed: {} }), []);
    assert.equal(parseFeed({}), null);
    assert.equal(parseFeed(null), null);
});

test('lastPage', () => {
    assert.equal(lastPage(feed), 7);
    assert.equal(lastPage({ feed: {} }), null);
});

test('mapReview', () => {
    const r = mapReview(parseFeed(feed)[0], { appId: '1', appName: 'X', country: 'us' });
    assert.equal(r.reviewId, '1');
    assert.equal(r.rating, 5);
    assert.equal(r.text, 'Love the new sync feature');
    assert.equal(r.author, 'Jane');
    assert.equal(r.appVersion, '5.2.1');
    assert.equal(r.voteCount, 4);
    assert.equal(r.country, 'us');
});

test('filters and since cutoff', () => {
    const rows = parseFeed(feed).map((e) => mapReview(e, { appId: '1', country: 'us' }));
    assert.equal(rows.filter((r) => passesFilters(r, { maxRating: 2 })).length, 1);
    assert.equal(rows.filter((r) => passesFilters(r, { keyword: 'crash, sync' })).length, 2);
    assert.equal(rows.filter((r) => passesFilters(r, { keyword: 'crash' })).length, 0);
    const since = Date.parse('2026-08-15');
    assert.equal(rows.filter((r) => passesFilters(r, { since })).length, 1);
    assert.equal(pageIsBeforeSince(rows, since), false);
    assert.equal(pageIsBeforeSince(rows, Date.parse('2027-01-01')), true);
});

test('parseSince', () => {
    assert.equal(parseSince(''), null);
    assert.equal(parseSince('2026-01-01'), Date.parse('2026-01-01'));
    const t = parseSince('7 days');
    assert.ok(Math.abs(Date.now() - 7 * 86400000 - t) < 5000);
    assert.equal(parseSince('garbage'), null);
});
