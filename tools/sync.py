# 역할: 주 1회(작업 스케줄러) 자동으로 자료를 살펴보고, 바뀐 것이 있을 때만 다시 굽는다.
#   python tools/sync.py
#
# 동작(Task 4d 계획대로):
#   1. 의회 누리집 목록만 받아 work/lists.json(캐시)과 견줘 새 uid(결과보고서·답변요지서)가
#      있는지 본다. 세출은 work/sync_state.json 에 적어 둔 마지막 갱신일에서
#      config/sync.json 의 expenditure_every_days 가 지났는지로 판단한다.
#   2. 둘 다 아니면 「바뀐 것 없음」을 work/sync.log 에 적고 끝낸다(run.py 를 부르지 않는다).
#   3. 바뀐 것이 있으면, 세출 주기가 됐을 때만 세출 캐시(work/세출/*.xls)를 먼저 새로
#      받아 두고(expenditure.load(refresh=True)) — 결과보고서·답변요지서까지 통째로
#      --refresh 하지 않는다 — 이어서 run.main([]) 을 그대로 부른다. run.py 의 안전장치
#      (건수 급감 덮어쓰기 거부·이름 누출 검사)는 그대로 적용된다.
#   4. 성공하면 out/부서점검표.html·out/의원점검표.html(과 두 자체 시험판)이 이미 최신이다(run.main →
#      run.build_site 가 네 파일을 굽는다). 의원용은 배포 대상이 아니다. auto_deploy 가
#      true 일 때만 deploy/build_public.py → wrangler deploy 를 부른다. 기본값 false —
#      사용자가 공개 URL 첫 게시와 자동 배포를 승인하기 전까지는 켜지 않는다.
#   5. 모든 실행을 work/sync.log 한 줄로 남긴다(UTF-8). 실패해도 out/ 의 기존 산출물은
#      손대지 않는다(run.py 자신이 부분 덮어쓰기를 하지 않는다 — overwrite_refusal 참조).
#   6. 잠금 파일(work/sync.lock)로 동시 실행을 막는다. 6시간 넘게 오래된 잠금은 죽은
#      것으로 보고 무시한다(전 실행이 비정상 종료됐을 때 영영 막히지 않게).
#
# 네트워크는 dcc/http.py(curl.exe) 만 거친다(cs.fetch_lists·expenditure.load 를 통해).
# TLS 설정은 건드리지 않는다.
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import run  # noqa: E402  (ROOT 를 sys.path 에 넣은 뒤에만 된다)
from dcc import council_site as cs, expenditure, paths  # noqa: E402

STALE_LOCK_HOURS = 6


def _lock_path():
    return paths.WORK / 'sync.lock'


def _state_path():
    return paths.WORK / 'sync_state.json'


def load_config():
    p = ROOT / 'config' / 'sync.json'
    return json.loads(p.read_text(encoding='utf-8'))


def load_state():
    p = _state_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except (ValueError, OSError):
        return {}


def save_state(state):
    _state_path().write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def is_locked(now=None):
    """잠금 파일이 있고 아직 오래되지 않았으면 True. 오래됐으면(죽은 잠금) 무시하고 False."""
    lock = _lock_path()
    if not lock.exists():
        return False
    now = now if now is not None else datetime.datetime.now().timestamp()
    age_hours = (now - lock.stat().st_mtime) / 3600
    return age_hours < STALE_LOCK_HOURS


def acquire_lock():
    _lock_path().parent.mkdir(parents=True, exist_ok=True)
    _lock_path().write_text(datetime.datetime.now().isoformat(), encoding='utf-8')


def release_lock():
    try:
        _lock_path().unlink()
    except FileNotFoundError:
        pass


def load_cached_lists():
    p = paths.WORK / 'lists.json'
    if not p.exists():
        return [], []
    try:
        insp, qlist = json.loads(p.read_text(encoding='utf-8'))
        return insp, qlist
    except (ValueError, OSError):
        return [], []


def diff_new(cached_insp, cached_qlist, insp, qlist):
    """새로 나타난 결과보고서·답변요지서를 uid 기준으로 고른다."""
    old_report_uids = {r['uid'] for r in cached_insp if r.get('kind') == '결과보고서'}
    old_q_uids = {q['uid'] for q in cached_qlist}
    new_reports = [r for r in insp if r.get('kind') == '결과보고서' and r['uid'] not in old_report_uids]
    new_q = [q for q in qlist if q['uid'] not in old_q_uids]
    return new_reports, new_q


def expenditure_due(state, every_days, today=None):
    last = state.get('last_expenditure_refresh')
    if not last:
        return True
    today = today if today is not None else datetime.date.today()
    return (today - datetime.date.fromisoformat(last)).days >= every_days


DEFAULT_WRANGLER = str(ROOT / 'deploy' / 'node_modules' / '.bin' / 'wrangler')


def maybe_deploy(cfg):
    """auto_deploy 가 true 일 때만 배포한다. 기본은 false — 이 함수는 그때만 wrangler 를 부른다."""
    if not cfg.get('auto_deploy'):
        return '꺼짐'
    from deploy import build_public
    import subprocess
    build_public.build()
    # 최종 검토 Minor 3: npx 는 deploy/ 에 package.json 이 없어 레지스트리에서 최신 wrangler 를 받을 수 있다.
    # 계획서대로 고정한 로컬 wrangler(config/sync.json 의 wrangler)를 부른다.
    wrangler = cfg.get('wrangler') or DEFAULT_WRANGLER
    if not Path(wrangler).is_absolute():      # 상대 경로는 저장소 뿌리 기준(config/sync.json 기본값)
        wrangler = str(ROOT / wrangler)
    if not Path(wrangler).exists() and not Path(wrangler + '.cmd').exists():
        raise RuntimeError(f'wrangler 가 없습니다: {wrangler}')
    exe = wrangler + '.cmd' if sys.platform == 'win32' and Path(wrangler + '.cmd').exists() else wrangler
    subprocess.run([exe, 'deploy'], cwd=str(ROOT / 'deploy'), check=True)
    return '켜짐'


def counts_from_out():
    """지적·약속 수를 out/ 산출물에서 읽는다. 없으면 0."""
    findings_n = promises_n = unplaced = 0
    fp = paths.OUT / 'findings_public.json'
    sp = paths.OUT / 'site_data.json'
    try:
        findings_n = len(json.loads(fp.read_text(encoding='utf-8')).get('findings', []))
    except (OSError, ValueError):
        pass
    try:
        site = json.loads(sp.read_text(encoding='utf-8'))
        promises_n = len(site.get('promises', []))
        unplaced = site.get('unplaced', 0)
    except (OSError, ValueError):
        pass
    return findings_n, promises_n, unplaced


def append_log(cfg, **fields):
    log_path = paths.ROOT / cfg.get('log', 'work/sync.log')
    log_path.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().isoformat(timespec='seconds')
    line = ' '.join([ts] + [f'{k}={v}' for k, v in fields.items()])
    with log_path.open('a', encoding='utf-8') as f:
        f.write(line + '\n')
    return line


def sync_once(cfg):
    """실제 확인·갱신을 한 번 한다(잠금은 呼出쪽에서 이미 잡았다고 본다). 로그 한 줄을 남기고 돌려준다."""
    try:
        insp, qlist = cs.fetch_lists()
    except Exception as e:
        return append_log(cfg, 새문서=0, 지적=0, 약속=0, 배포='꺼짐', 결과=f'오류: 목록을 못 받음({e})')

    cached_insp, cached_qlist = load_cached_lists()
    new_reports, new_q = diff_new(cached_insp, cached_qlist, insp, qlist)

    state = load_state()
    due = expenditure_due(state, cfg.get('expenditure_every_days', 30))

    if not new_reports and not new_q and not due:
        return append_log(cfg, 새문서=0, 지적='-', 약속='-', 배포='꺼짐', 결과='바뀐것없음')

    if due:
        try:
            expenditure.load(refresh=True)
        except Exception as e:
            return append_log(cfg, 새문서=len(new_reports) + len(new_q), 지적='-', 약속='-',
                               배포='꺼짐', 결과=f'오류: 세출 갱신 실패({e})')

    try:
        rc = run.main([])
    except Exception as e:
        return append_log(cfg, 새문서=len(new_reports) + len(new_q), 지적='-', 약속='-',
                           배포='꺼짐', 결과=f'오류: run.py 예외({e})')

    if rc != 0:
        return append_log(cfg, 새문서=len(new_reports) + len(new_q), 지적='-', 약속='-',
                           배포='꺼짐', 결과=f'오류: run.py 가 산출물을 쓰지 않음(rc={rc})')

    if due:
        state['last_expenditure_refresh'] = datetime.date.today().isoformat()
        save_state(state)

    findings_n, promises_n, unplaced = counts_from_out()
    try:
        deploy_status = maybe_deploy(cfg)
    except Exception as e:      # 최종 검토 Minor 3: 배포 예외도 로그 한 줄로 남긴다
        return append_log(cfg, 새문서=len(new_reports) + len(new_q), 지적=findings_n, 약속=promises_n,
                           부서없음=unplaced, 배포='실패', 결과=f'오류: 배포 실패({e})')
    return append_log(cfg, 새문서=len(new_reports) + len(new_q), 지적=findings_n, 약속=promises_n,
                       부서없음=unplaced, 배포=deploy_status, 결과='갱신함')


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    paths.ensure()
    cfg = load_config()
    if is_locked():
        line = append_log(cfg, 새문서=0, 지적='-', 약속='-', 배포='꺼짐', 결과='잠금중')
        print(line)
        return 0
    acquire_lock()
    try:
        line = sync_once(cfg)
    finally:
        release_lock()
    print(line)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
