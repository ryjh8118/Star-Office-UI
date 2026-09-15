"""Synthetic probe safety: pagination, privacy, identity and error classification."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from youtube_membership_probe import probe, check_response, Gate


def member(i):
    return {'kind': 'youtube#member', 'snippet': {'creatorChannelId': 'creator',
            'memberDetails': {'channelId': 'private-' + str(i), 'displayName': 'PRIVATE_FIXTURE'},
            'membershipsDetails': {'highestAccessibleLevel': 'level', 'accessibleLevels': ['level'],
            'membershipsDuration': {'memberSince': '2025-01-01T00:00:00Z', 'memberTotalDurationMonths': 2}}}}


class ProbeTests(unittest.TestCase):
    def call(self, endpoint, params):
        if endpoint == 'channels':
            return {'kind': 'youtube#channelListResponse', 'items': [{'id': 'creator'}]}
        if endpoint == 'membershipsLevels':
            return {'kind': 'youtube#membershipsLevelListResponse', 'items': [
                {'kind': 'youtube#membershipsLevel', 'id': 'level', 'snippet': {'creatorChannelId': 'creator'}}]}
        if params.get('pageToken'):
            return {'kind': 'youtube#memberListResponse', 'items': [member(2)]}
        return {'kind': 'youtube#memberListResponse', 'items': [member(1)], 'nextPageToken': 'private-page-token'}

    def test_all_pages_and_only_aggregates_leave_probe(self):
        result = probe(self.call, 'creator')
        self.assertEqual((result['result'], result['members_found'], result['pages'], result['levels_found']), ('PASS', 2, 2, 1))
        self.assertEqual(result['field_availability_counts']['membershipsDetails.membershipsDuration.memberSince'], 2)
        for private in ('PRIVATE_FIXTURE', 'private-1', 'private-page-token'):
            self.assertNotIn(private, json.dumps(result))

    def test_repeated_page_token_and_duplicate_members_fail_closed(self):
        def call(endpoint, params):
            return self.call(endpoint, {})
        result = probe(call, 'creator')
        self.assertEqual(result['result'], 'BLOCKED')
        self.assertIsNone(result['members_found'])

    def test_wrong_creator_is_not_accepted(self):
        result = probe(self.call, 'another-creator')
        self.assertEqual(result['gate_category'], 'CHANNEL_IDENTITY')
        self.assertEqual(result['membership_api'], 'NOT_RUN')

    def test_scope_token_quota_and_channel_failures_are_distinct(self):
        for status, reason, category in [(401, 'authError', 'TOKEN'), (403, 'insufficientPermissions', 'OAUTH_SCOPE'),
                                         (403, 'quotaExceeded', 'QUOTA'), (403, 'forbidden', 'CHANNEL_ACCESS'),
                                         (400, 'channelMembershipsNotEnabled', 'CHANNEL_ACCESS')]:
            with self.subTest(reason=reason), self.assertRaises(Gate) as raised:
                check_response(status, {'error': {'message': 'DO_NOT_PRINT', 'errors': [{'reason': reason}]}})
            self.assertEqual(raised.exception.category, category)
            self.assertNotIn('DO_NOT_PRINT', str(raised.exception))

    def test_denial_does_not_fabricate_zero_members_or_call_levels(self):
        def call(endpoint, params):
            if endpoint == 'members':
                raise Gate('CHANNEL_ACCESS', 'ACCESS_FORBIDDEN')
            self.assertNotEqual(endpoint, 'membershipsLevels')
            return self.call(endpoint, params)
        result = probe(call, 'creator')
        self.assertEqual(result['membership_api'], 'ACCESS_DENIED')
        self.assertIsNone(result['members_found'])
        self.assertIsNone(result['levels_found'])
        self.assertEqual(result['pagination'], 'NOT_STARTED')

    def test_invalid_schema_and_missing_level_mapping_are_not_pass(self):
        def call(endpoint, params):
            data = self.call(endpoint, params)
            if endpoint == 'membershipsLevels': data['items'] = []
            return data
        self.assertEqual(probe(call, 'creator')['gate_reason'], 'MEMBER_LEVEL_RELATION_UNRESOLVED')
        with self.assertRaises(Gate): check_response(200, {'error': {}})


if __name__ == '__main__':
    unittest.main()
