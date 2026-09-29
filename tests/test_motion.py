# 모션그래픽(tools/motion): 장면 소스에 실명이 없고, 화면 숫자는 자료에서 온다(소스에 박아 두지 않는다).
# 영상 굽기(Edge·ffmpeg)는 하지 않는다. 숫자 뽑기는 node 가 있어야 돌므로 없으면 건너뛴다.
import importlib.util
import json
import re
import shutil
from pathlib import Path

import pytest

from dcc import privacy

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / 'tools' / 'motion'
_spec = importlib.util.spec_from_file_location('make_motion', HERE / 'make_motion.py')
mm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mm)

SOURCES = ['scene.js', 'scene.html', 'stats.mjs', 'capture.mjs', 'make_motion.py']
HAS_NODE = shutil.which('node') is not None


def _text():
    return '\n'.join((HERE / f).read_text(encoding='utf-8') for f in SOURCES)


def test_scene_sources_have_no_real_names():
    text = _text()
    # 이름+직함 꼴·HTML 표·「성 명」이 없어야 한다(dcc.privacy 와 같은 검사). 거둔 이름 목록이 있으면 그것도 대조한다.
    privacy.assert_no_leak([text], names=mm._names())


def test_scene_has_no_hardcoded_data_numbers():
    js = (HERE / 'scene.js').read_text(encoding='utf-8') + (HERE / 'scene.html').read_text(encoding='utf-8')
    # 자료에서 오는 값(전체 건수·부서 카드·부서 이름)이 소스에 박혀 있으면 안 된다
    for lit in ('1628', '1,628', '389', '93.9', '주택과', '도시주택국', '2018~2025', '2016~2026'):
        assert lit not in js, lit
    assert 'window.MOTION' in js and 'M.totals' in js and 'M.dept' in js
    # 부서 이름은 명령줄 기본값 한 곳에서만 정한다
    assert "DEPT = '주택과'" in (HERE / 'make_motion.py').read_text(encoding='utf-8')


def test_scene_is_offline_and_deterministic():
    js = (HERE / 'scene.js').read_text(encoding='utf-8')
    html = (HERE / 'scene.html').read_text(encoding='utf-8')
    for bad in ('fetch(', 'XMLHttpRequest', 'Math.random(', 'Date.now(', 'performance.now(', 'requestAnimationFrame(', 'http://', 'https://'):
        assert bad not in js.replace('http://www.w3.org/2000/svg', ''), bad
    assert 'https://' not in html and 'http://' not in html
    assert 'window.seek = seek' in js


def _fixture(tmp_path):
    data = {
        'generated': '2026-09-01',
        'sources': [{'kind': '결과보고서', 'year': 2024, 'com': '가', 'uid': 1, 'url': '', 'declared': 3, 'parsed': 3}],
        'findings': [
            {'id': 'F2022-가-001', 'year': 2022, 'no': 1, 'uid': 1, 'dept': '가나과', 'title': '도로 보수 철저', 'com': '가'},
            {'id': 'F2024-가-002', 'year': 2024, 'no': 2, 'uid': 1, 'dept': '가나과', 'title': '도로 보수 관리 강화', 'com': '가'},
            {'id': 'F2024-가-003', 'year': 2024, 'no': 3, 'uid': 1, 'dept': '마바과', 'title': '공원 관리', 'com': '가'},
        ],
        'recurring': [{'id': 'R001', 'dept': '가나과', 'years': [2022, 2024],
                       'finding_ids': ['F2022-가-001', 'F2024-가-002'], 'common': ['도로']}],
        'promises': [{'id': 'P1', 'dept': '가나과'}, {'id': 'P2', 'dept': '미상'}],
        'expenditure': {'가나과': [{'year': 2025, 'budget': 200, 'spent': 150, 'mended': False},
                                   {'year': 2026, 'budget': 100, 'spent': 10, 'mended': False}],
                        '마바과': [{'year': 2019, 'budget': 10, 'spent': 9, 'mended': False}]},
        'depts': [{'name': '가나과', 'silguk': '다라국', 'aliases': [], 'current': True},
                  {'name': '마바과', 'silguk': '다라국', 'aliases': [], 'current': True}],
    }
    p = tmp_path / 'site_data.json'
    p.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return p


@pytest.mark.skipif(not HAS_NODE, reason='node 없음')
def test_stats_come_from_data(tmp_path):
    st = mm.stats(_fixture(tmp_path), '가나과')
    assert st['totals'] == {'findings': 3, 'recurring': 1, 'promises': 2, 'depts': 2,
                            'findingYears': [2022, 2024], 'budgetYears': [2019, 2026]}
    d = st['dept']
    assert (d['name'], d['silguk'], d['findings'], d['recurring'], d['promises']) == ('가나과', '다라국', 2, 1, 1)
    assert (d['execRate'], d['execYear']) == (75.0, 2025)          # 자료 생성 해(2026)는 아직 마감 전
    assert d['chains'] == [{'years': [2022, 2024], 'title': '도로 보수 관리 강화'}]


@pytest.mark.skipif(not HAS_NODE, reason='node 없음')
def test_build_html_injects_data_and_checks_privacy(tmp_path):
    dst, p = mm.build_html(tmp_path / 'scene.html', _fixture(tmp_path), '가나과')
    html = dst.read_text(encoding='utf-8')
    assert '/*__DATA__*/' not in html and '/*__SCENE__*/' not in html and '/*__FONTS__*/' not in html
    assert '"가나과"' in html and p['tagline'] == mm.TAGLINE
    assert p['credit'] == mm.CREDIT == 'made by JJ' and 'org' not in p
    # 의회·사무국을 만든 이로 적지 않는다(공식 사업 아님)
    assert '의회사무처' not in html and '사무국' not in json.dumps(p, ensure_ascii=False)
    assert re.search(r"font-family:'Geist'", html)


@pytest.mark.skipif(not mm.MP4.exists(), reason='모션그래픽 영상 없음 — python tools/motion/make_motion.py')
def test_mp4_format():
    _v = importlib.util.spec_from_file_location('make_video', ROOT / 'tools' / 'video' / 'make_video.py')
    mv = importlib.util.module_from_spec(_v)
    _v.loader.exec_module(mv)
    info = mv.probe(mm.MP4)
    assert info['codec'] == 'h264' and (info['width'], info['height']) == (1920, 1080), info
    assert 29.9 <= info['duration'] <= 30.1 and not info['audio'], info
