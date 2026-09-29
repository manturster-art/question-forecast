# 역할: deploy/build_public.py 시험. 복사 전 세 관문(①자체 시험판 흔적 ②누출 검사
# ③deploy/public/ 정갈함)이 실제로 막는지, 정상판이면 두 파일만 생기는지 본다.
# 실제 wrangler deploy 는 여기서 하지 않는다(그건 사용자 승인 뒤 사람이 한다).
import json
import pytest
from dcc import paths
from deploy import build_public as bp


def _html(data, extra_scripts=''):
    return ('<!doctype html><html><head></head><body><div id="app"></div>'
            '<script>window.DCC_DATA=' + json.dumps(data, ensure_ascii=False) +
            ';window.DCC_PROMPTS={};window.DCC_BUILT="2026-09-27";window.DCC_BRAND={};</script>'
            '<script>' + extra_scripts + '</script></body></html>')


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'OUT', tmp_path / 'out')
    monkeypatch.setattr(paths, 'WORK', tmp_path / 'work')
    monkeypatch.setattr(bp, 'PUBLIC', tmp_path / 'deploy_public')
    paths.ensure()
    return tmp_path


def _write_src(env, html):
    src = paths.OUT / '부서점검표.html'
    src.write_text(html, encoding='utf-8')
    return src


def test_refuses_when_selftest_trace_is_present(env):
    _write_src(env, _html({"findings": []}, extra_scripts='DCC_SELFTEST.run()  // selftest'))
    with pytest.raises(bp.BuildRefusal, match='selftest'):
        bp.build()
    assert not bp.PUBLIC.exists()


def test_refuses_when_dcc_data_leaks_a_name(env):
    # 「홍」은 흔한 성씨라 privacy.mask_names 규칙(이름+직함) 자체에 걸린다 — 이름 사전
    # 캐시가 없어도 걸려야 한다.
    _write_src(env, _html({"findings": [{"title": "홍길동의원 지적사항"}]}))
    with pytest.raises(bp.BuildRefusal, match='누출|이름'):
        bp.build()
    assert not bp.PUBLIC.exists()


def test_refuses_when_name_cache_lists_the_leaked_word(env):
    (paths.WORK / 'names_public.json').write_text(json.dumps(['가나다']), encoding='utf-8')
    _write_src(env, _html({"findings": [{"note": "가나다 관련 예산이 늘었다"}]}))
    with pytest.raises(bp.BuildRefusal):
        bp.build()
    assert not bp.PUBLIC.exists()


def test_refuses_when_public_dir_already_has_a_stray_file(env):
    _write_src(env, _html({"findings": []}))
    bp.PUBLIC.mkdir(parents=True)
    (bp.PUBLIC / 'old_leftover.txt').write_text('x', encoding='utf-8')
    with pytest.raises(bp.BuildRefusal, match='낯선'):
        bp.build()


def test_refuses_when_source_html_is_missing(env):
    with pytest.raises(bp.BuildRefusal):
        bp.build()


def test_normal_build_produces_exactly_two_files(env):
    html = _html({"findings": [], "note": "구분자 세미콜론이 섞인 문장; 이렇게"})
    _write_src(env, html)
    out_dir = bp.build()
    assert out_dir == bp.PUBLIC
    names = sorted(p.name for p in bp.PUBLIC.iterdir())
    assert names == ['index.html', 'robots.txt']
    assert (bp.PUBLIC / 'index.html').read_text(encoding='utf-8') == html
    assert (bp.PUBLIC / 'robots.txt').read_text(encoding='utf-8') == 'User-agent: *\nDisallow: /\n'


def test_council_page_is_not_copied(env):
    # 4차 의원용 페이지는 아직 배포 대상이 아니다 — out/ 에 있어도 deploy/public/ 로 가지 않는다.
    _write_src(env, _html({"findings": []}))
    (paths.OUT / '의원점검표.html').write_text(_html({"findings": []}), encoding='utf-8')
    bp.build()
    assert sorted(p.name for p in bp.PUBLIC.iterdir()) == ['index.html', 'robots.txt']
    assert 'DCC.council' not in (bp.PUBLIC / 'index.html').read_text(encoding='utf-8')


def test_extract_dcc_data_uses_raw_decode_not_naive_semicolon_split():
    # 자료 문자열 속에 ';' 이 들어 있어도(정규식으로 다음 ';' 까지 자르면 잘못 잘린다)
    # raw_decode 는 JSON 이 실제로 끝나는 자리를 찾는다.
    data = {"note": "세미콜론; 포함된 문장"}
    html = _html(data)
    assert bp.extract_dcc_data(html) == data
