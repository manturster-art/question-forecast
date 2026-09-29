import json
from pathlib import Path

import pytest

from dcc import names_public, paths, privacy

FIXTURE = Path(__file__).parent / 'fixtures' / 'member_list.html'
MAYOR_FIXTURE = Path(__file__).parent / 'fixtures' / 'mayor_profile.html'


@pytest.fixture
def work(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path / 'work')
    paths.WORK.mkdir(parents=True, exist_ok=True)
    return tmp_path


def test_parse_members_extracts_names_from_fixture():
    html = FIXTURE.read_text(encoding='utf-8')
    assert names_public.parse_members(html) == ['가나다', '라마바']


def test_parse_members_strips_embedded_space_from_a_spaced_name():
    # 실제 쪽에서 두 글자 이름이 「김 신」처럼 칸 사이에 공백이 들어간 채 나올 수 있다
    # (브리프 인터페이스: parse_members 는 「이름 2~4자, 공백 제거」). 가짜 이름으로 재현.
    html = '<div class="name">\n\t<strong>마 바</strong>\n</div>'
    assert names_public.parse_members(html) == ['마바']


def test_parse_mayor_strips_embedded_space_from_a_spaced_name():
    html = '<p class="name">가나시장 <span>사 아</span></p>'
    assert names_public.parse_mayor(html) == '사아'


def test_parse_members_ignores_empty_template_stub():
    # district.do 의 자바스크립트 템플릿 견본: <p class="name"></p> (alt 는 「홍길동」 견본이지만
    # <div class="name"><strong>…</strong>> 꼴이 아니라 안 걸린다)
    assert names_public.parse_members('<img alt="홍길동" /><p class="name"></p>') == []


def test_parse_mayor_extracts_name_from_fixture():
    html = MAYOR_FIXTURE.read_text(encoding='utf-8')
    assert names_public.parse_mayor(html) == '사아자'


def test_parse_mayor_returns_none_when_missing():
    assert names_public.parse_mayor('<p class="name">엉뚱한 칸</p>') is None


def test_generations_reads_th_sch_tabs_and_falls_back_to_one_page():
    page = '<a href="?th_sch=9">9대</a><a href="?th_sch=1">1대</a>'
    assert names_public._generations(page) == [1, 9]
    assert names_public._generations('탭이 없는 쪽') == []


# 시험 먼저(Step 2): 가짜 이름 둘을 뽑고, 거둔 이름이 사전에 들어가면 assert_no_leak 가 거부한다
# (기존 동작 재확인).
def test_names_from_fixture_trigger_leak_check():
    names = names_public.parse_members(FIXTURE.read_text(encoding='utf-8'))
    assert set(names) == {'가나다', '라마바'}
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({'x': '가나다 관련 업무 보고'}, names)
    privacy.assert_no_leak({'x': '아무 관련 없는 업무 보고'}, names)


def test_fetch_names_offline_reads_cache(work):
    (paths.WORK / 'names_public.json').write_text(
        json.dumps(['가나다', '라마바'], ensure_ascii=False), encoding='utf-8')
    assert names_public.fetch_names(offline=True) == ['가나다', '라마바']


def test_fetch_names_offline_without_cache_returns_empty(work):
    assert names_public.fetch_names(offline=True) == []


def test_fetch_names_online_merges_members_and_mayor_and_writes_cache(work, monkeypatch):
    pages = {
        names_public.district_url(): FIXTURE.read_text(encoding='utf-8'),
        names_public.chronicle_url(): '탭이 없는 쪽',
        names_public.mayor_url(): MAYOR_FIXTURE.read_text(encoding='utf-8'),
    }

    def fake_get(url, **kw):
        return pages[url].encode('utf-8')
    monkeypatch.setattr(names_public.http, 'get', fake_get)

    names = names_public.fetch_names(offline=False)
    assert names == ['가나다', '라마바', '사아자']
    cached = json.loads((paths.WORK / 'names_public.json').read_text(encoding='utf-8'))
    assert cached == names


def test_fetch_names_falls_back_to_cache_on_network_error(work, monkeypatch):
    (paths.WORK / 'names_public.json').write_text(
        json.dumps(['가나다'], ensure_ascii=False), encoding='utf-8')

    def boom(url, **kw):
        raise RuntimeError('curl 실패')
    monkeypatch.setattr(names_public.http, 'get', boom)
    assert names_public.fetch_names(offline=False) == ['가나다']


# 1차 고침(컨트롤러 지시 f): 누리집 개편·일부 장애로 쪽 꼴이 바뀌면 예외 없이 그냥 0명이나
# 아주 적은 수만 뽑힐 수 있다 — 그 적은 수로 캐시를 덮어쓰면 검사망이 확 좁아진다. 새로
# 받은 수가 0 이거나 캐시의 절반에 못 미치면 받은 것을 버리고 캐시를 그대로 쓴다.
def test_fetch_names_keeps_old_cache_when_online_fetch_returns_zero(work, monkeypatch, capsys):
    (paths.WORK / 'names_public.json').write_text(
        json.dumps(['가나다', '라마바', '사아자', '차카타'], ensure_ascii=False), encoding='utf-8')

    def empty_get(url, **kw):
        return '<html>꼴이 바뀐 쪽</html>'.encode('utf-8')
    monkeypatch.setattr(names_public.http, 'get', empty_get)

    names = names_public.fetch_names(offline=False)
    assert names == ['가나다', '라마바', '사아자', '차카타']
    assert '캐시' in capsys.readouterr().out


def test_fetch_names_keeps_old_cache_when_online_fetch_is_under_half(work, monkeypatch):
    # 캐시 4명 중 1명(25%, 절반 미만)만 새로 받히면 캐시를 그대로 쓴다.
    cache = ['가나다', '라마바', '사아자', '차카타']
    (paths.WORK / 'names_public.json').write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
    pages = {
        names_public.district_url(): '<html>꼴이 바뀐 쪽</html>',
        names_public.chronicle_url(): '탭이 없는 쪽',
        names_public.mayor_url(): MAYOR_FIXTURE.read_text(encoding='utf-8'),  # 사아자 하나만
    }

    def fake_get(url, **kw):
        return pages[url].encode('utf-8')
    monkeypatch.setattr(names_public.http, 'get', fake_get)

    assert names_public.fetch_names(offline=False) == cache


def test_fetch_names_accepts_online_fetch_at_or_above_half(work, monkeypatch):
    # 캐시 4명 중 딱 절반(2명, district 만 유효)이면 「절반에 못 미침」이 아니므로 그대로 받는다.
    (paths.WORK / 'names_public.json').write_text(
        json.dumps(['가나다', '라마바', '사아자', '차카타'], ensure_ascii=False), encoding='utf-8')
    pages = {
        names_public.district_url(): FIXTURE.read_text(encoding='utf-8'),  # 가나다·라마바(딱 절반)
        names_public.chronicle_url(): '탭이 없는 쪽',
        names_public.mayor_url(): '<p class="name">엉뚱한 칸</p>',
    }

    def fake_get(url, **kw):
        return pages[url].encode('utf-8')
    monkeypatch.setattr(names_public.http, 'get', fake_get)

    assert names_public.fetch_names(offline=False) == ['가나다', '라마바']

