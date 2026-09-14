# Renguin World — 100 Content Roadmap

## Growth score

| Content | Growth |
| --- | --- |
| SHORT | +1 |
| MEMBER VIDEO | +2 |
| LONGFORM | +4 |
| FLAGSHIP / SPECIAL (type `special` or flag `FLAGSHIP`) | +6 |
| SERIES COMPLETE (override `series.<slug>.complete`) | +3 once |
| Runtime ≥ 20 min, long/special, runtime known | +1 (never linear) |

Views never add growth. Time never removes it.

## Eras are score thresholds, not video numbers

| Era | Min growth | Next era at |
| --- | --- | --- |
| ERA_01 遠古營地 | 0 | 24 |
| ERA_02 部落村莊 | 24 | 50 |
| ERA_03 河畔聚落 | 50 | 88 |
| ERA_04 繁榮城鎮 | 88 | 125 |
| ERA_05 王國都市 | 125 | 165 |
| ERA_06 現代都會 | 165 | 215 |
| ERA_07 未來新城 | 215 | 255 |
| ERA_08 星港時代 | 255 | — |

Each era has five stages; `world_level = era_index × 5 + stage + 1` (Lv.1–40).
22 longs reach ERA_04; 22 shorts are still in ERA_01 — the score decides.

## The 100-content mock

`backend/renguin_world/mock.py` builds 100 deterministic contents on a
channel-like rhythm (per ten: 3 long, 5 short, 1 member, 1 flagship; every
fourth day), covering travel, lifestyle, career, fitness, entertainment,
nightlife and story, with runtimes, a world-tour series that completes, and a
view ladder that exercises every popularity tier. The milestones below are
design checkpoints produced by that mock (`python -m renguin_world roadmap --markdown`),
and `tests/test_world_engine.py` fails if any of them drifts.

| Contents | Growth | Lv | Era | Stage | City radius | Homes | Landmarks | Open districts | Resident capacity | Space Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 1 | ERA_01 遠古營地 | 遠古空地 | 2 | 0 | 1 | 1 | 6 | LOCKED |
| 5 | 14 | 3 | ERA_01 遠古營地 | 小型營地 | 2 | 3 | 1 | 1 | 6 | LOCKED |
| 10 | 29 | 6 | ERA_02 部落村莊 | 部落成形 | 3 | 6 | 2 | 2 | 12 | LOCKED |
| 20 | 54 | 11 | ERA_03 河畔聚落 | 河道開通 | 3 | 9 | 4 | 3 | 18 | LOCKED |
| 35 | 93 | 16 | ERA_04 繁榮城鎮 | 磚造街道 | 4 | 14 | 6 | 5 | 26 | LOCKED |
| 50 | 133 | 22 | ERA_05 王國都市 | 石造大街 | 5 | 19 | 8 | 6 | 34 | LOCKED |
| 75 | 202 | 29 | ERA_06 現代都會 | 電視塔完工 | 5 | 28 | 10 | 6 | 42 | LOCKED |
| 100 | 269 | 37 | ERA_08 星港時代 | 星港試航 | 6 | 37 | 13 | 7 | 58 | UNLOCKED |

## Milestone blueprint

| Contents | World stage | Footprint | Districts | Visual upgrade | Unlocked feature |
| --- | --- | --- | --- | --- | --- |
| 0 | 遠古空地 — an empty lot and a campfire | 5 × 5 | 主城區 | wild island, no homes | "等待開工" site; Renguin alone |
| 5 | 小型營地 | 5 × 5 | 主城區 | tents around the fire | first poster, first walkers |
| 10 | 部落 | 7 × 7 | + 創作者街區 | thatched huts, creator totem | Star Office appears; one guest visits |
| 20 | 聚落 | 7 × 7 | + 旅行港區 | river, dock, wooden bridge, cabins | hotel, boats; traveller & hotel-staff civilians |
| 35 | 城鎮 | 9 × 9 | + 影片大廳, 鵝寶會員區 | brick houses, market, clock tower | hatchery; member population joins the crowd |
| 50 | 大型都市雛形 | 11 × 11 | + 娛樂夜市區 | stone manors, city wall, castle | night-market stage; knights and royal goosebabies |
| 75 | 現代都會 | 11 × 11 | 6 open | glass towers, TV tower, video hall dome | call-centre commuters; Supreme Penguin in the hall |
| 100 | 大型 Renguin City | 13 × 13 | + 星港之門 | spires, monorail, sky garden, **Space Gate** | Space Gate teaser; scaffold first shows at ERA_07 ≥ 60 % |

Districts can also open early from content: 旅行港區 with 3 travel contents,
鵝寶會員區 with 3 member videos.

## Where the real channel stands (2026-09-15)

20 finished contents from the creator's Office marks (18 long, 2 short) →
**growth 74 · ERA_03 河畔聚落 · 木橋完工 · Lv.14**, 14 growth from 繁榮城鎮.
The ledger has no verified publishes yet, and earlier YouTube history is not in
any source; add it through `extra_contents` overrides when wanted.

## Beyond 100

Add an era to `config/eras.json` (with its landmark and a variant style in
`world-scene.js`), or a district to `config/districts.json`. Thresholds, stages,
gossip and professions are data. ERA_08 already has headroom (`span` 60) so
Lv keeps rising until the next era exists.
