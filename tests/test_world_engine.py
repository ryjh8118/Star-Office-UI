"""Renguin World engine: growth, eras, 100-content roadmap, activity, overrides and privacy."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import inspect
import json
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from renguin_world import engine, mock, service

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)


def content(pid, kind='long', days_ago=1, **extra):
    return {'project_id': pid, 'title': pid, 'content_type': kind, 'status': 'PUBLISHED',
            'published_at': (NOW - timedelta(days=days_ago)).isoformat(), **extra}


def quiet(items):
    """Mock contents without view counts, so popularity cannot colour activity checks."""
    return [{**i, 'view_count': None} for i in items]


class Milestones(unittest.TestCase):
    EXPECTED = {
        0: ('ERA_01', '遠古空地', 'LOCKED'),
        5: ('ERA_01', '小型營地', 'LOCKED'),
        10: ('ERA_02', None, 'LOCKED'),
        20: ('ERA_03', None, 'LOCKED'),
        35: ('ERA_04', None, 'LOCKED'),
        50: ('ERA_05', None, 'LOCKED'),
        75: ('ERA_06', None, 'LOCKED'),
        100: ('ERA_08', None, 'UNLOCKED'),
    }

    def test_each_milestone_builds_a_valid_world(self):
        previous = None
        for count in mock.MILESTONES:
            with self.subTest(contents=count):
                s = service.simulate(count, None, with_registry=False)
                era, stage, gate = self.EXPECTED[count]
                self.assertEqual(s['current_era'], era)
                if stage:
                    self.assertEqual(s['current_stage'], stage)
                self.assertEqual(s['visual']['future_gate'], gate)
                self.assertEqual(s['content']['total'], count)
                self.assertEqual(sum(s['content'][k] for k in ('long', 'short', 'member', 'special')), count)
                self.assertTrue(0 <= s['era_progress'] <= 1)
                self.assertTrue(s['districts'][0]['unlocked'], 'MAIN_CITY is always open')
                for key in ('generated_at', 'world_score', 'world_level', 'current_era', 'next_era', 'era_progress',
                            'content', 'activity', 'districts', 'featured_contents', 'characters', 'visual'):
                    self.assertIn(key, s)
                for key in ('state', 'days_since_publish', 'crowd_density', 'lights_level', 'event_flags'):
                    self.assertIn(key, s['activity'])
                for key in ('city_variant', 'art_theme_version', 'era_variant'):
                    self.assertIn(key, s['visual'])
                if previous:
                    self.assertGreaterEqual(s['world_score'], previous['world_score'])
                    self.assertGreaterEqual(s['world_level'], previous['world_level'])
                    self.assertGreaterEqual(s['visual']['landmark_count'], previous['visual']['landmark_count'])
                    self.assertGreaterEqual(s['visual']['city_radius'], previous['visual']['city_radius'])
                    self.assertGreaterEqual(len([d for d in s['districts'] if d['unlocked']]),
                                            len([d for d in previous['districts'] if d['unlocked']]))
                previous = s
        self.assertEqual(service.simulate(0, None, with_registry=False)['activity']['state'], 'EMPTY_WORLD')

    def test_growth_is_score_based_not_video_number_based(self):
        """The same count can sit in different eras; eras follow the score, milestones only validate."""
        shorts = [content(f'S{i}', 'short', days_ago=i + 1) for i in range(22)]
        longs = [content(f'L{i}', 'long', days_ago=i + 1) for i in range(22)]
        self.assertEqual(engine.build_state(shorts, now=NOW)['current_era'], 'ERA_01')
        self.assertEqual(engine.build_state(longs, now=NOW)['current_era'], 'ERA_04')

    def test_score_never_drops_as_contents_are_added_and_100_is_stable(self):
        items = mock.contents(100)
        last = -1
        for n in range(101):
            s = engine.build_state(items[:n], now=NOW + timedelta(days=500), overrides={'series': mock.series_overrides(items[:n])})
            self.assertGreaterEqual(s['world_score'], last)
            last = s['world_score']
        runs = {json.dumps(engine.build_state(items, now=NOW + timedelta(days=500))['world_score']) for _ in range(5)}
        self.assertEqual(len(runs), 1)


class Determinism(unittest.TestCase):
    def test_same_inputs_same_world_regardless_of_order(self):
        items, now, overrides = mock.scenario(60)
        first = engine.build_state(items, now=now, overrides=overrides)
        shuffled = deepcopy(items)
        random.Random(7).shuffle(shuffled)
        second = engine.build_state(shuffled, now=now, overrides=overrides)
        self.assertEqual(first, second)

    def test_era_thresholds_are_ordered_and_progress_is_continuous(self):
        config = engine.load_config()
        scores = [e['min_score'] for e in config['eras']['eras']]
        self.assertEqual(scores, sorted(scores))
        self.assertEqual(len(scores), 8)
        for score in range(0, 320):
            info = engine.era_for(score, config)
            self.assertEqual(info, engine.era_for(score, config))
            self.assertGreaterEqual(score, info['era']['min_score'])


class Growth(unittest.TestCase):
    def points(self, *items, series=None):
        return engine.build_state(list(items), now=NOW, overrides={'series': series or {}})['world_score']

    def test_points_by_type_flagship_series_and_runtime(self):
        self.assertEqual(self.points(content('a', 'short')), 1)
        self.assertEqual(self.points(content('a', 'member')), 2)
        self.assertEqual(self.points(content('a', 'long')), 4)
        self.assertEqual(self.points(content('a', 'special')), 6)
        self.assertEqual(self.points(content('a', 'long', flagship=True)), 6)
        self.assertEqual(self.points(content('a', 'long', runtime_seconds=1199)), 4)
        self.assertEqual(self.points(content('a', 'long', runtime_seconds=1200)), 5)
        self.assertEqual(self.points(content('a', 'long', runtime_seconds=7200)), 5, 'minutes never add linearly')
        self.assertEqual(self.points(content('a', 'short', runtime_seconds=3600)), 1, 'no runtime bonus for shorts')
        pair = (content('a', 'long', series_slug='trip'), content('b', 'short', series_slug='trip'))
        self.assertEqual(self.points(*pair, series={'trip': {'complete': True}}), 8)
        self.assertEqual(self.points(*pair, series={'trip': {'complete': False}}), 5)
        self.assertEqual(self.points(content('a', 'long'), series={'ghost': {'complete': True}}), 4, 'an empty series earns nothing')

    def test_unfinished_unknown_future_and_duplicate_records_do_not_grow_the_world(self):
        s = engine.build_state([
            content('ok'), content('draft', status='IN_PROGRESS'), content('weird', 'podcast'),
            content('soon', days_ago=-3), content('ok'),
        ], now=NOW)
        self.assertEqual(s['world_score'], 4)
        self.assertEqual({x['reason'] for x in s['skipped']},
                         {'STATUS_IN_PROGRESS', 'UNSUPPORTED_TYPE', 'FUTURE_DATED', 'DUPLICATE_ID'})

    def test_view_tiers_and_views_never_move_the_score_or_era(self):
        config = engine.load_config()
        cases = {999: 'VIEW_TIER_0', 1000: 'VIEW_TIER_1', 9999: 'VIEW_TIER_1', 10000: 'VIEW_TIER_2', 49999: 'VIEW_TIER_2',
                 50000: 'VIEW_TIER_3', 99999: 'VIEW_TIER_3', 100000: 'VIEW_TIER_4', 499999: 'VIEW_TIER_4', 500000: 'VIEW_TIER_5'}
        for views, tier in cases.items():
            self.assertEqual(engine.view_tier(views, config), tier)
        self.assertIsNone(engine.view_tier(None, config))
        base = [content(f'c{i}', days_ago=i + 1) for i in range(12)]
        famous = [{**c, 'view_count': 900000} for c in base]
        plain, hyped = engine.build_state(base, now=NOW), engine.build_state(famous, now=NOW)
        for key in ('world_score', 'current_era', 'world_level', 'era_progress'):
            self.assertEqual(plain[key], hyped[key])
        self.assertIn('VIEW_HYPE', hyped['activity']['event_flags'])
        self.assertGreaterEqual(hyped['activity']['lights_level'], plain['activity']['lights_level'])
        popularity = {'status': 'OK', 'videos': {'abcdefghijk': {'view_count': 60000}}}
        linked = engine.build_state([content('v', youtube_video_id='abcdefghijk')], now=NOW, popularity=popularity)
        self.assertEqual(linked['featured_contents'][0]['view_tier'], 'VIEW_TIER_3')


class Activity(unittest.TestCase):
    def test_inactivity_changes_only_the_activity_layer(self):
        items, last, overrides = mock.scenario(50)
        items = quiet(items)
        base = engine.build_state(items, now=last, overrides=overrides)
        expected = [(0, 'ACTIVE'), (3, 'ACTIVE'), (4, 'NORMAL'), (7, 'NORMAL'), (8, 'QUIET'), (14, 'QUIET'),
                    (15, 'DORMANT'), (30, 'DORMANT'), (31, 'DEEP_DORMANT'), (400, 'DEEP_DORMANT')]
        seen = []
        for days, state in expected:
            s = engine.build_state(items, now=last + timedelta(days=days, hours=1), overrides=overrides)
            with self.subTest(days=days):
                self.assertEqual(s['activity']['base_state'], state)
                for key in ('world_score', 'world_level', 'current_era', 'era_progress'):
                    self.assertEqual(s[key], base[key], 'inactivity never takes growth away')
                for key in ('buildings', 'landmarks', 'city_radius', 'building_height'):
                    self.assertEqual(s['visual'][key], base['visual'][key], 'no building is demolished')
                self.assertEqual([d['unlocked'] for d in s['districts']], [d['unlocked'] for d in base['districts']])
            seen.append(s)
        crowd = engine.load_config()['rules']['crowd']['order']
        lights = [s['activity']['lights_level'] for s in seen]
        self.assertEqual(lights, sorted(lights, reverse=True), 'the city only gets dimmer as it waits')
        self.assertLessEqual(crowd.index(seen[-1]['activity']['crowd_density']), crowd.index(seen[0]['activity']['crowd_density']))
        quiet_state, dormant = seen[4], seen[6]
        self.assertIn('CITY_QUIET', quiet_state['activity']['event_flags'])
        self.assertEqual(quiet_state['activity']['construction'], 'SLOW')
        self.assertEqual(dormant['activity']['construction'], 'PAUSED')
        self.assertIn('SHOPS_DIMMED', dormant['activity']['event_flags'])
        self.assertGreater(dormant['activity']['grass_level'], quiet_state['activity']['grass_level'])
        self.assertTrue(any(g['category'] == 'INACTIVITY' for g in dormant['gossip']))

    def test_revival_after_a_quiet_stretch_then_back_to_normal(self):
        items, now, overrides = mock.scenario(40, idle_days=1, gap_before_last=20)
        items = quiet(items)
        s = engine.build_state(items, now=now, overrides=overrides)
        self.assertEqual(s['activity']['state'], 'REVIVAL')
        for flag in ('LIGHTS_ON', 'RESIDENTS_RETURN', 'CONSTRUCTION_RESTARTED', 'NEW_POSTER', 'CONFETTI', 'SMALL_FIREWORKS'):
            self.assertIn(flag, s['activity']['event_flags'])
        self.assertTrue(any(g['category'] == 'REVIVAL' for g in s['gossip']))
        later = engine.build_state(items, now=now + timedelta(days=5), overrides=overrides)
        self.assertNotEqual(later['activity']['state'], 'REVIVAL')
        self.assertEqual(later['world_score'], s['world_score'])
        plain, _, _ = mock.scenario(40, idle_days=1)
        self.assertNotEqual(engine.build_state(quiet(plain), now=now - timedelta(days=20), overrides=overrides)['activity']['state'], 'REVIVAL')

    def test_festival_from_a_burst_and_density_presets(self):
        burst = [content(f'b{i}', 'short', days_ago=0.1 * i) for i in range(5)]
        s = engine.build_state(burst, now=NOW)
        self.assertEqual(s['activity']['state'], 'FESTIVAL')
        self.assertEqual(s['activity']['crowd_density'], 'FESTIVAL')
        config = engine.load_config()
        factor = config['rules']['crowd']['resident_factor']
        self.assertEqual(list(factor), ['EMPTY', 'QUIET', 'NORMAL', 'BUSY', 'FESTIVAL'])
        self.assertEqual(sorted(factor.values()), list(factor.values()))
        empty = engine.build_state([], now=NOW)
        self.assertEqual((empty['activity']['state'], empty['activity']['crowd_density'], empty['residents']['visible']),
                         ('EMPTY_WORLD', 'EMPTY', 0))
        self.assertIsNone(empty['activity']['days_since_publish'])

    def test_popularity_never_fakes_a_crowd_in_a_quiet_city(self):
        items, last, overrides = mock.scenario(50)
        famous = [{**i, 'view_count': 900000} for i in items]
        s = engine.build_state(famous, now=last + timedelta(days=20), overrides=overrides)
        self.assertEqual(s['activity']['state'], 'DORMANT')
        self.assertNotIn('POPULAR_CROWD', s['activity']['event_flags'])


class Gossip(unittest.TestCase):
    def test_lines_come_only_from_the_prewritten_pool(self):
        pools = engine.load_config()['gossip']['pools']
        flat = set()
        for value in pools.values():
            for texts in (value.values() if isinstance(value, dict) else [value]):
                flat.update(texts)
        for count, idle, gap in ((0, 0, 0), (35, 0, 0), (35, 10, 0), (35, 20, 0), (35, 45, 0), (35, 1, 20), (100, 0, 0)):
            s = service.simulate(count, None, idle_days=idle, gap_before_last=gap, with_registry=False)
            for line in s['gossip']:
                if line['category'] == 'PROJECT':
                    self.assertTrue(any(t.split('{title}')[0] in line['text'] for t in pools['PROJECT']))
                else:
                    self.assertIn(line['text'], flat)
            self.assertEqual(s['gossip'], service.simulate(count, None, idle_days=idle, gap_before_last=gap, with_registry=False)['gossip'])

    def test_no_ai_or_network_on_the_world_path(self):
        from renguin_world import characters, content_adapter, routes
        for module in (engine, mock, service, content_adapter, characters, routes):
            source = inspect.getsource(module)
            for word in ('openai', 'anthropic', 'requests', 'urllib', 'http.client', 'socket', 'gemini'):
                self.assertNotIn(word, source.lower().replace('youtube_adapter', ''), f'{module.__name__} mentions {word}')

    def test_lines_are_never_insults(self):
        text = json.dumps(engine.load_config()['gossip'], ensure_ascii=False)
        for word in ('廢', '爛', '懶惰', '失敗', '笨', '垃圾', '沒用', '去死'):
            self.assertNotIn(word, text)


class Overrides(unittest.TestCase):
    def test_reclassify_exclude_add_feature_and_hotfix_without_code(self):
        items = [content('a', 'long', days_ago=3), content('b', 'long', days_ago=2), content('c', 'short', days_ago=1)]
        overrides = {
            'contents': {'a': {'content_type': 'special', 'tags': ['travel'], 'district': 'TRAVEL_DISTRICT'},
                         'c': {'exclude': True}, 'b': {'bogus_field': 1}},
            'extra_contents': [{'project_id': 'old', 'title': 'Before the Office', 'content_type': 'long',
                                'status': 'PUBLISHED', 'published_at': '2024-01-01T00:00:00Z'}],
            'featured': ['old'],
        }
        s = engine.build_state(items, now=NOW, overrides=overrides)
        self.assertEqual(s['world_score'], 6 + 4 + 4)
        self.assertEqual(s['content']['special'], 1)
        self.assertEqual(s['featured_contents'][0]['content_id'], 'old')
        self.assertEqual(len(s['overrides_applied']), 4)
        forced = engine.build_state(items, now=NOW, overrides={'era': {'force_era': 'ERA_05'}})
        self.assertEqual((forced['current_era'], forced['era']['hotfix']), ('ERA_05', 'FORCE_ERA'))
        raised = engine.build_state(items, now=NOW, overrides={'era': {'min_era': 'ERA_03'}})
        self.assertEqual(raised['current_era'], 'ERA_03')
        ignored = engine.build_state(items, now=NOW, overrides={'era': {'min_era': 'ERA_01'}})
        self.assertIsNone(ignored['era']['hotfix'])

    def test_character_visibility_override(self):
        registry = {'characters': [{'character_id': 'G1', 'display_name': 'Guest', 'character_type': 'SPECIAL_GUEST',
                                    'asset_ref': '/static/x.png', 'public_visibility': True, 'default_district': 'MAIN_CITY',
                                    'allowed_states': ['IDLE'], 'special_flags': []}]}
        items = [content('a')]
        self.assertEqual(len(engine.build_state(items, now=NOW, registry=registry)['characters']), 1)
        hidden = engine.build_state(items, now=NOW, registry=registry, overrides={'characters': {'G1': {'public_visibility': False}}})
        self.assertEqual(hidden['characters'], [])


class PublicView(unittest.TestCase):
    def test_strangers_see_no_ids_paths_or_unpublished_titles(self):
        items = [content('WORKSPACE-secret-folder-aaaaaaaaaaaa', title='上映的片'),
                 {**content('OFFICE-draft', days_ago=0), 'status': 'COMPLETED', 'title': '還沒上映的秘密標題', 'published_at': None,
                  'completed_at': NOW.isoformat()}]
        state = engine.build_state(items, now=NOW, sources=[{'id': 'X', 'status': 'OK', 'count': 1, 'path': 'E:/secret'}])
        view = engine.public_view(state)
        text = json.dumps(view, ensure_ascii=False)
        self.assertNotIn('WORKSPACE-secret', text)
        self.assertNotIn('OFFICE-draft', text)
        self.assertNotIn('還沒上映的秘密標題', text)
        self.assertNotIn('E:/secret', text)
        self.assertIn('上映的片', text)
        self.assertEqual(view['audience'], 'public')


if __name__ == '__main__':
    unittest.main()
