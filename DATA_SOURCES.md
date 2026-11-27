# Data Sources

Research date: **2026-11-27**. Seven free sources, one per feature. For each one this file gives the URL, license, update frequency, CORS support, limits, and the gotchas found while checking it.

## How each fact was checked

Not every fact here was checked the same way, so each one is tagged:

| Tag | Meaning |
|---|---|
| ✅ **Verified** | Checked directly on 2026-11-27, by probing the endpoint with an `Origin:` header or by inspecting the source repository and its files. |
| 📄 **Documented** | Taken from official docs, bug trackers or web search. Not probed: the research environment's network policy blocked these hosts (`api.worldbank.org`, `query.wikidata.org`, `api.gdeltproject.org`, `iptv-org.github.io`, `cdn.jsdelivr.net`, `naturalearthdata.com`). |
| ⚠️ **Unverified** | Not settled. It is tested in **M1** (see [PLAN.md](PLAN.md)) before any feature depends on it. |

> **Why CORS matters.** A static site has no server of its own, so the visitor's browser makes every request. The browser only lets JavaScript read a cross-origin response when the server sends `Access-Control-Allow-Origin` (`*` or our origin). When that header is missing, the request fails and nothing on our side can fix it. The only options are JSONP, a proxy (which is a backend), or fetching the data at **build time** instead. That is why the architecture below splits sources into *runtime* and *build-time*.

---

## Summary

| # | Source | Feature | License | Updates | CORS | Fetched |
|---|---|---|---|---|---|---|
| 1 | World Bank Indicators API v2 | Population, birth rate | CC BY 4.0 📄 | A few times a year; data lags 1–2 yrs | ⚠️ Reported `*` (old forum post) | Build time |
| 2 | Wikidata Query Service (SPARQL) | Heads of state and government | CC0 📄 | Minutes (live edits) | 📄 `*` reported on Phabricator | Build time (plus optional live refresh) |
| 3 | `aourednik/historical-basemaps` | Historical borders 600 → 2010 | **GPL-3.0** ✅ | Irregular (last commit 2026-11-02) ✅ | ✅ `*` via raw.githubusercontent.com | Vendored (simplified copies) |
| 4 | GDELT DOC 2.0 API | Live news per country | Free; citation and link required 📄 | Every 15 min 📄 | ⚠️ Unknown | **Runtime** |
| 5 | `iptv-org` API/database | TV channel list and official websites | CC0 / Unlicense ✅ | About every 1.5 h ✅ | 📄 GitHub Pages sends `*` | Build time (filtered) |
| 6 | globe.gl | 3D globe rendering | MIT ✅ | v2.46.2 (2026-08-22) ✅ | 📄 jsDelivr sends `*` | Pinned CDN or vendored |
| 7 | Natural Earth | Present-day borders and join keys | Public domain ✅ | **Stale: v5.1.2, 2022-05-13** ✅ | ✅ `*` via raw.githubusercontent.com | Vendored |

---

## 1. World Bank Indicators API v2

- **Base URL:** `https://api.worldbank.org/v2/`
- **Indicators:**
  - `SP.POP.TOTL`: Population, total
  - `SP.DYN.CBRT.IN`: Birth rate, crude (per 1,000 people)
- **Example (latest non-empty value for every economy in one call):**
  `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400`
  - `mrv=N` returns the N most recent values, empty ones included. `mrnev=N` skips empty values, so use `mrnev`.
  - Several countries go in one call, separated by semicolons: `country/DEU;FRA;JPN/...`
  - The response is `[metadata, rows]`. The metadata includes `lastupdated`, which the site should show as "data as of".
- **License:** CC BY 4.0 for most WDI series 📄. Attribution is **required**: "Source: World Bank, World Development Indicators".
- **Update frequency:** The WDI database is refreshed several times a year 📄. Values lag: population usually trails by about 1 year, and birth rate (sourced from UN WPP) by about 1–2 years. Always show the year next to each value.
- **CORS:** ⚠️ A 2015–2017 World Bank developer forum thread shows `Access-Control-Allow-Origin: *` on v2 country responses, but that is old. A JSONP mode (`format=jsonp&prefix=cb`) has been reported 📄. Not probed here.
- **Limits:** No official rate limit is published 📄. No API key is needed. Community guidance is to keep requests to 1–2 per second.
- **Gotchas (verified against Natural Earth data ✅):**
  - `country/all` also returns **aggregates** such as "World", "Euro area" and "Low income". Filter them out using `/v2/country?format=json&per_page=400`, where aggregates have `region.id == "NA"`.
  - Natural Earth's `WB_A3` field is **wrong for the live API**: it gives `KSV` for Kosovo (the API uses `XKX`) and `WBG` for Palestine (the API uses `PSE`). Join on Natural Earth `ISO_A3_EH` and keep a small override table.
  - Taiwan and Western Sahara have no World Bank data. Show "No data", never 0.
- **Verified 2026-11-27 ✅ (GitHub Actions run 46080333000):** the API answered from a GitHub runner with no key. `/v2/country` returned 296 entries, 79 of them aggregates with `region.id == "NA"`, leaving 217 countries. Kosovo is `XKX` and Palestine `PSE` in the API, as noted above. Both indicators had `lastupdated` 2026-11-11. Latest years: population 2025, birth rate 2024. Browser CORS is still unverified, and the build path doesn't need it.
- **Decision:** Fetch at **build time** with a scheduled GitHub Action and commit the result as `data/countries.json`. This avoids the CORS risk and about 400 requests per visitor, and it makes the site load faster. Two indicators for about 270 entries is small. Data that changes a few times a year doesn't need to be live.

## 2. Wikidata Query Service (SPARQL)

- **Endpoint:** `https://query.wikidata.org/sparql?query=<urlencoded>&format=json` (GET or POST)
- **Properties:** `P35` head of state, `P6` head of government, `P580` start time, `P582` end time, `P298` ISO 3166-1 alpha-3.
- **License:** Structured data is **CC0** 📄, so no attribution is required (crediting it is still good practice). Images on Wikimedia Commons have **per-file licenses**, so v1 does not show leader photos.
- **Update frequency:** Live. Edits usually reach the query service within minutes 📄. That cuts both ways: fixes arrive quickly, and so can vandalism.
- **CORS:** 📄 A Wikimedia Phabricator report states that `query.wikidata.org` sends `access-control-allow-origin: *`. Not probed here.
- **Limits (📄 from the WDQS User Manual):**
  - Hard **60-second** timeout per query.
  - Each client (User-Agent + IP) gets **60 seconds of processing time per 60 seconds**.
  - **30 failed queries per minute** per client.
  - `429 Too Many Requests` means back off.
  - A descriptive **User-Agent** is required, and requests without one can get a 403. Browsers do **not** let JavaScript set `User-Agent`, which is another reason to query from a build script.
- **Platform changes:**
  - The 2025 graph split moved scholarly articles to a separate endpoint 📄. That doesn't affect us: country and leader items are in the main graph.
  - The WDQS manual says the service is **migrating to a new backend in 2026–2027, with new endpoint URLs** 📄. Keep the endpoint URL in **one config constant**.
- **Draft query (documentation only, to be validated in M4):**
  ```sparql
  SELECT ?country ?iso3 ?role ?person ?personLabel ?start WHERE {
    VALUES ?country { wd:Q183 wd:Q142 }        # filled from Natural Earth WIKIDATAID
    ?country wdt:P298 ?iso3 .
    VALUES (?prop ?role) { (p:P35 "head_of_state") (p:P6 "head_of_government") }
    ?country ?prop ?st .
    ?st ?psprop ?person .
    FILTER(STRSTARTS(STR(?psprop), "http://www.wikidata.org/prop/statement/"))
    FILTER NOT EXISTS { ?st pq:P582 ?end }     # still in office
    ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
    OPTIONAL { ?st pq:P580 ?start }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  ```
- **Gotchas:**
  - Select countries by the **`WIKIDATAID` already in Natural Earth** (for example Germany = `Q183`, verified ✅), not by the class "sovereign state" (`Q3624078`). Class membership is inconsistent for partially recognised states.
  - Expect **several holders** in some countries: Andorra has two co-princes, Switzerland's head of state is a 7-member council, and San Marino has two Captains Regent.
  - **"Elected" can't be guaranteed.** Monarchs and appointed or military leaders are heads of state too, and Wikidata has no reliable "was elected" flag. The UI labels each person by their **office**, never as "elected leader".
- **Decision:** Snapshot at **build time** (a daily GitHub Action). The Action opens a PR when leaders change, so a human reviews the diff before it ships.

## 3. Historical borders: `aourednik/historical-basemaps`

- **Repo:** https://github.com/aourednik/historical-basemaps
- **File URL pattern:** `https://raw.githubusercontent.com/aourednik/historical-basemaps/<commit>/geojson/world_<year>.geojson`
- **Coverage from 600 AD ✅:** 32 snapshots: **600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010.** It also has BC snapshots, which we don't use.
  - These are snapshots, **not year-by-year borders**. Moving the slider to 1850 shows the **1815** map, and the UI must say "showing map of 1815".
  - **Nothing after 2010.** "Today" comes from Natural Earth (source 7).
- **Schema ✅:** Every feature is a `MultiPolygon` with `NAME`, `ABBREVN`, `SUBJECTO` (the controlling power, useful for colouring colonies), `PARTOF` and `BORDERPRECISION` (1 = approximate, 2 = moderately precise, 3 = set by international law).
- **Size ✅:** The 32 snapshots from 600 onward total **45.2 MB** raw, at 1.0–3.3 MB each. They have to be simplified (mapshaper) before shipping.
- **Data quality ✅:** In `world_600`, **116 of 204 polygons (57%) have no `NAME`**. The figures are 33/177 in 1914 and 42/240 in 2010. The README says it is "**work in progress**" and asks users to verify the maps before using them in academic work. The UI shows unnamed regions as "Unnamed / unknown polity", not as blanks.
- **License ✅: GPL-3.0.** This is the strongest constraint in the project. The simplified files we ship are a modified version, so they must stay GPL-3.0, ship with the license text, and credit the source. **Resolved:** the whole repo is GPL-3.0 (see [LICENSE](LICENSE) and [README.md](README.md#license)).
- **Update frequency ✅:** Irregular, community-driven (last commit 2026-11-02). Pin a commit hash.
- **CORS ✅:** `raw.githubusercontent.com` returns `access-control-allow-origin: *` and `cache-control: max-age=300`. GitHub says raw URLs are not a CDN and may be rate-limited, so **we vendor the files** rather than hot-linking.
- **Alternative considered:** CShapes 2.0 (ETH Zürich) has year-accurate borders, but only for 1886–2019 and under a **non-commercial** license. It doesn't reach 600 AD, so it was rejected as the primary source.

## 4. GDELT DOC 2.0 API (news)

- **Endpoint:** `https://api.gdeltproject.org/api/v2/doc/doc`
- **Example:** `?query=sourcecountry:GM&mode=artlist&format=json&maxrecords=50&timespan=24h&sort=datedesc`
- **Parameters (📄):**
  - `maxrecords` is at most **250**, with no pagination. Asking for more returns HTTP 200 with an *error message in the body*, so always check the body.
  - `timespan` can look back **at most 3 months** (the rolling window).
  - Output is `format=json`. JSONP was reported but not confirmed ⚠️.
- **License:** "Unlimited and unrestricted use for any academic, commercial, or governmental use", with redistribution allowed. **A citation to the GDELT Project and a link to gdeltproject.org are required** 📄.
- **Update frequency:** Every 15 minutes 📄.
- **CORS:** ⚠️ **Unknown, and the biggest technical risk.** No source confirms either way. M1 tests it. If CORS is missing, the fallback order is JSONP, then a build-time "latest headlines" snapshot refreshed by a GitHub Action every few hours. That is less live, but it is still a static site.
- **Limits:** Rate-limited but no number is published officially. Community clients use about **1 request per 5 seconds** 📄. Throttled requests can return 429 intermittently. The site enforces a global client-side throttle of ≥ 5 s and caches each country for 15 min in `sessionStorage`.
- **Gotchas:**
  - `sourcecountry:` filters by **where the outlet is based**, not what the story is about. "News from Germany" and "news about Germany" are different queries, and v1 uses "from".
  - GDELT uses **FIPS 10-4** country codes, not ISO. For example Germany is `GM`, not `DE` ✅ (from Natural Earth `FIPS_10`). Natural Earth's `FIPS_10` is **missing (`-99`) for Norway, Israel, Palestine, N. Cyprus, Somaliland and South Sudan** ✅, so a manual override table is needed. Sources conflict on whether the operator wants upper-case codes or names like `unitedstates`, and M5 settles it empirically.
  - Articles are machine-collected and machine-translated. Titles can be clickbait or duplicated, so de-duplicate by URL and title.

## 5. TV streams: `iptv-org`

**Blunt finding: no authoritative, legally vetted list of official TV live streams exists.** The best free dataset is iptv-org, and it is **not** a legal guarantee.

- **URLs:**
  - `https://iptv-org.github.io/api/channels.json` (7.6 MB ✅): includes `website` ("Official website URL"), `country`, `categories`, `is_nsfw`, `closed`
  - `https://iptv-org.github.io/api/streams.json` (3.9 MB ✅): includes `url` and `labels` (`Geo-blocked`, `Not 24/7`)
  - `https://iptv-org.github.io/api/blocklist.json` (0.1 MB ✅): `reason` is `dmca` or `nsfw`
- **License ✅:** Repo and API are public domain (Unlicense text; the README shows a CC0 badge).
- **Legal status (✅ quoted from the README):** It contains "user-submitted links to publicly available video stream URLs, which **to the best of our knowledge** have been intentionally made publicly by the copyright holders". The links are **not individually verified** as authorised.
- **Update frequency ✅:** The API on GitHub Pages is redeployed about every 1.5 hours (three deploys on 2026-11-27 between 06:05 and 09:11 UTC).
- **CORS:** 📄 GitHub Pages serves `Access-Control-Allow-Origin: *`. Not probed here.
- **Limits:** GitHub Pages soft bandwidth limit of about 100 GB per month. At 7.6 MB, `channels.json` is far too large to load on every visit.
- **Policy for this project (to stay on the legal side):**
  1. **Link out, don't embed.** The site opens the broadcaster's **own official website** (`channels.website`) in a new tab. We never re-host or proxy video.
  2. Include only channels that are **not** `is_nsfw`, **not** in `blocklist.json`, **not** `closed`, and have an `https` `website`.
  3. Prefer public broadcasters, via an optional **hand-verified allowlist** (`data/tv-allowlist.json`) with each broadcaster's official live page.
  4. Never embed a raw `m3u8` from `streams.json` unless its host matches the channel's official website domain. Embedding is out of scope for v1. Many streams are geo-blocked, served over `http` (which the browser blocks on an `https` page as mixed content), or sent without CORS headers, so hls.js couldn't play them anyway.
- **Decision:** A filtered **build-time** snapshot of a few hundred KB.

## 6. Globe library: globe.gl

- **Repo:** https://github.com/vasturiano/globe.gl
- **CDN:** `https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js`. **Always pin the exact version.**
- **License ✅:** MIT.
- **Version ✅:** `2.46.2`, latest commit 2026-08-22. Built on three.js `>=0.179 <1` and `three-globe ^2.45`.
- **Relevant API ✅:**
  - `polygonsData`, `polygonCapColor` and `onPolygonClick(polygon, event, {lat,lng,altitude})` for clickable countries
  - `hexPolygonsData` as a lighter-weight alternative
- **CORS:** 📄 jsDelivr serves `Access-Control-Allow-Origin: *`. To remove the third-party dependency at runtime, vendor the minified build into `vendor/`.
- **Limits:**
  - **WebGL required.** Show a clear fallback message without it.
  - Polygon count drives the frame rate, especially on phones. Simplify the GeoJSON, and remove the previous layer's objects when the slider moves so memory doesn't leak.
- **Alternatives considered:** CesiumJS (heavy, and the free Cesium ion service needs a token) and MapLibre GL globe (more of a 2D map). globe.gl is the simplest fit for a static, key-free site.

## 7. Natural Earth (present-day borders and the join keys)

- **Repo:** https://github.com/nvkelso/natural-earth-vector (GeoJSON in `/geojson`). Site: https://www.naturalearthdata.com
- **Files ✅:**
  - `ne_110m_admin_0_countries.geojson`: 177 features
  - `ne_50m_admin_0_countries.geojson`: 2.9 MB. Recommended, because it includes small states that 110m drops.
  - `ne_10m_admin_0_countries.geojson`: 12.7 MB
- **License ✅:** **Public domain** ("All versions of Natural Earth raster + vector map data ... are in the public domain").
- **Update frequency ✅: stale.** The latest release tag is **v5.1.2 (2022-05-13)**, and the default branch's last commit is 2022-06-02 (`VERSION` says `5.2.0-pre`). Label the "today" layer honestly as "Present day (Natural Earth 2022)".
- **CORS ✅:** `raw.githubusercontent.com` sends `*`. Vendored anyway.
- **Why it matters beyond geometry:** It carries the codes we use to join every other source ✅. Germany, for example, has `ISO_A3`=`DEU`, `FIPS_10`=`GM` and `WIKIDATAID`=`Q183`. That gives one table connecting World Bank (ISO3), GDELT (FIPS) and Wikidata (Q-id).
- **Gotchas ✅ (verified on the 110m file):**
  - `ISO_A3` is `-99` for **France and Norway**, the classic Natural Earth trap. Use `ISO_A3_EH` instead, which correctly gives `FRA` and `NOR`.
  - N. Cyprus, Somaliland and Kosovo have no ISO code at all, so fall back to `ADM0_A3`.
  - `WB_A3` is unreliable (Kosovo `KSV`, Palestine `WBG`, Taiwan and W. Sahara `-99`).
  - Borders are **de facto**, meaning who controls the ground. Version 5.1 also ships **33 point-of-view variants** at 10m (`ne_10m_admin_0_countries_<code>.geojson`, for example `_ind`, `_chn`, `_ukr`), because disputed borders look different depending on the government. v1 uses the default de facto layer and says so.
- **Known visual seam:** Natural Earth's coastlines differ from historical-basemaps' coastlines, so the 2010 → present-day step on the slider will visibly "jump". This is accepted and documented in the UI tooltip.

---

## Attribution the site must display

Show this on the About page and in the footer:

- World Bank: "Source: World Bank, World Development Indicators (CC BY 4.0)" plus a link.
- GDELT: "News data: The GDELT Project" plus a link to gdeltproject.org.
- historical-basemaps: "Historical borders © André Ourednik and contributors, GPL-3.0" plus a link.
- Wikidata (CC0), Natural Earth (public domain), iptv-org (public domain) and globe.gl (MIT): credited as a courtesy, not as a legal requirement.

## Open verification items (closed in M1)

1. CORS on `api.gdeltproject.org`. This one decides the news architecture.
2. CORS on `api.worldbank.org` and `query.wikidata.org`. Only needed for the optional live refresh, since the build path doesn't depend on it.
3. The accepted `sourcecountry:` value format (`GM`, `gm` or `germany`).
4. GDELT JSONP support.
