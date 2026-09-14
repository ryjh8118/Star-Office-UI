"""Deterministic mock contents for roadmap validation and QA previews.

Mock data never enters a live world: every record is marked MOCK, ids start
with MOCK-, and the service only builds these through the simulate path.
"""
from datetime import datetime, timedelta, timezone

MILESTONES = (0, 5, 10, 20, 35, 50, 75, 100)
START = datetime(2024, 1, 5, 12, 0, tzinfo=timezone.utc)
# One channel week in ten slots: shorts most often, a long most weeks, a member
# cut now and then, and one flagship per ten.
PATTERN = ('long', 'short', 'short', 'long', 'member', 'short', 'long', 'short', 'short', 'special')
CATEGORIES = ('travel', 'lifestyle', 'career', 'fitness', 'entertainment', 'travel', 'lifestyle', 'nightlife', 'story', 'entertainment')
TITLES = {
    'travel': ['新加坡街頭一日', '曼谷夜市吃到飽', '東京轉機十二小時', '馬來西亞雨林', '高雄港邊散步'],
    'lifestyle': ['做菜翻車實錄', '開箱鵝寶周邊', '做臉初體驗', '搬家第一晚', '一週穿搭'],
    'career': ['剪片的一天', '合作拍攝幕後', '接案報價聊聊', '工作室改造', '創作者的行事曆'],
    'fitness': ['健身房第一課', '晨跑五公里', '重訓菜鳥日記', '游泳挑戰', '伸展十分鐘'],
    'entertainment': ['金曲猜歌大賽', '舞台表演幕後', '綜藝挑戰賽', '卡拉OK之夜', '派對遊戲王'],
    'nightlife': ['夜市宵夜巡禮', '酒吧調酒初體驗', '深夜派對紀錄', '夜店門口訪問', '宵夜地圖'],
    'story': ['我沒說過的故事', '暈船故事續集', '人生 BUG 回顧', '十年前的我', '一封信'],
}


def contents(count=100, *, interval_days=4, start=START):
    items = []
    for i in range(count):
        kind = PATTERN[i % len(PATTERN)]
        category = CATEGORIES[(i * 3) % len(CATEGORIES)]
        stamp = start + timedelta(days=i * interval_days)
        runtime = None
        if kind in ('long', 'special'):
            runtime = 1500 if i % 3 == 0 else 780
        elif kind == 'member':
            runtime = 900
        elif kind == 'short':
            runtime = 45
        # Views follow a fixed ladder so every popularity tier is exercised.
        views = (i * 7919) % 120000 + (600000 if i in (49, 88) else 0)
        series = 'renguin-world-tour' if category == 'travel' and i < 60 else None
        items.append({
            'project_id': f'MOCK-{i + 1:03d}',
            'title': f'{TITLES[category][i % 5]} #{i + 1}',
            'content_type': 'special' if kind == 'special' else kind,
            'status': 'PUBLISHED',
            'published_at': stamp.isoformat(),
            'completed_at': (stamp - timedelta(days=1)).isoformat(),
            'runtime_seconds': runtime,
            'youtube_video_id': f'mock{i + 1:07d}',
            'series_slug': series,
            'tags': [category] if category != 'story' else ['story'],
            'world_flags': ['FLAGSHIP'] if kind == 'special' else [],
            'view_count': views,
            'evidence': 'MOCK',
        })
    return items


def series_overrides(items):
    """The mock world tour completes once its travel run ends (first 60 slots)."""
    return {'renguin-world-tour': {'complete': True, 'title': 'Renguin 世界巡迴'}} if any(
        i.get('series_slug') == 'renguin-world-tour' and int(i['project_id'][5:]) >= 55 for i in items) else {}


def scenario(count, *, idle_days=0, gap_before_last=0):
    """First `count` mock contents; `now` is `idle_days` after the last one.

    `gap_before_last` pushes the final content that many days later, which is
    how a comeback after a quiet stretch (REVIVAL) is simulated.
    """
    items = contents(count)
    if items and gap_before_last:
        last = items[-1]
        for key in ('published_at', 'completed_at'):
            last[key] = (datetime.fromisoformat(last[key]) + timedelta(days=gap_before_last)).isoformat()
    base = datetime.fromisoformat(items[-1]['published_at']) if items else START
    now = base + timedelta(days=idle_days, hours=1)
    return items, now, {'series': series_overrides(items)}
