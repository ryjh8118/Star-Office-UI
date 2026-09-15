# RENGUIN_WORLD_VISUAL_ENHANCEMENT_V2 (planned, not started)

A separate phase, after the world is structurally complete and alive. It
upgrades how the world looks inside the architecture in
`Renguin_World_Architecture.md`; it may not change the composition rule, the
layer contract or seamless navigation, and it may never redraw a character.

## Scope

- MapleStory-like scene richness (own art; no copied assets, maps or characters)
- Finer paper-craft / game art for terrain, buildings and props
- Depth: more layers per section, atmospheric perspective
- Light and shadow
- Weather (a new layer between `foreground` and `effects`, z 65 or 75)
- Day and night beyond the current palette and tint
- Particles (effects layer)
- Animated residents within ASSET rules: no mirroring, no redressing
- Building detail
- Richer foreground / midground / background parallax
- World liveliness: ambient life, sound hooks

## Notes collected during the structure phase

- Portrait phones squeeze the island crew close together; overlap is allowed now.
- Wide desktops show large sky margins around the composed bands.
- The cloud sea and descent are functional but sparse between banks.
- Night is a flat tint; lit windows are not yet separate light sources.
- Street props (market, stream, construction) are single-state drawings per era.
- Main-street pebbles and stones cluster in rows: the scene hash mixes a changing
  suffix poorly (districts already lead with the counter).

## Notes collected during the district migration

- Backdrop rows drift into the neighbouring district near its edges (anchored parallax
  at depth 0.7); give each district a closing backdrop element.
- Closed lots all look alike apart from their signboard; each could preview its district.
- The river harbour is one cross-section; boats are static and the pier is plain.
- Spotlights, the gate glow and marquee bulbs are flat shapes, not light sources.
- The crowd is deliberately faceless pawns (NEUTRAL_PLACEHOLDER); any richer crowd must
  stay non-character.
- Gossip bubbles are HTML paper cards; a painted speech style would sit better in the scene.
