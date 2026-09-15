"""Read-only capability probe. Only counts, field availability and fixed errors exit RAM."""
import argparse
from collections import Counter
import json
import logging
import os
from pathlib import Path

SCOPE = 'https://www.googleapis.com/auth/youtube.channel-memberships.creator'
READONLY = 'https://www.googleapis.com/auth/youtube.readonly'
BASE = 'https://www.googleapis.com/youtube/v3/'


class Gate(Exception):
    def __init__(self, category, reason):
        self.category, self.reason = category, reason
        super().__init__(category)


def check_response(status, payload):
    if not isinstance(payload, dict):
        raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_RESPONSE')
    if status != 200:
        reasons = {e.get('reason') for e in (payload.get('error', {}).get('errors') or []) if isinstance(e, dict)}
        if status == 401:
            raise Gate('TOKEN', 'TOKEN_REJECTED')
        if 'insufficientPermissions' in reasons:
            raise Gate('OAUTH_SCOPE', 'INSUFFICIENT_PERMISSIONS')
        if reasons & {'quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'}:
            raise Gate('QUOTA', 'QUOTA_OR_RATE_LIMIT')
        if 'accessNotConfigured' in reasons:
            raise Gate('API_CONFIGURATION', 'API_NOT_ENABLED')
        if 'channelMembershipsNotEnabled' in reasons:
            raise Gate('CHANNEL_ACCESS', 'CHANNEL_MEMBERSHIPS_NOT_ENABLED')
        if status == 403:
            raise Gate('CHANNEL_ACCESS', 'ACCESS_FORBIDDEN')
        raise Gate('REQUEST_OR_PLATFORM', 'HTTP_REQUEST_FAILED')
    if 'error' in payload:
        raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_RESPONSE')
    return payload


def probe(call, expected_channel):
    report = {'result': 'BLOCKED', 'oauth': 'NOT_VERIFIED', 'channel_access': 'NOT_VERIFIED',
              'membership_api': 'NOT_RUN', 'members_found': None, 'levels_found': None,
              'pagination': 'NOT_STARTED', 'member_data_written': False}
    endpoint = 'channels'
    try:
        channel = call(endpoint, {'part': 'id', 'mine': 'true'})
        if channel.get('kind') != 'youtube#channelListResponse' or [r.get('id') for r in channel.get('items', [])] != [expected_channel]:
            raise Gate('CHANNEL_IDENTITY', 'EXPECTED_CHANNEL_NOT_CONFIRMED')
        report.update(oauth='TOKEN_ACCEPTED', channel_identity='EXPECTED_CHANNEL_CONFIRMED')
        endpoint = 'members'
        token = None
        tokens, members, levels_used = set(), set(), set()
        fields = Counter()
        pages = 0
        while True:
            params = {'part': 'snippet', 'mode': 'all_current', 'maxResults': 1000}
            if token:
                params['pageToken'] = token
            data = call(endpoint, params)
            if data.get('kind') != 'youtube#memberListResponse' or not isinstance(data.get('items', []), list):
                raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_MEMBER_SCHEMA')
            if 'items' not in data and data.get('pageInfo', {}).get('totalResults') != 0:
                raise Gate('IMPLEMENTATION_OR_RESPONSE', 'MISSING_MEMBERS')
            pages += 1
            for row in data.get('items', []):
                snippet = row.get('snippet', {})
                detail = snippet.get('memberDetails', {})
                membership = snippet.get('membershipsDetails', {})
                identity = detail.get('channelId')
                if row.get('kind') != 'youtube#member' or not identity or identity in members:
                    raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_OR_DUPLICATE_MEMBER')
                if snippet.get('creatorChannelId') != expected_channel:
                    raise Gate('CHANNEL_IDENTITY', 'UNEXPECTED_CREATOR')
                members.add(identity)
                for name in ('channelId', 'channelUrl', 'displayName', 'profileImageUrl'):
                    fields['memberDetails.' + name] += detail.get(name) is not None
                for name in ('highestAccessibleLevel', 'highestAccessibleLevelDisplayName', 'accessibleLevels', 'membershipsDurationAtLevel'):
                    fields['membershipsDetails.' + name] += membership.get(name) is not None
                for name in ('memberSince', 'memberTotalDurationMonths'):
                    fields['membershipsDetails.membershipsDuration.' + name] += (membership.get('membershipsDuration') or {}).get(name) is not None
                levels_used.update(membership.get('accessibleLevels') or [])
                if membership.get('highestAccessibleLevel'):
                    levels_used.add(membership['highestAccessibleLevel'])
            token = data.get('nextPageToken')
            if not token:
                break
            if not isinstance(token, str) or token in tokens:
                raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_PAGINATION')
            tokens.add(token)
        report.update(membership_api='PASS', channel_access='PASS', members_found=len(members),
                      pages=pages, pagination='COMPLETE', next_page_token_present=False,
                      field_availability_counts=dict(fields))
        endpoint = 'membershipsLevels'
        data = call(endpoint, {'part': 'id,snippet'})
        if data.get('kind') != 'youtube#membershipsLevelListResponse' or not isinstance(data.get('items', []), list):
            raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_LEVEL_SCHEMA')
        ids = set()
        for row in data.get('items', []):
            if row.get('kind') != 'youtube#membershipsLevel' or not row.get('id') or row['id'] in ids or row.get('snippet', {}).get('creatorChannelId') != expected_channel:
                raise Gate('IMPLEMENTATION_OR_RESPONSE', 'INVALID_LEVEL_IDENTITY')
            ids.add(row['id'])
        if not levels_used.issubset(ids):
            raise Gate('DATA_INTEGRITY', 'MEMBER_LEVEL_RELATION_UNRESOLVED')
        report.update(result='PASS', levels_found=len(ids), level_relationship='PASS', membership_levels='PASS')
    except Gate as error:
        report.update(gate_category=error.category, gate_reason=error.reason, gate_endpoint=endpoint)
        if endpoint == 'members':
            report['membership_api'] = 'ACCESS_DENIED' if error.category == 'CHANNEL_ACCESS' else 'FAILED'
            report['channel_access'] = 'DENIED' if error.category == 'CHANNEL_ACCESS' else 'NOT_VERIFIED'
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-channel', required=True)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    from youtube_membership_oauth import protect
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    import requests
    report = {'result': 'BLOCKED', 'gate_category': 'TOKEN', 'gate_reason': 'SECURE_CREDENTIAL_UNAVAILABLE'}
    try:
        path = Path(os.environ['LOCALAPPDATA']) / 'RenguinWorld/oauth/desktop-sync.token.dpapi'
        info = json.loads(protect(path.read_bytes(), decrypt=True))
        if info.get('token_uri') != 'https://oauth2.googleapis.com/token':
            raise ValueError('INVALID_TOKEN_ENDPOINT')
        credentials = Credentials.from_authorized_user_info(info, [SCOPE, READONLY])
        session = requests.Session()
        session.trust_env = False
        try:
            if credentials.expired:
                credentials.refresh(Request(session=session))
            if not credentials.valid or not credentials.has_scopes([SCOPE, READONLY]):
                raise ValueError('INVALID_TOKEN_SCOPE')
            def call(endpoint, params):
                try:
                    r = session.get(BASE + endpoint, params=params, headers={'Authorization': 'Bearer ' + credentials.token}, timeout=30)
                    payload = r.json()
                except Exception:
                    raise Gate('TRANSPORT_OR_RESPONSE', 'REQUEST_FAILED') from None
                return check_response(r.status_code, payload)
            report = probe(call, args.expected_channel)
        finally:
            session.close()
    except Exception:
        # Never print exceptions: credentials or request URLs may be embedded.
        report = {'result': 'BLOCKED', 'gate_category': 'TOKEN_OR_IMPLEMENTATION', 'gate_reason': 'SAFE_PROBE_FAILED'}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
