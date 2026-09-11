import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from creator_activity import enrich, repo_context

def stamp(seconds_ago):
    return (datetime.now(timezone.utc)-timedelta(seconds=seconds_ago)).isoformat().replace('+00:00','Z')

def tool_use(seconds_ago):
    return {'type':'assistant','message':{'stop_reason':'tool_use','content':[{'type':'tool_use'}]},'timestamp':stamp(seconds_ago)}

class CreatorActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.home=Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def journal(self,relative,rows):
        path=self.home/relative
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in rows)+'\n',encoding='utf-8')
        return path
    def claude(self,rows):
        path=self.journal('.claude/projects/proj/sid.jsonl',rows)
        item={'agent':'CLAUDE','source':'CLAUDE_NATIVE_SESSION','native_id':'sid',
              'provenance':{'path':str(self.home/'.claude/sessions/1.json'),'journal':{'path':str(path)}}}
        enrich({'native_coverage':{'observations':[item]}},self.home)
        return item
    def test_claude_tool_use_lights_the_member(self):
        item=self.claude([{'type':'user','message':{'content':'剪一段預告'},'timestamp':stamp(20)},tool_use(5)])
        self.assertEqual(item['visual_activity']['state'],'WORKING')
        self.assertEqual(item['visual_activity']['action'],'正在使用工具')
        self.assertFalse(item['visual_activity']['executor_claim'])
    def test_claude_end_turn_is_recent_not_working(self):
        item=self.claude([tool_use(9),{'type':'assistant','message':{'stop_reason':'end_turn','content':[{'type':'text','text':'好了'}]},'timestamp':stamp(5)},
                          {'type':'last-prompt'}])
        self.assertEqual(item['visual_activity']['state'],'RECENT')
        self.assertEqual(item['last_work_event']['action'],'工作已完成')
    def test_claude_interruption_ends_the_turn(self):
        item=self.claude([tool_use(9),{'type':'user','message':{'content':[{'type':'text','text':'[Request interrupted by user]'}]},'timestamp':stamp(4)}])
        self.assertEqual(item['visual_activity']['state'],'RECENT')
        self.assertEqual(item['last_work_event']['action'],'工作已中斷')
    def test_stale_claude_work_stops_glowing(self):
        self.assertEqual(self.claude([tool_use(120)])['visual_activity']['state'],'RECENT')
    def test_journal_outside_the_native_store_is_ignored(self):
        outside=tempfile.TemporaryDirectory()
        self.addCleanup(outside.cleanup)
        path=Path(outside.name)/'sid.jsonl'
        path.write_text(json.dumps(tool_use(1)),encoding='utf-8')
        item={'agent':'CLAUDE','source':'CLAUDE_NATIVE_SESSION','provenance':{'journal':{'path':str(path)}}}
        enrich({'native_coverage':{'observations':[item]}},self.home)
        self.assertNotIn('visual_activity',item)
    def test_codex_journal_still_reports_work(self):
        path=self.journal('.codex/sessions/2026/r.jsonl',[{'type':'event_msg','payload':{'type':'task_started'},'timestamp':stamp(3)}])
        item={'agent':'CHATGPT_WORK','source':'CODEX_NATIVE_JOURNAL','provenance':{'path':str(path)}}
        enrich({'native_coverage':{'observations':[item]}},self.home)
        self.assertEqual(item['visual_activity']['state'],'WORKING')
    def test_linked_worktree_belongs_to_its_repository(self):
        repo=self.home/'Star_Office_UI'
        (repo/'.git'/'worktrees'/'feature').mkdir(parents=True)
        tree=repo/'.claude'/'worktrees'/'feature'
        tree.mkdir(parents=True)
        (tree/'.git').write_text('gitdir: '+str(repo/'.git'/'worktrees'/'feature').replace('\\','/')+'\n',encoding='utf-8')
        self.assertEqual(repo_context(tree)['name'],'Star_Office_UI')
        self.assertEqual(repo_context('\\\\?\\'+str(repo/'src'))['name'],'Star_Office_UI')
        self.assertIsNone(repo_context(''))
    def test_missing_native_coverage_is_left_alone(self):
        self.assertEqual(enrich({'native_coverage':None},self.home),{'native_coverage':None})

if __name__=='__main__':
    unittest.main()
