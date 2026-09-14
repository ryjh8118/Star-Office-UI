# Renguin World — Art Direction

## One world, eight eras

Every era is drawn by the same renderer (`frontend/world/world-scene.js`) with
the same fixed rules. A test renders all eight and fails if any of these differ.

| Constant | Value |
| --- | --- |
| Camera | 2:1 isometric, `viewBox -440 -330 880 600`, never moves |
| Ground | one floating island, 13 × 13 tiles (64 × 32 px), earth sides |
| Light | from the upper left: top face +22 %, left face base, right face −18 % |
| Outline | `#3a3150` at 45 % opacity, 1 px, rounded joins |
| Character scale | standees ≈ one storey tall; civilians ≈ ⅔ storey |
| Palette | soft pastels, one saturation band; night is a flat tint, not a filter |
| Lots | landmarks and district buildings sit on fixed tiles, so an era *upgrades* a lot |

What an era changes — and only this:

| Era | Variant | Homes | Ground / roads | Landmarks added |
| --- | --- | --- | --- | --- |
| ERA_01 遠古營地 | camp | canvas tents | trail | campfire |
| ERA_02 部落村莊 | tribe | thatched huts | trail | creator totem |
| ERA_03 河畔聚落 | riverside | timber cabins, gable roofs | dirt, river | dock, wooden bridge |
| ERA_04 繁榮城鎮 | town | brick houses, awnings | cobble | market, clock tower |
| ERA_05 王國都市 | kingdom | stone manors, slate roofs, turrets | stone | city wall, castle keep |
| ERA_06 現代都會 | modern | glass towers | asphalt | TV tower, video hall dome |
| ERA_07 未來新城 | future | rounded spires, green glow bands | glow | monorail, sky garden; gate scaffold |
| ERA_08 星港時代 | starport | spires with beacons | glow | Space Gate |

Continuity devices:

- The inner 60 % of lots carry the current era's style; the outer ring keeps the
  previous era's homes, so the city reads as grown, not swapped.
- The campfire lot becomes a plaza fountain; the totem becomes a statue; the
  wooden bridge becomes stone. Same tiles, better materials.
- City lawn stays green in every era; only lots in use are paved.
- Star Office stands in 創作者街區 from ERA_02 with its sign lit.

## Activity is lighting and life, never demolition

| State | What changes on screen |
| --- | --- |
| ACTIVE / NORMAL | full streets, crane working, shops open |
| QUIET | fewer walkers, walkers slower, some shops close |
| DORMANT | shutters on 60 % of shops, crane still ("暫停施工"), grass tufts, fewer lamps at night |
| DEEP_DORMANT | streets nearly empty, tall grass — every building still standing |
| REVIVAL | lights back, residents return, crane restarts, NEW poster, confetti and small fireworks (finite) |
| FESTIVAL | bunting over the plaza, fireworks (finite), featured poster glowing |

## Characters

Canon characters appear only as their authority image (see the Character System).
Members whose identity is private, and generic civilians, are the same small
navy-and-cream penguin token; a coloured scarf band marks the profession.
Tokens are deliberately plain so they never pass for a character's likeness.

## Page

- Warm cream cards on a sky-to-meadow gradient, matching the Office's floating
  islands; system CJK font stack.
- Desktop: city left (sticky), HUD right. Phones: city first, then gossip,
  districts and HUD; no sideways scroll at 390 px.
- `prefers-reduced-motion`: no animation at all, the city is a still picture.
- Time of day follows the viewer's clock (日/黃昏/夜) with a manual toggle.
