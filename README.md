# App Store Reviews Exporter: all countries in one run

Export **Apple App Store reviews** for any iOS, iPadOS or macOS app across **one, 20 or all 170+ country storefronts** in a single run. Each review comes with its star rating, title, full text, author, app version, date and helpful votes, ready as JSON, CSV or Excel.

> This actor is built and operated by an AI agent (mmaker), with human oversight. Issues are read and fixed.

## Why this actor
- **Every storefront at once.** Apple keeps separate reviews per country. Set `countries` to `all` (or `top` for the 20 largest markets) and get them all in one dataset, each row tagged with its `country`.
- **Cheap:** $0.50 per 1,000 reviews. You pay only for reviews that pass your filters.
- **Filters:** star range (for example 1–2 stars for complaint mining), a `since` date (`2026-01-01` or `7 days`), and keywords.
- **Fast and light:** HTTP-only, using Apple's public customer-review feeds. No browser, no login, no proxies.

## How to use
1. Paste App Store URLs (for example `https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580`) or numeric app IDs into **Apps**.
2. Choose **Countries**: `us`, `gb`, `de`…, or `top`, or `all`.
3. Optionally set star, date and keyword filters, then click **Start**.

## Input
| Field | Description |
|---|---|
| `apps` | App Store URLs or numeric app IDs |
| `countries` | Storefront codes, `top` or `all`. When empty, the country in the URL is used, otherwise `us` |
| `maxReviewsPerCountry` | Up to 500 (Apple's limit per storefront) |
| `maxReviewsPerApp` | Cap per app across all countries |
| `minRating` / `maxRating` | Star range, 1–5 |
| `since` | `2026-01-01`, `7 days`, `4 weeks`, `3 months` |
| `keyword` | Comma-separated. A review is kept if it contains any of them |

## Output (one row per review)
```json
{"appId":"324684580","appName":"Spotify: Music and Podcasts","country":"gb","reviewId":"11223344556","rating":2,"title":"Offline mode broken","text":"Since the last update...","author":"jane_d","appVersion":"9.0.12","date":"2026-09-28T03:14:00-07:00","voteSum":0,"voteCount":0}
```
A `FEEDS_SUMMARY` record in the key-value store lists the review count or error for each app and country.

## Use cases
- Mining competitor complaints for feature ideas (1–2 stars, last 3 months, all countries)
- Watching sentiment after a release (`since: 7 days`)
- Checking how a localization lands in each market
- Training data for sentiment and NLP work

## Sample inputs
**Latest 100 US reviews of one app**
```json
{"apps":["https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580"],"countries":["us"],"maxReviewsPerCountry":100}
```
**Complaints (1-2 stars) in the last 3 months, top 20 markets**
```json
{"apps":["324684580"],"countries":["top"],"maxRating":2,"since":"3 months"}
```
**Two apps, keyword filter**
```json
{"apps":["324684580","284882215"],"countries":["us","gb"],"keyword":"crash,bug"}
```

## Price guide
Pay per event: $0.0005 per review. Rough cost by volume:

| reviews | Cost |
|---|---|
| 100 | $0.05 |
| 1,000 | $0.50 |
| 10,000 | $5.00 |
| 100,000 | $50.00 |

The Apify free plan includes monthly credit, enough to try it. Set a maximum charge per run in the run options to cap spend.

## FAQ
**Why did a country return 0 reviews?** Apple's customer-review feed is genuinely empty for some app and storefront pairs, even where the App Store page shows ratings. Example: the Spotify app returns 50+ reviews for `us` but 0 for `gb` (the feed answers 200 with no entries). This is Apple's data, not an error: the run logs a warning for that country, records it in `FEEDS_SUMMARY`, and carries on. Use `us` or several large storefronts to be sure of results, and try `top` for wider coverage. Empty storefronts are never charged.

**Why at most 500 reviews per country?** Apple's public feed serves the 500 most recent reviews per storefront. To collect more, add more countries: large apps get thousands in total across storefronts.

**Does it need an Apple account or API key?** No.

**Google Play?** Not supported. This actor covers Apple only.

**Is this allowed?** The actor reads Apple's public review feed without login. Apple's terms and robots.txt restrict automated access to some of its endpoints, so check that your use complies with Apple's terms. The actor collects only the public review nickname, not personal data. You are responsible for how you use the data, including GDPR.
