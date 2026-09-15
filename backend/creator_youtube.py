"""Canonical YouTube relationships in the existing Office metadata transaction.

No project registry, credentials, member authority or background poller lives here.
"""
from copy import deepcopy
from datetime import datetime, timezone

FIELD = 'canonical_youtube_bindings'
USER = 'USER_CONFIRMED_BINDING'


class BindingConflict(ValueError):
    def __init__(self, owner):
        self.owner = owner
        super().__init__('YOUTUBE_BINDING_CONFLICT')


def canonical_id(data, pid):
    meta = data.get('projects', {}).get(pid, {})
    # A selected source is authoritative. An explicitly unlinked local project
    # keeps its own stable ID; its display title is never an identity.
    return meta.get('source_project_id') or pid


def reserve_verified_legacy(data, runtime):
    """Bring previously verified mappings into the SAME transaction/uniqueness check.

    A manual tombstone is deliberately not imported again. Missing verification
    fails closed instead of letting a new URL steal an older relationship.
    """
    from renguin_world import service, youtube_adapter
    overrides, report = service.load_overrides(runtime)
    if report['status'] == 'ERROR':
        raise ValueError('LEGACY_BINDING_RECONCILIATION_REQUIRED')
    videos = youtube_adapter.load(runtime)['videos']
    for pid, row in (overrides.get('contents') or {}).items():
        vid = row.get('youtube_video_id')
        if not vid or canonical_id(data, pid) in data.get(FIELD, {}):
            continue
        metadata = videos.get(vid)
        if not metadata:
            raise ValueError('LEGACY_BINDING_RECONCILIATION_REQUIRED')
        apply(data, pid, {**metadata, 'youtube_video_id': vid}, source='API_VERIFIED_RECONCILIATION')


def apply(data, pid, metadata, *, confirmed_owner=None, source=USER):
    cid = canonical_id(data, pid)
    bindings = data.setdefault(FIELD, {})
    previous = bindings.get(cid)
    if source != USER and previous and previous.get('provenance') == USER:
        return False
    vid = metadata['youtube_video_id'] if metadata else None
    owners = [owner for owner, b in bindings.items() if b.get('youtube_video_id') == vid and vid and owner != cid]
    if len(owners) > 1 or (owners and confirmed_owner != owners[0]):
        raise BindingConflict(owners[0])
    if confirmed_owner and owners != [confirmed_owner]:
        raise BindingConflict(owners[0] if owners else None)
    if owners:
        old = owners[0]
        bindings[old] = {'canonical_project_id': old, 'youtube_video_id': None,
                         'status': 'UNBOUND', 'provenance': USER}
        for other_pid, meta in data.get('projects', {}).items():
            if canonical_id(data, other_pid) == old and (meta.get('link') or {}).get('youtube_id') == vid:
                meta['link'] = None
    bindings[cid] = {'canonical_project_id': cid, 'youtube_video_id': vid,
                     'status': 'BOUND' if vid else 'UNBOUND', 'provenance': source,
                     'confirmation': 'USER_CONFIRMED' if source == USER else 'API_VERIFIED',
                     'verified_at': datetime.now(timezone.utc).isoformat(),
                     'metadata': deepcopy(metadata) if metadata else None}
    return True


def enrich_contents(contents, data):
    """Manual bindings/tombstones override fuzzy/legacy mapping without changing projects."""
    bindings = (data or {}).get(FIELD, {})
    for content in contents:
        pid = content['project_id']
        cid = canonical_id(data or {}, pid)
        binding = bindings.get(cid)
        if not binding:
            continue
        content['youtube_binding_provenance'] = binding['provenance']
        content['youtube_video_id'] = binding.get('youtube_video_id')
        content['canonical_project_id'] = cid
        content['youtube_metadata_verified_at'] = binding.get('verified_at')
        if binding.get('metadata'):
            md = binding['metadata']
            content.update(published_at=md['published_at'], view_count=md['view_count'],
                           youtube_resolution_status=md['resolution_status'],
                           view_count_status=md['view_count_status'],
                           view_count_provenance=md['view_count_provenance'])
        else:
            content.update(view_count=None, youtube_resolution_status='IDENTITY_UNRESOLVED')
    return contents
