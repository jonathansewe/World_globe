// globe.gl, like d3-geo, reads a polygon's ring direction on the sphere: an outer
// ring drawn the "wrong" way means "the whole Earth except this shape", which paints
// the entire globe. mapshaper writes rings in the opposite direction to what
// globe.gl expects, so every build script runs its output through this.
import { geoArea } from 'd3-geo';

const HALF_SPHERE = 2 * Math.PI; // steradians; no real country or polity is this big
const partArea = (rings) => geoArea({ type: 'Polygon', coordinates: rings });

// Fixes each part of a (Multi)Polygon on its own, because one feature can mix parts
// drawn in both directions. A part that is still "bigger than half the Earth" after
// flipping has no real area (a collapsed sliver), so it is removed and counted.
// Returns { flipped, dropped } counts for the whole collection.
export function rewindForGlobe(featureCollection) {
  let flipped = 0;
  let dropped = 0;
  for (const f of featureCollection.features) {
    const g = f.geometry;
    if (!g) continue;
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const kept = [];
    for (const rings of parts) {
      if (partArea(rings) > HALF_SPHERE) {
        rings.forEach((ring) => ring.reverse());
        flipped++;
        if (partArea(rings) > HALF_SPHERE) { dropped++; continue; }
      }
      kept.push(rings);
    }
    if (g.type === 'Polygon') g.coordinates = kept[0] ?? [];
    else if (g.type === 'MultiPolygon') g.coordinates = kept;
  }
  return { flipped, dropped };
}

export const isInverted = (feature) => Boolean(feature.geometry) && geoArea(feature) > HALF_SPHERE;
