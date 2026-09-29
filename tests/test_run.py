import json
import pytest
import run
from dcc import council_site as cs, expenditure, kordoc_cli, paths


@pytest.fixture
def work(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path / 'work')
    monkeypatch.setattr(paths, 'OUT', tmp_path / 'out')
    paths.ensure()
    return tmp_path


def test_list_fetch_error_falls_back_to_cached_lists(work, monkeypatch):
    (paths.WORK / 'lists.json').write_text(json.dumps([[{"kind": "결과보고서"}], []]), encoding='utf-8')

    def boom():
        raise RuntimeError('curl 실패')
    monkeypatch.setattr(cs, 'fetch_lists', boom)
    problems = []
    insp, qlist = run.load_lists(offline=False, problems=problems)
    assert insp == [{"kind": "결과보고서"}] and qlist == []
    assert problems and '캐시' in problems[0]


def test_offline_md_of_uses_md_cache_without_pdf(work, monkeypatch):
    (paths.WORK / 'md' / '7.md').write_text('캐시된 마크다운 ' * 30, encoding='utf-8')
    monkeypatch.setattr(cs, 'download_pdf', lambda *a: pytest.fail('offline 인데 받으려 했다'))
    assert run.md_of(7, refresh=False, offline=True).startswith('캐시된')
    with pytest.raises(RuntimeError):
        run.md_of(8, refresh=False, offline=True)


def test_refresh_redownloads_and_reconverts(work, monkeypatch):
    pdf = paths.WORK / 'pdf' / '7.pdf'
    pdf.write_bytes(b'%PDF old')
    seen = {}
    monkeypatch.setattr(cs, 'download_pdf', lambda uid, dest: seen.setdefault('dl', not dest.exists()))
    monkeypatch.setattr(kordoc_cli, 'to_markdown', lambda src, refresh=False: seen.setdefault('rf', refresh) and 'md')
    run.md_of(7, refresh=True, offline=False)
    assert seen == {'dl': True, 'rf': True}


def test_source_warnings_flag_missing_declared_and_zero_parsed():
    w = run.source_warnings({"year": 2018, "com": "도시건설"}, {"declared": None, "findings": []})
    assert any('선언' in x for x in w) and any('0건' in x for x in w)
    assert run.source_warnings({"year": 2025, "com": "총무경제"}, {"declared": 1, "findings": [{}]}) == []
    assert run.source_warnings({"year": 2025, "com": "총무경제"}, {"declared": 2, "findings": [{}]})


def test_overwrite_guard(work):
    assert run.overwrite_refusal(0, force=False)
    assert run.overwrite_refusal(0, force=True) is None
    assert run.overwrite_refusal(10, force=False) is None            # 앞선 파일 없음
    (paths.OUT / 'findings_public.json').write_text(json.dumps({"findings": [{}] * 100}), encoding='utf-8')
    assert run.overwrite_refusal(69, force=False)                    # 31% 줄어듦
    assert run.overwrite_refusal(70, force=False) is None
    assert run.overwrite_refusal(69, force=True) is None


def test_main_offline_refuses_to_write_when_nothing_parsed(work, capsys):
    (paths.WORK / 'lists.json').write_text(json.dumps([[], []]), encoding='utf-8')
    (paths.OUT / 'findings_public.json').write_text(json.dumps({"findings": [{}] * 5}), encoding='utf-8')
    assert run.main(['--offline']) != 0
    assert json.loads((paths.OUT / 'findings_public.json').read_text(encoding='utf-8')) == {"findings": [{}] * 5}
    assert '쓰지 않았' in capsys.readouterr().out


# ── Task 0: 번호 항목 없이 글머리 모드로 읽힌 비-의회운영 보고서는 경고한다 ────────
def test_main_warns_when_non_uihoe_report_falls_back_to_circle_mode(work, monkeypatch, capsys):
    uid = 42
    (paths.WORK / 'lists.json').write_text(
        json.dumps([[{"kind": "결과보고서", "year": 2025, "com": "총무경제", "uid": uid}], []]),
        encoding='utf-8')
    (paths.WORK / 'md' / f'{uid}.md').write_text(
        '### 나. 시정 및 처리 요구사항\n\n○ 가나다 점검\n본문 내용 ' + '채움 ' * 40 + '\n',
        encoding='utf-8')
    monkeypatch.setattr(expenditure, 'load', lambda *a, **kw: [])
    run.main(['--offline', '--force'])
    out = capsys.readouterr().out
    assert '2025 총무경제: 번호 항목이 없어 글머리 모드로 읽음' in out


# 1차 고침(컨트롤러 지시 g): --site-only 는 캐시(work/names_public.json)만 읽는다
# (offline=True). 캐시가 아예 없으면 이름 검사망이 공개 명단 없이 도는 채로 조용히
# 넘어가지 말고 화면에 경고를 남긴다.
def test_site_only_warns_when_name_cache_is_absent(work, monkeypatch, capsys):
    site_data = {"generated": "2026-09-25", "sources": [], "findings": [], "recurring": [],
                 "promises": [], "expenditure": {}, "depts": []}
    (paths.OUT / 'site_data.json').write_text(json.dumps(site_data, ensure_ascii=False), encoding='utf-8')
    assert not (paths.WORK / 'names_public.json').exists()
    run.main(['--site-only'])
    assert '이름 사전' in capsys.readouterr().out


def test_main_does_not_warn_for_uihoeunyeong_circle_mode(work, monkeypatch, capsys):
    uid = 43
    (paths.WORK / 'lists.json').write_text(
        json.dumps([[{"kind": "결과보고서", "year": 2025, "com": "의회운영", "uid": uid}], []]),
        encoding='utf-8')
    (paths.WORK / 'md' / f'{uid}.md').write_text(
        '### 나. 시정 및 처리 요구사항\n\n○ 가나다 점검\n본문 내용 ' + '채움 ' * 40 + '\n',
        encoding='utf-8')
    monkeypatch.setattr(expenditure, 'load', lambda *a, **kw: [])
    run.main(['--offline', '--force'])
    out = capsys.readouterr().out
    assert '번호 항목이 없어 글머리 모드로 읽음' not in out
