# World Globe

An interactive 3D globe in the browser. Click a country to see:

- **Statistics:** population and crude birth rate (World Bank)
- **History:** borders from **600 AD to today** on a time slider
- **Leaders:** current heads of state and government (Wikidata)
- **News:** recent articles from outlets based in that country (GDELT)
- **TV:** links to official broadcaster websites and live pages

It is a **static site**: HTML, CSS and JavaScript on **Cloudflare Pages** at **https://world.jonathansewe.com** (not live yet). There is no backend, no paid API and no API key anywhere.

> **Status: planning.** No application code yet. This repo currently holds the research and the plan.

## Documents

| File | What's in it |
|---|---|
| [DATA_SOURCES.md](DATA_SOURCES.md) | The 7 data sources, each with URL, license, update frequency, CORS, limits and verified gotchas |
| [PLAN.md](PLAN.md) | Architecture decisions, hosting setup, milestones M1–M6 with acceptance checks, and the risk register |
| [CLAUDE.md](CLAUDE.md) | Rules for AI assistants working in this repo |
| [LICENSE](LICENSE) | GPL-3.0 |

## How it works (planned)

```
            build time (GitHub Actions, scheduled)                runtime (visitor's browser)
 ┌───────────────────────────────────────────────┐      ┌──────────────────────────────────────┐
 │ World Bank API ──► data/countries.json  weekly │      │ index.html + globe.gl                │
 │ Wikidata SPARQL ─► data/leaders.json    daily  │─────►│   reads data/*.json (same origin)    │
 │   (opens a PR for human review)                │ Pages│   lazy-loads data/history/*.json     │
 │ iptv-org ───────► data/tv.json          weekly │      │                                      │
 │ historical-basemaps + Natural Earth            │      │ GDELT DOC API ◄── live fetch,        │
 │   ──► simplified GeoJSON (pinned, one-off)     │      │   throttled, cached 15 min           │
 └───────────────────────────────────────────────┘      └──────────────────────────────────────┘
```

**Why most data is fetched at build time.** A static site's browser can only read another server's response if that server allows CORS, and several of these APIs either don't publish their CORS policy or have rate limits. A scheduled GitHub Action fetches the data and commits plain JSON. That isn't a backend, because nothing runs when someone visits. In return the page loads faster, keeps working when an API is down, and each data change shows up as a reviewable diff. News is the only live feed, because it is the only data that must be fresh.

## Running locally (once M1 lands)

No build step is needed. The deployable site is the `public/` folder, so serve that folder with any static server. Opening `index.html` directly from disk won't work, because browsers block `fetch()` on `file://` URLs:

```bash
python3 -m http.server 8000 -d public
# then open http://localhost:8000
```

## Deployment

Cloudflare Pages deploys this repo straight from GitHub:

- Production branch: `main`
- Build command: none
- Output directory: `public`
- Custom domain: `world.jonathansewe.com`

Every push to `main` goes live. Every pull request gets its own preview URL. Full setup steps, including the DNS record, are in [PLAN.md → Hosting](PLAN.md#hosting-cloudflare-pages).

Data refresh scripts (Node 20+):

```bash
node scripts/fetch-worldbank.mjs
node scripts/fetch-leaders.mjs
node scripts/fetch-tv.mjs
```

## Known limitations (by design, not bugs)

- **Borders are snapshots, not year-by-year.** There are 32 historical maps between 600 and 2010. Picking 1850 shows the 1815 map, and the UI says so.
- **"Today" comes from Natural Earth, last released in 2022.** Its borders are de facto (who controls the ground), and disputed areas follow one default point of view.
- **Early maps have gaps.** 57% of polygons in the 600 AD map have no name in the source data.
- **Not every leader is elected.** Monarchs and appointed leaders are shown by office title, so the site never says "elected".
- **News is "from" a country, not "about" it.** GDELT filters by where the outlet is based.
- **TV entries link out to broadcasters' own websites.** The site doesn't embed or re-host streams, and no free list of streams is legally vetted. See DATA_SOURCES.md §5.

## License

Copyright (C) 2026 World Globe contributors.

This project is free software under the **GNU General Public License v3.0**; see [LICENSE](LICENSE). You may redistribute and modify it under those terms. It comes with **no warranty**.

**Why GPL-3.0:** the historical borders dataset (`aourednik/historical-basemaps`) is GPL-3.0. The simplified copies we ship are a modified version of it, so they have to stay GPL-3.0 anyway. Licensing the whole repo the same way avoids a split license that every contributor would need to understand. In practice it means anyone who distributes a modified version of this site must also publish its source under GPL-3.0.

Third-party data keeps its own license, and the site credits each one: World Bank CC BY 4.0 (attribution required), GDELT (citation and link required), Wikidata CC0, Natural Earth public domain, iptv-org public domain, globe.gl MIT. All of these can be combined with a GPL-3.0 project.

## Attribution

World Bank, World Development Indicators (CC BY 4.0) · The GDELT Project · Wikidata · Natural Earth · historical-basemaps by André Ourednik and contributors (GPL-3.0) · iptv-org · globe.gl by Vasco Asturiano.
