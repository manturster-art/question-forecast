# 의원용 페이지(4차 Task 7) 자체 시험: out/의원점검표_selftest.html 을 Edge 헤드리스로 ?selftest 로 열어
# site/js/council_selftest.js 의 30단계가 모두 통과하는지 본다(tests/test_site_selftest.py 와 같은 꼴).
import json, re, shutil, subprocess
from pathlib import Path
import pytest
from dcc import paths

EDGE = next((p for p in [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                         r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'] if Path(p).exists()), None)

STEPS = ['상임위 카드 네 장', '시작 화면 사이드바 없음', '예보 시작 화면', '상임위 밖 묶음 카드', '상임위 부서 표', '부서 이름 정렬',
         '상임위 화면 사이드바', '사이드바 수 = 표 합계', '날씨 아이콘 = 물을 거리', '사이드바 부서 열기', '상임위 첨부 반영', '첨부 반영 뒤 사이드바 수',
         '첨부 반영 뒤 날씨', '질문 후보 묶음',
         '프롬프트 복사', '미리 보기 = 복사 글', '후보 고르기 → 미리 보기', '회기 → 미리 보기 문구', '질문 목록 CSV', '1쪽 브리핑', '재반영 뒤 고른 후보 정리',
         '부서 탭 순서', '질문 후보 탭 요약', '질문 후보 탭 예산', '지적 탭 이행 반영', '되풀이 탭 연도 사슬', '예산 탭 그래프·숫자표', '주소 tab 왕복', '처음으로·글자 크기 유지', '네트워크·저장소 0']


def _run(tmp_path):
    html = paths.OUT / '의원점검표_selftest.html'
    if not html.exists():
        pytest.skip('먼저 python run.py --site-only (의원점검표_selftest.html 을 함께 굽는다)')
    page = tmp_path / 'p.html'
    shutil.copy(html, page)
    r = subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-first-run',
                        f'--user-data-dir={tmp_path / "prof"}', '--virtual-time-budget=60000', '--dump-dom',
                        page.as_uri() + '?selftest'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    m = re.search(r'<pre id="selftest">(.*?)</pre>', r.stdout, re.S)
    assert m, r.stdout[-2000:]
    return json.loads(m.group(1).replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))


@pytest.mark.skipif(EDGE is None, reason='Edge 없음')
def test_council_selftest_passes(tmp_path):
    res = _run(tmp_path)
    assert [s['name'] for s in res['steps']] == STEPS, [s['name'] for s in res['steps']]
    assert res['ok'], json.dumps(res, ensure_ascii=False, indent=1)
