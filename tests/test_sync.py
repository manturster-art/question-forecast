# 시험(Task 4d 계획의 다섯 가지): 새 uid 없음·주기 안 됨 → run 안 부름; 새 uid 있음 → run
# 부름; run 실패 → 산출물 그대로·로그에 오류; auto_deploy false → 배포 안 부름; 잠금 중 → 바로 끝냄.
# 네트워크는 전부 가짜(dcc.council_site.fetch_lists·dcc.expenditure.load 를 monkeypatch)로 막는다.
import datetime
import importlib.util
import json
from pathlib import Path

import pytest

from dcc import council_site as cs, expenditure, paths

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('tools_sync', ROOT / 'tools' / 'sync.py')
sync = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sync)


@pytest.fixture
def work(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'ROOT', tmp_path)
    monkeypatch.setattr(paths, 'WORK', tmp_path / 'work')
    monkeypatch.setattr(paths, 'OUT', tmp_path / 'out')
    monkeypatch.setattr(sync, 'paths', paths)
    paths.ensure()
    return tmp_path


@pytest.fixture
def cfg():
    return {"auto_deploy": False, "expenditure_every_days": 30, "log": "work/sync.log"}


def _no_run_call(monkeypatch):
    monkeypatch.setattr(sync.run, 'main', lambda argv: pytest.fail('바뀐 것이 없는데 run.main 을 불렀다'))


def test_no_new_uid_and_not_due_skips_run(work, monkeypatch, cfg):
    (paths.WORK / 'lists.json').write_text(
        json.dumps([[{"kind": "결과보고서", "uid": 1}], [{"uid": 10}]]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([{"kind": "결과보고서", "uid": 1}], [{"uid": 10}]))
    _no_run_call(monkeypatch)
    monkeypatch.setattr(expenditure, 'load', lambda **kw: pytest.fail('세출을 새로 받으면 안 된다'))

    line = sync.main([])
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '바뀐것없음' in log
    assert line == 0


def test_new_uid_triggers_run(work, monkeypatch, cfg):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([{"kind": "결과보고서", "uid": 99}], []))
    called = {}
    monkeypatch.setattr(sync.run, 'main', lambda argv: called.setdefault('argv', argv) or 0)
    (paths.OUT / 'findings_public.json').write_text(json.dumps({"findings": [{}] * 3}), encoding='utf-8')
    (paths.OUT / 'site_data.json').write_text(json.dumps({"promises": [{}] * 2}), encoding='utf-8')

    sync.main([])
    assert called['argv'] == []
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '갱신함' in log and '새문서=1' in log and '지적=3' in log and '약속=2' in log


def test_expenditure_due_triggers_run_and_refresh_even_without_new_uid(work, monkeypatch):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    # sync_state.json 없음 → expenditure_due 는 True (아직 한 번도 갱신 안 함)
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([], []))
    refreshed = {}
    monkeypatch.setattr(expenditure, 'load', lambda **kw: refreshed.setdefault('refresh', kw.get('refresh')))
    monkeypatch.setattr(sync.run, 'main', lambda argv: 0)

    sync.main([])
    assert refreshed == {'refresh': True}
    state = json.loads((paths.WORK / 'sync_state.json').read_text(encoding='utf-8'))
    assert state['last_expenditure_refresh'] == datetime.date.today().isoformat()


def test_run_failure_leaves_outputs_and_logs_error(work, monkeypatch):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([{"kind": "결과보고서", "uid": 5}], []))
    (paths.OUT / 'findings_public.json').write_text(json.dumps({"findings": [{}] * 7}), encoding='utf-8')
    before = (paths.OUT / 'findings_public.json').read_text(encoding='utf-8')
    monkeypatch.setattr(sync.run, 'main', lambda argv: 1)  # overwrite_refusal 등으로 실패

    sync.main([])
    after = (paths.OUT / 'findings_public.json').read_text(encoding='utf-8')
    assert after == before
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '오류' in log


def test_auto_deploy_false_never_calls_deploy(work, monkeypatch):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([{"kind": "결과보고서", "uid": 1}], []))
    monkeypatch.setattr(sync.run, 'main', lambda argv: 0)
    monkeypatch.setattr(sync, 'load_config',
                         lambda: {"auto_deploy": False, "expenditure_every_days": 30, "log": "work/sync.log"})

    import deploy.build_public as bp
    monkeypatch.setattr(bp, 'build', lambda: pytest.fail('auto_deploy 가 false 인데 배포를 불렀다'))

    sync.main([])
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '배포=꺼짐' in log


def test_lock_held_skips_everything(work, monkeypatch):
    lock = paths.WORK / 'sync.lock'
    lock.write_text('locked', encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: pytest.fail('잠금 중인데 목록을 받으려 했다'))
    monkeypatch.setattr(sync.run, 'main', lambda argv: pytest.fail('잠금 중인데 run 을 불렀다'))

    sync.main([])
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '잠금중' in log
    assert lock.exists()  # 남의 잠금을 건드리지 않는다


def test_stale_lock_is_ignored(work, monkeypatch):
    import os
    lock = paths.WORK / 'sync.lock'
    lock.write_text('old', encoding='utf-8')
    old = (datetime.datetime.now() - datetime.timedelta(hours=7)).timestamp()
    os.utime(lock, (old, old))
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([], []))
    called = []
    monkeypatch.setattr(sync.run, 'main', lambda argv: called.append(1) or 0)

    sync.main([])
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '바뀐것없음' in log  # 새 uid 없고 세출도 방금 갱신했으니 run 은 안 불렀다 — 잠금만 확인
    assert not lock.exists()  # 잠금을 새로 잡았다 풀었으니 파일이 없다


def test_diff_new_picks_only_unseen_uids():
    cached_insp = [{"kind": "결과보고서", "uid": 1}]
    cached_qlist = [{"uid": 10}]
    insp = [{"kind": "결과보고서", "uid": 1}, {"kind": "결과보고서", "uid": 2}, {"kind": "계획서", "uid": 3}]
    qlist = [{"uid": 10}, {"uid": 11}]
    new_reports, new_q = sync.diff_new(cached_insp, cached_qlist, insp, qlist)
    assert [r['uid'] for r in new_reports] == [2]
    assert [q['uid'] for q in new_q] == [11]


def test_expenditure_due_thresholds():
    today = datetime.date(2026, 9, 28)
    assert sync.expenditure_due({}, 30, today) is True
    assert sync.expenditure_due({"last_expenditure_refresh": "2026-08-01"}, 30, today) is True
    assert sync.expenditure_due({"last_expenditure_refresh": "2026-09-20"}, 30, today) is False


# ── 최종 검토 Minor 3: 고정 wrangler·배포 예외 기록, I2: 부서 목록 밖 지적 수 기록 ─────────
def _changed(monkeypatch, cfg):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.WORK / 'sync_state.json').write_text(
        json.dumps({"last_expenditure_refresh": datetime.date.today().isoformat()}), encoding='utf-8')
    monkeypatch.setattr(cs, 'fetch_lists', lambda: ([{"kind": "결과보고서", "uid": 1}], []))
    monkeypatch.setattr(sync.run, 'main', lambda argv: 0)
    monkeypatch.setattr(sync, 'load_config', lambda: cfg)
    (paths.OUT / 'findings_public.json').write_text(json.dumps({"findings": [{}] * 3}), encoding='utf-8')
    (paths.OUT / 'site_data.json').write_text(json.dumps({"promises": [], "unplaced": 2}), encoding='utf-8')


def test_deploy_uses_pinned_wrangler_not_npx(work, monkeypatch, tmp_path):
    fake = tmp_path / 'bin' / 'wrangler'
    fake.parent.mkdir()
    fake.write_text('', encoding='utf-8')
    _changed(monkeypatch, {"auto_deploy": True, "log": "work/sync.log", "wrangler": str(fake)})
    import deploy.build_public as bp
    import subprocess
    monkeypatch.setattr(bp, 'build', lambda: None)
    calls = []
    monkeypatch.setattr(subprocess, 'run', lambda args, **kw: calls.append(args))
    sync.main([])
    assert calls and calls[0][0] == str(fake) and calls[0][1:] == ['deploy'] and 'npx' not in calls[0]
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '배포=켜짐' in log and '부서없음=2' in log


def test_deploy_exception_is_logged(work, monkeypatch, tmp_path):
    _changed(monkeypatch, {"auto_deploy": True, "log": "work/sync.log", "wrangler": str(tmp_path / 'none' / 'wrangler')})
    import deploy.build_public as bp
    monkeypatch.setattr(bp, 'build', lambda: None)
    sync.main([])
    log = (paths.WORK / 'sync.log').read_text(encoding='utf-8')
    assert '배포=실패' in log and '오류: 배포 실패' in log


def test_config_pins_local_wrangler_and_keeps_auto_deploy_off():
    c = json.loads((ROOT / 'config' / 'sync.json').read_text(encoding='utf-8'))
    assert c['auto_deploy'] is False
    assert c['wrangler'].endswith('node_modules/.bin/wrangler')
