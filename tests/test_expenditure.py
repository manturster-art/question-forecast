from pathlib import Path
from dcc import expenditure as ex

HTML = (Path(__file__).parent / 'fixtures' / 'budget_rows.html').read_text(encoding='utf-8')


def test_parse_budget_is_plan_plus_carry():
    rows = ex.parse(HTML, 2025)
    assert len(rows) == 2
    r = rows[0]
    assert r['dept'] == '청년정책관' and r['budget'] == 120000 and r['spent'] == 90000
    assert r['mended'] is False


def test_thin_years_flags_low_general_account_year():
    rows = []
    for y, rate in [(2021, .9), (2022, .9), (2023, .5), (2024, .9), (2025, .3)]:
        rows.append({"year": y, "acct": "일반회계", "budget": 100, "spent": int(100 * rate)})
    assert ex.thin_years(rows) == [2023]      # 마지막 해(2025)는 집행 중이라 견주지 않는다


def test_mend_splits_reference_by_budget_share(monkeypatch):
    rows = [{"year": 2024, "acct": "일반회계", "project": "가 사업", "dept": "A과", "budget": 300, "spent": 0, "mended": False},
            {"year": 2024, "acct": "일반회계", "project": "가사업", "dept": "B과", "budget": 100, "spent": 0, "mended": False}]
    monkeypatch.setattr(ex, '_reference', lambda: {(2024, '일반회계', '가사업'): 200})
    ex.mend(rows, [2024])
    assert [r['spent'] for r in rows] == [150, 50]
    assert all(r['mended'] for r in rows)


def test_by_dept_normalizes_and_sums():
    rows = ex.parse(HTML, 2025) + ex.parse(HTML, 2024)
    d = ex.by_dept(rows)
    assert d['청년정책관'] == [{"year": 2024, "budget": 120000, "spent": 90000, "mended": False},
                              {"year": 2025, "budget": 120000, "spent": 90000, "mended": False}]


# ── 최종 검토 뒤 고침 (I5·minor) ─────────────────────────────────────────
from dcc import http, paths
import pytest


def test_fetch_refuses_to_cache_page_without_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    monkeypatch.setattr(http, 'get', lambda *a, **k: ('<html>점검 중입니다' + ' ' * 20000 + '</html>').encode())
    with pytest.raises(RuntimeError):
        ex.fetch(2025)
    assert not (tmp_path / '세출' / '2025.xls').exists()


def test_fetch_caches_page_with_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    monkeypatch.setattr(http, 'get', lambda *a, **k: HTML.encode('utf-8'))
    assert ex.parse(ex.fetch(2025), 2025)
    assert (tmp_path / '세출' / '2025.xls').exists()


def test_load_offline_never_fetches(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path)

    def boom(*a, **k):
        raise AssertionError('offline 인데 받으려 했다')
    monkeypatch.setattr(http, 'get', boom)
    (tmp_path / '세출').mkdir()
    (tmp_path / '세출' / '2025.xls').write_text(HTML, encoding='utf-8')
    rows = ex.load(years=[2024, 2025], offline=True)
    assert {r['year'] for r in rows} == {2025}
