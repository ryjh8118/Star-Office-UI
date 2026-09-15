/* Renguin World camera composition rule. Pure: viewport in, framing out.
 *
 * One world scale for the whole vertical world, chosen so that at any viewport
 * ratio the two composed views keep their subject in the safe area (below the
 * HUD, above the bottom controls):
 *
 *   island view  — scroll 0, the Star Office from its star to the crew's name tags
 *   city view    — scroll end, the street from the rooftops to the residents' name tags
 *
 * Width sets the preferred scale (readable residents on a phone, full size on a
 * desktop); height caps it so a short or landscape screen still fits both
 * focus bands. The island then gets a lead (extra or trimmed sky above it) and
 * the city a height (soil kept below the street) so each band sits centred in
 * the safe area. Zoom multiplies the chosen scale and may push bands past the
 * edges on purpose: it is an accessibility enlargement, not the composition.
 */
(function (root) {
  "use strict";
  const RULE = {
    design_width: 2600,
    scale: { min: 0.55, max: 1.25, width_base: 0.45, width_floor: 0.7, width_ceiling: 1 },
    safe: { top: 72, bottom: 24, bottom_compact: 64, compact_below: 720, compact_min_height: 481 },
    island: { band: [140, 620], height: 1000 },
    city: { band: [430, 836], art_height: 1080, max_height: 1700 },
    residents: { height: 150, readable_px: 80, spot_margin: 76 },
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const span = ([a, b]) => b - a;
  const centre = ([a, b]) => (a + b) / 2;

  function compose({ width, height, zoom = 1 }) {
    // Compact = a portrait phone: the altimeter moves to the bottom. A landscape phone keeps it at the side.
    const compact = width <= RULE.safe.compact_below && height >= RULE.safe.compact_min_height;
    const safeTop = RULE.safe.top;
    const safeBottom = compact ? RULE.safe.bottom_compact : RULE.safe.bottom;
    const usable = Math.max(1, height - safeTop - safeBottom);
    const middle = safeTop + usable / 2;
    const byWidth = clamp(RULE.scale.width_base + width / RULE.design_width, RULE.scale.width_floor, RULE.scale.width_ceiling);
    const byHeight = usable / Math.max(span(RULE.island.band), span(RULE.city.band));
    const fit = clamp(Math.min(byWidth, byHeight), RULE.scale.min, RULE.scale.max);
    const ws = +(fit * zoom).toFixed(3);

    // Island: centre the band; never let its top slip under the HUD. Negative lead trims sky.
    let lead = middle - centre(RULE.island.band) * ws;
    lead = Math.max(lead, safeTop - RULE.island.band[0] * ws);
    // City: the page ends at the city's bottom, so its height decides where the street sits.
    const cityPx = centre(RULE.city.band) * ws + (height - middle);
    const cityHeight = clamp(cityPx / ws, RULE.city.band[1] + safeBottom / ws, RULE.city.max_height);
    // Island crew gather toward the office when the screen is narrow.
    const halfView = width / (2 * ws);
    const reach = (spots) => Math.max(...spots.map(Math.abs));
    return {
      ws,
      compact,
      safe: { top: safeTop, bottom: safeBottom },
      island: { lead: Math.round(lead), squeeze: (spots) => Math.min(1, (halfView - RULE.residents.spot_margin) / reach(spots)) },
      city: { height: Math.round(cityHeight), visible_width: Math.round(width / ws) },
      resident_px: Math.round(RULE.residents.height * ws),
    };
  }

  // Where each band lands on screen in its composed view; tests and the browser check use this.
  function framing(result, height) {
    const ws = result.ws;
    const island = RULE.island.band.map((u) => result.island.lead + u * ws);
    const cityTop = height - result.city.height * ws;
    const city = RULE.city.band.map((u) => cityTop + u * ws);
    return { island, city };
  }

  const api = { RULE, compose, framing };
  root.RenguinWorldComposition = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
