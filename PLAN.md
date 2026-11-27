# Plan

Six milestones, plus M3b (wars layer) added after M3. Each one ends with **acceptance checks** that pass or fail and are, where possible, automated. A milestone is done only when every check passes. Data facts and risks referenced here are in [DATA_SOURCES.md](DATA_SOURCES.md).

## Architecture decisions (apply to every milestone)

| Decision | Choice | Why |
|---|---|---|
| Hosting | **Cloudflare Pages**, custom domain `world.jonathansewe.com`, output directory `public/` | Free, static, HTTPS, global CDN, and a preview URL for every branch or PR. The repo doesn't need to be public. See *Hosting* below. |
| License | **GPL-3.0** for the whole repo | Required anyway by the historical borders data, and simpler than a split license. |
| Runtime code | Vanilla ES modules, no framework, no bundler | Small surface, nothing to compile, easy to learn from. |
| Globe | globe.gl `2.46.2`, pinned (vendored in `vendor/`) | MIT, simplest WebGL globe, no token. |
| Slow-changing data | **Build-time snapshots.** Scheduled GitHub Actions fetch the data and commit JSON to `data/` | Avoids CORS and rate-limit risk, makes loads fast and keeps working when an API is down. Not a backend: nothing runs when a visitor loads the page. |
| Live data | Only GDELT news is fetched from the browser | News is the one thing that must be fresh. |
| Join key | One `data/country-index.json` built from Natural Earth: `ISO_A3_EH → {wb, fips, qid, name}` with an override table | Natural Earth's raw codes contain known errors (France/Norway `-99`, Kosovo `KSV` vs `XKX`, missing FIPS). |
| Secrets | **None, ever.** No API keys in the repo or the browser | Every source is keyless. |
| Tests | Node scripts for data validation, Playwright for browser smoke tests | Playwright is already installed in the dev container. |

Planned layout:

```
public/                 ← the ONLY directory Cloudflare Pages publishes
  index.html
  _headers              Cloudflare Pages response headers (cache, security)
  src/                  app modules (globe, panel, slider, news, tv)
  data/                 generated JSON + simplified GeoJSON (committed)
  data/history/         simplified historical borders + SOURCE.md
  vendor/               pinned globe.gl build
  tools/cors-check.html M1 diagnostic page
scripts/                build-time fetch/transform scripts (Node 20+), not deployed
tests/                  Playwright smoke tests + data validators, not deployed
.github/workflows/      scheduled data refresh + CI checks (no deploy job)
LICENSE                 GPL-3.0
```

Why `public/`: Cloudflare Pages serves everything in its output directory. If that were the repo root, `scripts/`, `tests/`, `.github/` and `CLAUDE.md` would be on the public site too.

Throughout this plan, `data/…`, `vendor/…` and `tools/…` mean paths inside `public/`.

### Hosting: Cloudflare Pages

- **Deploy method:** Cloudflare's **Git integration**. Connect the GitHub repo in the Cloudflare dashboard with production branch `main`, build command empty, and output directory `public`. Every push to `main` deploys to production. Every other branch or PR gets a preview at `<branch>.<project>.pages.dev`.
  - This needs **no Cloudflare token in GitHub** and no deploy workflow.
  - The scheduled data Actions commit to `main` (or merge a reviewed PR), and that push triggers the redeploy.
- **Custom domain:** In the Pages project, go to *Custom domains*, add `world.jonathansewe.com`, and only then create the DNS record.
  - If `jonathansewe.com` uses Cloudflare DNS, Cloudflare creates the record itself: a proxied `CNAME world → <project>.pages.dev`.
  - If DNS is elsewhere, create that CNAME at the DNS provider.
  - Creating the CNAME *before* adding the domain in the dashboard gives a 522 error.
- **Free-plan limits to check in M1 (📄 from Cloudflare docs; not verified here):** 500 builds per month, at most 20,000 files per deployment, and at most 25 MiB per file. Our data is far below these, but the scheduled Actions spend builds: roughly 30 daily plus 8 weekly, about 40 per month.
- **Platform note:** Cloudflare now promotes *Workers (static assets)* for new projects, but Pages is still supported. Pages is the choice here because it needs no config file. If Pages is ever deprecated, moving to Workers static assets means adding a `wrangler.jsonc` that points at `public/`.

---

## M1: Skeleton, globe, present-day borders, CORS check

> **Status (2026-11-27): code complete, not done.** Every check that can run without hosting passes (see the boxes below). The checks that need Cloudflare Pages or a real phone browser are still open, because the user can't reach Cloudflare right now. **The user decided on 2026-11-27 to start M2 and M3 in parallel while those checks wait.** This is an explicit exception to "finish one milestone before the next", not a change to M1's checks. M1 stays open until every box is ticked.

**Scope**
- `index.html` renders a globe with Natural Earth **50m** countries (vendored and simplified).
- Hover highlights a country. Click opens a side panel showing its name and codes (ISO3, FIPS, Q-id) from `country-index.json`.
- `scripts/build-country-index.mjs` generates the join table, including overrides.
- `tools/cors-check.html` calls every runtime candidate endpoint from a real browser and prints `ok / blocked` per host.
- Cloudflare Pages project connected to the repo (output dir `public`), with custom domain `world.jonathansewe.com`.
- `public/_headers` sets long-lived caching for `data/history/*` and `vendor/*`, and short caching for the other `data/*.json`.

**Acceptance checks**
- [ ] The site is live at **https://world.jonathansewe.com** with a valid TLS certificate, and the console shows no errors on Chrome, Firefox and Safari (latest).
- [ ] Only `public/` is deployed: `https://world.jonathansewe.com/scripts/`, `/tests/` and `/CLAUDE.md` all return 404.
- [ ] A pull request gets a working preview URL, and merging to `main` updates production with no manual step.
- [ ] `curl -I` on a history file shows the long `Cache-Control` set in `_headers`.
- [ ] The Cloudflare free-plan limits are confirmed in the Cloudflare docs and recorded here (replacing the 📄 tag).
- [x] The globe shows every feature of the 50m file. Clicking France shows `FRA`, Norway `NOR`, Kosovo `XKX` (the `-99` trap is handled). *(2026-11-27: `npm run validate` and `npm test` pass.)*
- [x] The validator confirms every feature has a non-empty, unique join key. Unmatched features are listed explicitly, not silently dropped. *(2026-11-27: `npm run validate` and `npm test` pass.)*
- [ ] `cors-check.html` results for GDELT, World Bank and Wikidata are recorded in `DATA_SOURCES.md`, and every ⚠️ item there becomes ✅ or ❌.
- [ ] The GDELT news architecture is decided from that result (direct fetch, JSONP, or build-time headlines) and written into this plan.
- [ ] Initial page weight is ≤ 1.5 MB gzipped. First globe render takes ≤ 3 s on desktop broadband (Lighthouse, throttling off).
- [x] Works at 390 px wide (phone): the panel becomes a bottom sheet and nothing scrolls sideways. *(2026-11-27: `npm run validate` and `npm test` pass.)*
- [x] With WebGL disabled, the page shows a readable fallback message instead of a blank page. *(2026-11-27: `npm run validate` and `npm test` pass.)*

## M2: Country statistics (World Bank)

> **Status (2026-11-27): 5 of 6 checks pass.** Open: the spot check against data.worldbank.org, which couldn't be reached from the build container.

**Scope**
- `scripts/fetch-worldbank.mjs` downloads `SP.POP.TOTL` and `SP.DYN.CBRT.IN` with `mrnev=1`, drops aggregates (`region.id == "NA"`), and writes `data/countries.json` with value, year and `lastupdated`.
- A weekly scheduled Action reruns the script and commits only if the data changed.
- The panel shows population and birth rate, each with its **year** and source. A choropleth toggle colours countries by either metric.

**Acceptance checks**
- [x] `countries.json` contains no aggregates. The validator fails if an ID like `WLD`, `EUU` or `HIC` appears. *(2026-11-27: Action run 46080333000 wrote 217 countries and excluded 79 aggregates; validator checks a 48-code aggregate list)*
- [x] Every Natural Earth feature with a World Bank code shows values. Taiwan, Western Sahara and the other no-data features show "No data", never `0`. *(2026-11-27: validator lists the 27 features with no World Bank series of their own; smoke test shows Taiwan as "No data")*
- [ ] Spot check: Germany, India, Nigeria, Brazil and Japan match data.worldbank.org exactly (value and year).
- [x] Every number displays its year and a "World Bank, WDI (CC BY 4.0)" credit. *(2026-11-27: smoke test (Germany: 83,491,249 (2025), 8.1 per 1,000 (2024)))*
- [x] The choropleth legend uses a colour-blind-safe scale, and the classes are labelled with real values. *(2026-11-27: viridis, quintile classes labelled e.g. 3.6M – 10.9M, plus No data)*
- [x] Running the Action twice with no upstream change produces **no** commit (idempotent). *(2026-11-27: second run 46083940730 succeeded and committed nothing)*

## M3: Historical borders and the time slider (600 → today)

> **Status (2026-11-27): every acceptance check passes** in the test container (software WebGL). It goes live with M1's hosting. Frame rate on a real phone is not covered by these checks and should be looked at once the site is up.

**Scope**
- `scripts/build-history.mjs` downloads the 32 snapshots (600 to 2010) at a **pinned commit**, simplifies them with mapshaper and writes `public/data/history/world_<year>.json` plus `SOURCE.md`, which records the upstream repo, commit and simplification settings. That record is what GPL-3.0 needs for a modified work.
- The slider covers 600 to the present year. It snaps to the latest snapshot ≤ the chosen year, shows "Showing borders of 1815", and "present" uses Natural Earth.
- Polygons are coloured by `SUBJECTO`, so colonies take their ruler's colour. `BORDERPRECISION` 1 is drawn with dashed or softer edges. Unnamed polygons are labelled "Unnamed / unknown polity".
- When the year isn't "present", the modern panels (statistics, leaders, news, TV) are hidden or clearly marked "present-day data".

**Acceptance checks**
- [x] All 32 snapshots plus "present" load. Each simplified file is ≤ 400 KB gzipped, and the validator checks this. *(2026-11-27: largest is 1492 at 330 KB)*
- [x] Snapshots are fetched lazily, only when selected. After the first load, switching between cached snapshots takes ≤ 1 s. *(2026-11-27: 130 ms in software WebGL, smoke test; real-phone timing still to confirm)*
- [x] Correctness spot checks, using the source's exact `NAME`s (verified 2026-11-27): 600 has "Eastern Roman Empire" and "Sasanian Empire", 1914 has "Austro-Hungarian Empire", 1945 has "Austria" and "Hungary" separately, and 2010 has "Sudan" but no South Sudan while present day (Natural Earth) has both. *(2026-11-27: smoke test)*
- [x] Dragging the slider end-to-end 10 times doesn't grow memory by more than 50 MB (Chrome DevTools heap snapshot), so old layers are disposed. *(2026-11-27: `npm run test:memory`, JS heap after forced GC grew 0.0 MB; GPU memory not measured)*
- [x] Keyboard: arrow keys step one snapshot, Home/End jump to 600 and present, and the slider has an ARIA label with the current year. *(2026-11-27: smoke test)*
- [x] The GPL-3.0 notice, the link to `LICENSE` and the link to the source repo are visible in About, and `public/data/history/SOURCE.md` names the pinned upstream commit. *(2026-11-27: smoke test and validator; SOURCE.md lives in `data/history/<commit>-v1/`)*

## M3b: Wars layer (major wars through time)

Added 2026-11-27 at the user's request. Built only after M3 is done, because it reuses the M3 time slider.

**Scope**
- **Step 1, source audit (no code):** before any data is used, add a "Wars" section to `DATA_SOURCES.md` covering at least Wikidata (wars with start/end dates and locations) and one independent conflict dataset. For each: URL, license, coverage in years, and what it says about dates and casualties. Every fact gets a ✅ / 📄 / ⚠️ tag. If no candidate has a license compatible with GPL-3.0, stop and report.
- **Curated list, not a query:** `data-src/wars.csv` holds a hand-picked list of about 50 major wars from 600 to today. Each row has a stable id, English and French names, start year, end year, a representative point (lat/lon), the main belligerents, and **at least two sources** (URLs). "Major" is decided by the list, not by a casualty threshold, because casualty figures are disputed and inconsistent across sources. The selection rule is written at the top of the file.
- `scripts/build-wars.mjs` turns the CSV into `public/data/wars.json`. `scripts/validate-data.mjs` checks it.
- On the globe, a war appears as a marker when the slider year falls between its start and end years. Clicking it opens the panel with its names, dates, belligerents and source links. A toggle shows or hides the layer.
- Uncertain dates are shown as uncertain (for example "c. 1450"), never as precise.

**Acceptance checks**
- [ ] `DATA_SOURCES.md` has a "Wars" section with license and coverage for each candidate source, and every item is tagged.
- [ ] The validator fails the build if any war has no start year, no end year, an end year before its start year, fewer than two source URLs, or a point outside valid lat/lon ranges.
- [ ] Spot checks: at slider year 1340 the Hundred Years' War is shown. At 1917 World War I is shown. At 1950 the Korean War is shown and World War II is not.
- [ ] Every source URL in `wars.json` returns HTTP 200 when checked by a script (dead links are listed, not silently dropped).
- [ ] With the layer on, dragging the slider end-to-end stays as smooth as M3 without it (no new frame drops on the reference phone), and `wars.json` is ≤ 100 KB gzipped.
- [ ] The toggle works by keyboard and has an ARIA label. Markers have a text label for screen readers.
- [ ] About lists the wars data sources and their licenses.

## M4: Heads of state and government (Wikidata)

**Scope**
- `scripts/fetch-leaders.mjs` runs the SPARQL query (draft in DATA_SOURCES.md) over the `WIKIDATAID`s from `country-index.json`. It uses a descriptive User-Agent and writes `data/leaders.json`.
- A daily Action opens a **pull request** (not a direct commit) when any leader changes, so a human reviews the diff. This guards against vandalism.
- The panel shows each holder's name, office label ("Head of state" / "Head of government"), start date and a Wikidata link.

**Acceptance checks**
- [ ] ≥ 190 of the UN member states have at least one current head of state or government. The validator lists the countries that are missing.
- [ ] Multiple holders are shown, not truncated: Andorra (2 co-princes), San Marino (2 Captains Regent), Switzerland (Federal Council).
- [ ] No person with an end date (`P582`) appears. The validator re-checks this.
- [ ] A spot check of 10 countries matches each government's official website on the check date, and the date is recorded in the PR.
- [ ] The UI never uses the word "elected" (grep check in CI), because monarchs and appointed leaders are included.
- [ ] Leaving the endpoint URL as one config constant means a WDQS endpoint change is a one-line fix.

## M5: Live news per country (GDELT)

**Scope**
- Opening a country's panel fetches up to 20 recent articles from outlets **based in** that country (`sourcecountry:<FIPS>`, `timespan=24h`, `sort=datedesc`). The transport is whichever M1 decided on.
- The FIPS override table covers Norway, Israel, Palestine, South Sudan, N. Cyprus and Somaliland.
- A global throttle allows at most 1 request per 5 s. Results are cached in `sessionStorage` for 15 min, and nothing is fetched on hover.
- Each item shows title, outlet domain, time ago and language, and opens in a new tab with `rel="noopener noreferrer"`. Items are de-duplicated by URL and title.
- Clear states for loading, no articles, rate-limited and unavailable.

**Acceptance checks**
- [ ] The accepted `sourcecountry` format is confirmed and recorded in DATA_SOURCES.md.
- [ ] 20 random countries plus the 6 override countries each return articles or the explicit "no recent articles" state. The Playwright test passes.
- [ ] Opening 10 countries quickly sends ≤ 1 request per 5 s (checked in the network log), and a reopen within 15 min sends **0** requests.
- [ ] A forced 429 (mocked in the test) shows the rate-limit message and the panel keeps working.
- [ ] The "News data: The GDELT Project" credit and link appear under the list.
- [ ] Article titles are inserted as text, not HTML (XSS check: a test with a title like `<img onerror>` renders literally).

## M6: Official TV links and launch hardening

**Scope**
- `scripts/fetch-tv.mjs` filters iptv-org `channels.json`: not NSFW, not on the blocklist, not closed, with an `https` website. It merges in `data/tv-allowlist.json` (hand-verified public broadcasters' official live pages) and writes `data/tv.json`, which must stay ≤ 300 KB.
- The panel lists channels per country, allowlisted public broadcasters first. Every entry **links out** to the official site, and no video is embedded.
- A weekly link-check Action sends a `HEAD` request to every URL and opens an issue listing dead links.
- Hardening: an About/attribution page, country search box, deep links (`#country=DEU&year=1914`), and a final pass on accessibility and performance.

**Acceptance checks**
- [ ] `tv.json` contains zero NSFW, blocklisted or closed channels, and zero `http://` links (the validator checks each).
- [ ] No `<video>`/`<iframe>`/hls player exists in the codebase (grep check in CI).
- [ ] ≥ 50 countries have at least one allowlisted public broadcaster, each verified by hand with the date recorded.
- [ ] The link check runs green, or the issues it opens are triaged.
- [ ] The About page lists every source with its license and the required attributions (World Bank, GDELT, GPL notice).
- [ ] Lighthouse scores ≥ 90 for Accessibility and Best Practices, and ≥ 80 for Performance on mobile.
- [ ] Deep link `#country=DEU&year=1914` opens on Germany in 1914.
- [ ] README describes how to run the site, the architecture and the licenses as they are at launch.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GDELT has no CORS | Medium | News feature needs a different transport | M1 test. JSONP, then build-time headlines. |
| GPL-3.0 obligations (source availability, license notice) | Certain | Legal | **Resolved:** whole repo is GPL-3.0, the source is on GitHub, and the About page links to it and to `LICENSE`. |
| Cloudflare build quota or Pages deprecation | Low | Deploys stop | ~40 builds per month against a 500 limit. Migration path to Workers static assets noted under *Hosting*. |
| Wikidata vandalism shows a wrong leader | Low/Medium | Embarrassing | PR review gate in M4. |
| WDQS endpoint migration (2026–27) | Medium | Leader refresh breaks | One config constant, and the Action fails loudly. |
| Natural Earth stale (2022) | Certain | Minor border inaccuracies | Honest "Natural Earth 2022" label. |
| iptv-org links legally questionable | Medium | Legal | Link out only, allowlist first, blocklist filter. |
| Wars data disputed or license unclear | Medium | Wrong dates, or a layer that can't ship | Source audit first in M3b, two sources per war, curated list, uncertain dates shown as uncertain. |
| mapshaper writes polygon rings in the direction globe.gl reads as "everything except this shape" | Certain (happened) | Whole globe painted, 20 s+ loads | **Resolved 2026-11-27:** `scripts/lib/rewind.mjs` in both build scripts; the validator fails on any inverted polygon. |
| GeoJSON too heavy for phones | High without simplification | Low FPS | Size budgets enforced in validators. |
