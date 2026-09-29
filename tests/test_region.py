# 역할: 지자체별 값이 config/region.json 한 곳에서만 온다는 것을 지킨다(Task 4b).
# (1) region.json 을 가짜 지자체(「마바시」)로 바꾸면 수집 주소·화면 지자체명·프롬프트 [역할]
#     문구가 따라 바뀐다. (2) 코드(dcc/·site/·prompts/·run.py)에 가나 전용 글자가 남지 않았다.
import contextlib
import json
import re
import shutil
import subprocess

import pytest

from dcc import council_site, depts, expenditure, findings, names_public, paths, qna, region, site_build

FAKE_BASE = 'https://council.maba.example'


@contextlib.contextmanager
def fake_region(tmp_path, monkeypatch):
    """config 를 가짜 지자체(마바시, 구 「마바」)로 바꿔 끼우고, 끝나면 가나 값으로 되돌린다.

    부서 규칙의 정규식·캐시는 import 때 만들어지므로 들어갈 때와 나올 때 region.refresh() 를
    부른다. 나올 때는 monkeypatch 를 먼저 되돌려야 refresh 가 원래 config 를 읽는다.
    """
    cfg = tmp_path / 'config'
    shutil.copytree(paths.CONFIG, cfg)
    r = json.loads((cfg / 'region.json').read_text(encoding='utf-8'))
    r['지자체명'], r['약칭'], r['의회명'] = '마바시', '마바', '마바시의회'
    r['의회']['base'] = FAKE_BASE
    r['세출']['시누리집'] = 'https://www.maba.example/budget.do?year={year}'
    r['시장소개'] = 'https://www.maba.example/mayor.do'
    r['구'] = {'마바': ['사아']}
    (cfg / 'region.json').write_text(json.dumps(r, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(paths, 'CONFIG', cfg)
    monkeypatch.setattr(paths, 'WORK', tmp_path / 'work')
    region.refresh()
    try:
        yield r
    finally:
        monkeypatch.undo()
        region.refresh()


@pytest.fixture
def maba(tmp_path, monkeypatch):
    with fake_region(tmp_path, monkeypatch) as r:
        yield r


def test_load_reads_default_example_values():
    r = region.load()
    assert r['지자체명'] == '가나시' and r['의회명'] == '가나시의회'
    assert council_site.viewer_url(29391) == r['의회']['base'] + '/viewer/pdf.do?group=bbs&uid=29391'


def test_council_addresses_follow_region(maba, monkeypatch):
    seen = []
    monkeypatch.setattr(council_site._http, 'get', lambda url, **kw: seen.append(url) or b'')
    council_site.fetch_lists()
    assert council_site.viewer_url(7) == FAKE_BASE + '/viewer/pdf.do?group=bbs&uid=7'
    assert seen and all(u.startswith(FAKE_BASE + '/') for u in seen)
    assert FAKE_BASE + '/kr/inspectionCnts.do' in seen


def test_expenditure_address_follows_region(maba, monkeypatch):
    seen = []
    monkeypatch.setattr(expenditure.http, 'get', lambda url, **kw: seen.append(url) or b'')
    with pytest.raises(RuntimeError):
        expenditure.fetch(2025)
    assert seen == ['https://www.maba.example/budget.do?year=2025']


def test_public_name_addresses_follow_region(maba, monkeypatch):
    seen = []
    monkeypatch.setattr(names_public.http, 'get', lambda url, **kw: seen.append(url) or b'')
    names_public.fetch_names(offline=False)
    assert seen[0] == FAKE_BASE + '/kr/member/district.do'
    assert FAKE_BASE + '/kr/member/chronicle.do' in seen
    assert 'https://www.maba.example/mayor.do' in seen


DATA = {"generated": "2026-09-25", "sources": [], "findings": [], "recurring": [],
        "promises": [], "expenditure": {}, "depts": []}


def test_screen_and_prompts_follow_region(maba, tmp_path):
    t = site_build.build(DATA, tmp_path / 'p.html').read_text(encoding='utf-8')
    m = re.search(r'window\.DCC_REGION=(\{.*?\});', t)
    assert m and json.loads(m.group(1))['지자체명'] == '마바시'
    prompts = json.loads(re.search(r'window\.DCC_PROMPTS=(\{.*?\});window', t).group(1))
    assert prompts and all('당신은 마바시 ' in v for v in prompts.values())
    assert '가나시' not in t and 'example.invalid' not in t


def test_default_build_prompts_say_default_city(tmp_path):
    t = site_build.build(DATA, tmp_path / 'p.html').read_text(encoding='utf-8')
    prompts = json.loads(re.search(r'window\.DCC_PROMPTS=(\{.*?\});window', t).group(1))
    assert all('당신은 가나시 ' in v and '{{지자체}}' not in v for v in prompts.values())


def test_dept_rules_follow_region_and_come_back(tmp_path):
    before = (depts.normalize('가람구 행정지원과'), depts.silguk_of('가나2동'))
    mp = pytest.MonkeyPatch()
    with fake_region(tmp_path, mp):
        assert depts.silguk_of('사아2동') == '마바구'
        assert depts.silguk_of('가나2동') != '가람구'
        assert depts.normalize('마바구 세무과').startswith('마바구')
        assert findings.BARE_GROUP_DONG_LIST.match('마바구 및 3개동')
        assert '마바시' in qna.STOPW and '가나시' not in qna.STOPW
    # 나온 뒤에는 가나 값으로 돌아온다(뒤 시험이 가짜 값을 물려받지 않는다).
    assert (depts.normalize('가람구 행정지원과'), depts.silguk_of('가나2동')) == before
    assert before == ('가람구 행정지원과', '가람구')
    assert depts.silguk_of('아름동') == '나래구'
    assert findings.BARE_GROUP_DONG_LIST.match('가람구 및 14개동, 나래구 및 17개동')
    assert '가나시' in qna.STOPW and '가나' in qna.GENERIC and '마바시' not in qna.STOPW


def test_code_has_no_region_specific_text():
    if (paths.ROOT / '.git').exists():
        files = subprocess.run(['git', 'ls-files', '-z', 'dcc', 'site', 'prompts', 'run.py'],
                               cwd=paths.ROOT, capture_output=True, check=True).stdout.decode('utf-8').split('\0')
    else:   # git 없이 푼 전달 패키지: 같은 폴더의 파일을 직접 훑는다(캐시는 뺌)
        files = ['run.py'] + [p.relative_to(paths.ROOT).as_posix() for d in ('dcc', 'site', 'prompts')
                              for p in sorted((paths.ROOT / d).rglob('*'))
                              if p.is_file() and '__pycache__' not in p.parts]
    bad = []
    for f in filter(None, files):
        text = (paths.ROOT / f).read_text(encoding='utf-8', errors='replace')
        for n, line in enumerate(text.splitlines(), 1):
            if re.search(r'example\.invalid|가나시|가나(?!다)', line, re.I):
                bad.append(f'{f}:{n}: {line.strip()[:80]}')
    assert not bad, '\n'.join(bad)
