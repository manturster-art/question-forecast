import json, re
import pytest
from dcc import site_build, paths

DATA = {"generated": "2026-09-25", "sources": [], "findings": [{"id": "F1", "title": "끝</script><script>alert(1)</script>", "body": "", "dept": "A과"}],
        "recurring": [], "promises": [], "expenditure": {}, "depts": []}


def test_build_inlines_everything_offline(tmp_path):
    out = site_build.build(DATA, tmp_path / 'p.html')
    t = out.read_text(encoding='utf-8')
    assert '<script src=' not in t and '<link rel="stylesheet" href=' not in t
    assert 'var kordoc' in t
    assert 'window.DCC_DATA' in t and 'window.DCC_PROMPTS' in t
    # 틀 자리표시(STYLE/KORDOC/DATA/PROMPTS/BUILT/JS)는 다 채운다. 단 프롬프트 속
    # {{대상}}/{{자료}}는 prompts.js 가 붙여넣기 시점에 채우는 자리이므로 그대로 남는다
    # (task-4-brief.md 참조 — 서버가 미리 채우면 의미가 달라진다).
    for k in ('STYLE', 'KORDOC', 'DATA', 'PROMPTS', 'BUILT', 'JS'):
        assert '{{' + k + '}}' not in t
    assert t.count('</script>') == t.count('<script')      # 자료 속 </script> 는 이스케이프
    for bad in ('fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage.setItem'):
        assert bad not in re.sub(r'var kordoc[\s\S]*?</script>', '', t)   # 번들 밖 우리 코드에 없음


def test_build_refuses_on_leak(tmp_path):
    bad = dict(DATA, findings=[{"id": "F1", "title": "<td>성 명</td>", "body": "", "dept": "A과"}])
    with pytest.raises(Exception):
        site_build.build(bad, tmp_path / 'p.html')
    assert not (tmp_path / 'p.html').exists()


# Task 2: names 를 받으면(공개 명단) 자료 속에 그 이름이 있어도 거부한다.
def test_build_refuses_when_public_name_appears_in_data(tmp_path):
    bad = dict(DATA, findings=[{"id": "F1", "title": "가나다 관련 지적", "body": "", "dept": "A과"}])
    with pytest.raises(Exception):
        site_build.build(bad, tmp_path / 'p.html', names=['가나다'])
    assert not (tmp_path / 'p.html').exists()
    site_build.build(bad, tmp_path / 'p.html', names=['라마바'])   # 없는 이름은 안 걸린다
    assert (tmp_path / 'p.html').exists()


def test_inline_json_escapes():
    s = site_build.inline_json({"a": "</script> "})
    assert '</' not in s and '\\u2028' in s


# Task 8: 자체 시험(selftest) 러너는 dcc/site_build.build(..., selftest=True) 일 때만 붙는다.
# 기본값(출하판)은 이 흔적을 하나도 담지 않는지 확인한다(브라우저 통신 API 이름 감시 코드까지 포함).
def test_shipped_build_excludes_selftest(tmp_path):
    out = site_build.build(DATA, tmp_path / 'p.html')
    t = out.read_text(encoding='utf-8')
    assert 'selftest' not in t
    assert 'DCC.selftestFixture' not in t


# 최종 검토 수정 1: 머리의 「갱신」 날짜는 굽는 날(DCC_BUILT)이 아니라 자료 생성일(DCC_DATA.generated)
# 이고, 마감 연도 판정도 자료 연도(core.dataYear)로 한다 — 보는 PC 의 시계가 바뀌어도 같은 화면.
def test_header_date_and_closed_year_come_from_generated(tmp_path):
    t = site_build.build(DATA, tmp_path / 'p.html').read_text(encoding='utf-8')
    ui = t[t.index('root.DCC.ui = ui') - 120000:]
    header = re.search(r'function renderHeader\(\) \{([\s\S]*?)\n  \}', ui).group(1)
    assert "id: 'data-date'" in header
    assert re.search(r"'data-date'[^\n]*DCC_DATA\.generated", header)
    start = re.search(r'function start\(\) \{([\s\S]*?)\n  \}', ui).group(1)
    assert re.search(r'core\.index\(root\.DCC_DATA, root\.DCC\.core\.dataYear\(root\.DCC_DATA', start)


# 최종 검토 수정 5: 자리표시는 한 번에 바꾼다 — 자료 속 「{{JS}}」 같은 글자가 뒤따르는 치환에
# 다시 걸려 코드가 자료 안에 들어가는 일이 없어야 한다.
def test_placeholders_in_data_are_not_resubstituted(tmp_path):
    d = dict(DATA, findings=[{"id": "F1", "title": "제목 {{JS}} {{STYLE}} {{BUILT}}", "body": "", "dept": "A과"}])
    t = site_build.build(d, tmp_path / 'p.html').read_text(encoding='utf-8')
    assert '제목 {{JS}} {{STYLE}} {{BUILT}}' in t
    assert t.count('function renderHeader()') == 1


# 3차 Task 0 (a): 자체 시험판에만 들어가는 PDF 견본 — 있고, 30KB 이하이고, 진짜 PDF 머리로 시작한다.
def test_selftest_fixture_has_small_pdf():
    import base64
    src = (paths.ROOT / 'site' / 'js' / 'selftest_fixture.js').read_text(encoding='utf-8')
    m = re.search(r"pdf: '([A-Za-z0-9+/=]+)'", src)
    assert m, 'selftest_fixture.js 에 pdf 견본이 없습니다'
    raw = base64.b64decode(m.group(1))
    assert raw.startswith(b'%PDF-') and len(raw) <= 30 * 1024


# Task 4c: Geist·Geist Mono 는 base64 woff2 로 CSS 안에 들어가고(오프라인), 바깥 글꼴 주소는 없다.
def test_fonts_are_inlined_offline(tmp_path):
    t = site_build.build(DATA, tmp_path / 'p.html').read_text(encoding='utf-8')
    style = t[t.index('<style>'):t.index('</style>')]
    assert style.count('@font-face') == 2
    assert "font-family:'Geist'" in style and "font-family:'Geist Mono'" in style
    assert 'url(data:font/woff2;base64,' in style
    assert site_build.FONT_SLOT not in style
    assert not re.search(r'url\((?!data:)', style)          # 바깥 주소(url(http…)·url(fonts/…)) 없음
    assert '@import' not in style
    assert (paths.ROOT / 'site' / 'fonts' / 'OFL.txt').exists()
    # 글꼴 몫은 200KB 안(Task 4c 조건)
    assert len(site_build.font_css()) < 200 * 1024


# 4차 Task 4: 의원용 페이지는 같은 자료로 틀·JS·프롬프트·이름만 바꿔 따로 굽는다.
def _fixture_site():
    return dict(DATA, committees=[], unassigned=[], council={"exec_low": 60, "exec_high": 100})


def test_council_page_builds_and_has_no_selftest(tmp_path):
    site = json.loads((paths.OUT / 'site_data.json').read_text(encoding='utf-8')) if (paths.OUT / 'site_data.json').exists() else _fixture_site()
    out = site_build.build(site, tmp_path / '의원점검표.html', page='council')
    html = out.read_text(encoding='utf-8')
    assert 'DCC.council.start()' in html and 'DCC.ui.start()' not in html
    assert 'council_selftest' not in html and 'selftest' not in html.lower()
    assert '질문 예보 — 의원용' in html


def test_council_page_uses_council_prompts_and_js(tmp_path):
    t = site_build.build(_fixture_site(), tmp_path / 'c.html', page='council').read_text(encoding='utf-8')
    m = re.search(r'window\.DCC_PROMPTS=(\{.*?\});window\.DCC_BUILT', t)
    prompts = json.loads(m.group(1))
    assert sorted(prompts) == ['업무보고', '예산심의', '행감']
    assert all('{{지자체}}' not in v and '{{대상}}' in v and '{{자료}}' in v for v in prompts.values())
    assert 'root.DCC.kit' in t and 'root.DCC.councilCore' in t and 'root.DCC.council' in t
    assert 'root.DCC.ui = ui' not in t                      # 집행부 화면 코드는 안 들어간다
    dept = site_build.build(_fixture_site(), tmp_path / 'd.html').read_text(encoding='utf-8')
    assert 'root.DCC.council' not in dept and '행감대비' in dept


def test_council_selftest_build_appends_runner(tmp_path):
    t = site_build.build(_fixture_site(), tmp_path / 's.html', page='council', selftest=True).read_text(encoding='utf-8')
    assert 'DCC.selftestFixture' in t and 'DCC.council.start()' in t


def test_unknown_page_is_an_error(tmp_path):
    with pytest.raises(ValueError):
        site_build.build(_fixture_site(), tmp_path / 'x.html', page='nope')


# 최종 검토 Minor 9: 의원용 굽기도 누출(성명 칸·공개 명단 이름)이 있으면 파일을 쓰지 않는다.
def test_council_build_refuses_on_leak(tmp_path):
    bad = dict(_fixture_site(), findings=[{"id": "F1", "title": "<td>성 명</td>", "body": "", "dept": "A과"}])
    with pytest.raises(Exception):
        site_build.build(bad, tmp_path / 'c.html', page='council')
    assert not (tmp_path / 'c.html').exists()
    named = dict(_fixture_site(), findings=[{"id": "F1", "title": "가나다 관련 지적", "body": "", "dept": "A과"}])
    with pytest.raises(Exception):
        site_build.build(named, tmp_path / 'c.html', page='council', names=['가나다'])
    assert not (tmp_path / 'c.html').exists()


# 2026-09-29 예보 시작 화면: 의원용 날씨 구간은 config/council.json 「weather」이고, 옛 site_data.json(weather 없음)으로
# --site-only 로 구워도 굽는 때 config 를 얹어 빠지지 않는다.
def test_council_config_has_weather_thresholds():
    cfg = json.loads((paths.CONFIG / 'council.json').read_text(encoding='utf-8'))
    w = cfg['weather']
    assert isinstance(w, list) and len(w) >= 2
    assert all(isinstance(x.get('icon'), str) and x['icon'] for x in w)
    maxes = [x['max'] for x in w[:-1]]
    assert all(isinstance(m, int) for m in maxes) and maxes == sorted(maxes) and len(set(maxes)) == len(maxes)
    assert 'max' not in w[-1]                                   # 마지막 구간은 「그보다 많은 것 모두」
    assert [x['icon'] for x in w] == ['맑음', '구름 조금', '흐림', '비']


def test_council_build_injects_weather_from_config(tmp_path):
    site = dict(_fixture_site(), findings=[{"id": "F1", "title": "지적", "body": "", "dept": "A과"}])
    t = site_build.build(site, tmp_path / 'c.html', page='council').read_text(encoding='utf-8')
    m = re.search(r'window\.DCC_DATA=(\{.*?\});window\.DCC_PROMPTS', t)
    data = json.loads(m.group(1))
    assert data['council']['weather'][0] == {"max": 0, "icon": "맑음"}
    assert data['council']['exec_low'] == 60
    dept = site_build.build(_fixture_site(), tmp_path / 'd.html').read_text(encoding='utf-8')
    assert '"weather"' not in dept                              # 직원용 자료에는 날씨 구간을 넣지 않는다
