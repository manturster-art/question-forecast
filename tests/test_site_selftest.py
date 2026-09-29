import json, re, shutil, subprocess
from pathlib import Path
import pytest
from dcc import paths

EDGE = next((p for p in [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                         r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'] if Path(p).exists()), None)


@pytest.mark.skipif(EDGE is None, reason='Edge 없음')
def test_selftest_passes(tmp_path):
    html = paths.OUT / '부서점검표_selftest.html'
    if not html.exists():
        pytest.skip('먼저 python run.py --site-only (부서점검표_selftest.html 을 함께 굽는다)')
    page = tmp_path / 'p.html'
    shutil.copy(html, page)
    url = page.as_uri() + '?selftest'
    r = subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-first-run',
                        f'--user-data-dir={tmp_path / "prof"}', '--virtual-time-budget=60000', '--dump-dom', url],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    m = re.search(r'<pre id="selftest">(.*?)</pre>', r.stdout, re.S)
    assert m, r.stdout[-2000:]
    res = json.loads(m.group(1).replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))
    assert res['ok'], json.dumps(res, ensure_ascii=False, indent=1)


# 3차 Task 0: 자체 시험에 PDF 첨부(네트워크 0 포함)·초과 집행 설명·국 공통 지적 단계가 들어 있어야 한다.
REQUIRED_STEPS = {'PDF 첨부', '초과 집행 설명', '국 공통 지적',
                  # 3차 Task 4e: 분류색·글자 크기·테마·홈·시작 화면 검색
                  '분류색', '글자 크기', '테마 세 단계', '처음으로', '시작 화면 검색',
                  # 3차 최종 고침(2026-09-28): 구 실·국은 구청 부서 먼저, 동 뒤. 구청·보건소·보좌기관 묶음 없음
                  '구 부서 순서',
                  # 2026-09-29: 시작 화면은 사이드바 없이 온 폭, 고르면 사이드바, 처음으로 가면 다시 감춤
                  '시작 화면 온 폭', '선택 뒤 사이드바', '처음으로 사이드바 감춤',
                  # 2026-09-29: 예보 시작 화면(레이더·발표 줄·전체 예보 띠), 직원용에는 부서 날씨 그림 없음
                  '예보 시작 화면', '날씨 그림 없음'}


@pytest.mark.skipif(EDGE is None, reason='Edge 없음')
def test_selftest_has_submission_steps(tmp_path):
    html = paths.OUT / '부서점검표_selftest.html'
    if not html.exists():
        pytest.skip('먼저 python run.py --site-only')
    page = tmp_path / 'p.html'
    shutil.copy(html, page)
    r = subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-first-run',
                        f'--user-data-dir={tmp_path / "prof"}', '--virtual-time-budget=60000', '--dump-dom',
                        page.as_uri() + '?selftest'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    m = re.search(r'<pre id="selftest">(.*?)</pre>', r.stdout, re.S)
    assert m, r.stdout[-2000:]
    res = json.loads(m.group(1).replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))
    names = {s['name'] for s in res['steps']}
    assert REQUIRED_STEPS <= names, sorted(names)
    assert all(s['ok'] for s in res['steps'] if s['name'] in REQUIRED_STEPS), res
