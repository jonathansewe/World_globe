# Plan

Six milestones. Each one ends with **acceptance checks** that pass or fail and are, where possible, automated. A milestone is done only when every check passes. Data facts and risks referenced here are in [DATA_SOURCES.md](DATA_SOURCES.md).

## Architecture decisions (apply to every milestone)

| Decision | Choice | Why |
|---|---|---|
| Hosting | GitHub Pages | Free, static, HTTPS. The free plan needs a **public** repo. |
| Runtime code | Vanilla ES modules, no framework, no bundler | Small surface, nothing to compile, easy to learn from. |
| Globe | globe.gl `2.46.2`, pinned (vendored in `vendor/`) | MIT, simplest WebGL globe, no token. |
| Slow-changing data | **Build-time snapshots.** Scheduled GitHub Actions fetch the data and commit JSON to `data/` | Avoids CORS and rate-limit risk, makes loads fast and keeps working when an API is down. Not a backend: nothing runs when a visitor loads the page. |
| Live data | Only GDELT news is fetched from the browser | News is the one thing that must be fresh. |
| Join key | One `data/country-index.json` built from Natural Earth: `ISO_A3_EH → {wb, fips, qid, name}` with an override table | Natural Earth's raw codes contain known errors (France/Norway `-99`, Kosovo `KSV` vs `XKX`, missing FIPS). |
| Secrets | **None, ever.** No API keys in the repo or the browser | Every source is keyless. |
| Tests | Node scripts for data validation, Playwright for browser smoke tests | Playwright is already installed in the dev container. |

Planned layout:

```
index.html
src/            app modules (globe, panel, slider, news, tv)
data/           generated JSON + simplified GeoJSON (committed)
data/history/   GPL-3.0 simplified historical borders + LICENSE
scripts/        build-time fetch/transform scripts (Node 20+)
tools/          cors-check.html (M1 diagnostic page)
tests/          Playwright smoke tests + data validators
.github/workflows/  pages deploy + scheduled data refresh
```

---

## M1: Skeleton, globe, present-day borders, CORS check

**Scope**
- `index.html` renders a globe with Natural Earth **50m** countries (vendored and simplified).
- Hover highlights a country. Click opens a side panel showing its name and codes (ISO3, FIPS, Q-id) from `country-index.json`.
- `scripts/build-country-index.mjs` generates the join table, including overrides.
- `tools/cors-check.html` calls every runtime candidate endpoint from a real browser and prints `ok / blocked` per host.
- A GitHub Pages deploy workflow.

**Acceptance checks**
- [ ] The site is live at the GitHub Pages URL over HTTPS, and the console shows no errors on Chrome, Firefox and Safari (latest).
- [ ] The globe shows every feature of the 50m file. Clicking France shows `FRA`, Norway `NOR`, Kosovo `XKX` (the `-99` trap is handled).
- [ ] The validator confirms every feature has a non-empty, unique join key. Unmatched features are listed explicitly, not silently dropped.
- [ ] `cors-check.html` results for GDELT, World Bank and Wikidata are recorded in `DATA_SOURCES.md`, and every ⚠️ item there becomes ✅ or ❌.
- [ ] The GDELT news architecture is decided from that result (direct fetch, JSONP, or build-time headlines) and written into this plan.
- [ ] Initial page weight is ≤ 1.5 MB gzipped. First globe render takes ≤ 3 s on desktop broadband (Lighthouse, throttling off).
- [ ] Works at 390 px wide (phone): the panel becomes a bottom sheet and nothing scrolls sideways.
- [ ] With WebGL disabled, the page shows a readable fallback message instead of a blank page.

## M2: Country statistics (World Bank)

**Scope**
- `scripts/fetch-worldbank.mjs` downloads `SP.POP.TOTL` and `SP.DYN.CBRT.IN` with `mrnev=1`, drops aggregates (`region.id == "NA"`), and writes `data/countries.json` with value, year and `lastupdated`.
- A weekly scheduled Action reruns the script and commits only if the data changed.
- The panel shows population and birth rate, each with its **year** and source. A choropleth toggle colours countries by either metric.

**Acceptance checks**
- [ ] `countries.json` contains no aggregates. The validator fails if an ID like `WLD`, `EUU` or `HIC` appears.
- [ ] Every Natural Earth feature with a World Bank code shows values. Taiwan, Western Sahara and the other no-data features show "No data", never `0`.
- [ ] Spot check: Germany, India, Nigeria, Brazil and Japan match data.worldbank.org exactly (value and year).
- [ ] Every number displays its year and a "World Bank, WDI (CC BY 4.0)" credit.
- [ ] The choropleth legend uses a colour-blind-safe scale, and the classes are labelled with real values.
- [ ] Running the Action twice with no upstream change produces **no** commit (idempotent).

## M3: Historical borders and the time slider (600 → today)

**Scope**
- `scripts/build-history.mjs` downloads the 32 snapshots (600 to 2010) at a **pinned commit**, simplifies them with mapshaper and writes `data/history/world_<year>.json` plus GPL-3.0 `LICENSE` and `SOURCE.md`.
- The slider covers 600 to the present year. It snaps to the latest snapshot ≤ the chosen year, shows "Showing borders of 1815", and "present" uses Natural Earth.
- Polygons are coloured by `SUBJECTO`, so colonies take their ruler's colour. `BORDERPRECISION` 1 is drawn with dashed or softer edges. Unnamed polygons are labelled "Unnamed / unknown polity".
- When the year isn't "present", the modern panels (statistics, leaders, news, TV) are hidden or clearly marked "present-day data".

**Acceptance checks**
- [ ] All 32 snapshots plus "present" load. Each simplified file is ≤ 400 KB gzipped, and the validator checks this.
- [ ] Snapshots are fetched lazily, only when selected. After the first load, switching between cached snapshots takes ≤ 1 s.
- [ ] Correctness spot checks, using the source's exact `NAME`s (verified 2026-11-27): 600 has "Eastern Roman Empire" and "Sasanian Empire", 1914 has "Austro-Hungarian Empire", 1945 has "Austria" and "Hungary" separately, and 2010 has "Sudan" but no South Sudan while present day (Natural Earth) has both.
- [ ] Dragging the slider end-to-end 10 times doesn't grow memory by more than 50 MB (Chrome DevTools heap snapshot), so old layers are disposed.
- [ ] Keyboard: arrow keys step one snapshot, Home/End jump to 600 and present, and the slider has an ARIA label with the current year.
- [ ] The GPL-3.0 notice and source link are visible in About, and `data/history/LICENSE` exists.

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
| GPL-3.0 on historical data forces a repo-license decision | Certain | Legal | Decide before M3 (see README). |
| Wikidata vandalism shows a wrong leader | Low/Medium | Embarrassing | PR review gate in M4. |
| WDQS endpoint migration (2026–27) | Medium | Leader refresh breaks | One config constant, and the Action fails loudly. |
| Natural Earth stale (2022) | Certain | Minor border inaccuracies | Honest "Natural Earth 2022" label. |
| iptv-org links legally questionable | Medium | Legal | Link out only, allowlist first, blocklist filter. |
| GeoJSON too heavy for phones | High without simplification | Low FPS | Size budgets enforced in validators. |
