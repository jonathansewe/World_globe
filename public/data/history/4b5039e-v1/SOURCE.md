# Source of these files

These files are a **modified version** of the historical world maps in
[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps),
© André Ourednik and contributors, licensed under **GPL-3.0** (see LICENSE.txt).
They are distributed under the same license.

- **Upstream commit:** `4b5039e50d8d2464b065bd76ad6086cd4597108d`
- **Upstream files:** `geojson/world_<year>.geojson` for 32 years (600 to 2010)
- **Changes made:** reversed ring direction where needed so globe.gl draws each shape (not its complement); kept only the fields `NAME`, `SUBJECTO`, `PARTOF`, `BORDERPRECISION`; simplified with
  mapshaper 0.8.13 (`-simplify 20% keep-shapes`, coordinates rounded to 0.001°).
- **Built by:** `scripts/build-history.mjs` in https://github.com/jonathansewe/World_globe

The upstream README calls these maps a work in progress. Many regions have no name:

| Year | Polygons | Unnamed | Restored unsimplified* | Sliver parts dropped** |
|---|---|---|---|---|
| 600 | 204 | 116 | 12 | 0 |
| 700 | 253 | 120 | 5 | 0 |
| 800 | 225 | 103 | 3 | 0 |
| 900 | 244 | 106 | 6 | 0 |
| 1000 | 264 | 132 | 29 | 0 |
| 1100 | 235 | 85 | 6 | 0 |
| 1200 | 286 | 150 | 34 | 0 |
| 1279 | 247 | 131 | 25 | 0 |
| 1300 | 237 | 122 | 25 | 0 |
| 1400 | 233 | 111 | 25 | 0 |
| 1492 | 1946 | 629 | 79 | 0 |
| 1500 | 291 | 148 | 38 | 0 |
| 1530 | 494 | 216 | 7 | 0 |
| 1600 | 866 | 205 | 8 | 0 |
| 1650 | 778 | 180 | 4 | 0 |
| 1700 | 782 | 191 | 6 | 0 |
| 1715 | 758 | 152 | 1 | 0 |
| 1783 | 641 | 77 | 2 | 0 |
| 1800 | 627 | 69 | 1 | 0 |
| 1815 | 436 | 108 | 0 | 0 |
| 1878 | 239 | 63 | 0 | 0 |
| 1880 | 236 | 63 | 0 | 0 |
| 1900 | 270 | 48 | 0 | 0 |
| 1914 | 177 | 33 | 0 | 0 |
| 1920 | 207 | 40 | 0 | 0 |
| 1930 | 209 | 28 | 6 | 0 |
| 1938 | 254 | 79 | 1 | 0 |
| 1945 | 227 | 42 | 0 | 0 |
| 1960 | 197 | 37 | 0 | 0 |
| 1994 | 240 | 43 | 1 | 0 |
| 2000 | 240 | 42 | 1 | 0 |
| 2010 | 240 | 42 | 1 | 0 |

* Shapes so small that simplification erased them; their original outline is kept instead, rounded to 0.0001°.

** Parts of a shape with no real area (collapsed slivers), which globe.gl would otherwise draw as the whole Earth. The rest of the shape is kept.
