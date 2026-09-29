from pathlib import Path
from dcc import council_site as cs

FX = Path(__file__).parent / 'fixtures'


def test_inspection_list_carries_year_across_rowspan():
    rows = cs.parse_inspection_list((FX / 'inspection_list.html').read_text(encoding='utf-8'))
    assert {"year": 2025, "com": "의회운영", "kind": "결과보고서", "uid": 29389} in rows
    assert {"year": 2025, "com": "총무경제", "kind": "계획서", "uid": 29392} in rows
    assert {"year": 2024, "com": "도시건설", "kind": "결과보고서", "uid": 28000} in rows
    assert len(rows) == 6


def test_qna_list():
    rows = cs.parse_qna_list((FX / 'qna_list.html').read_text(encoding='utf-8'))
    assert rows[0] == {"date": "2026-03-09", "session": 309,
                       "title": "제309회 임시회 제1차 본회의 시정질문", "uid": 29229}
    assert rows[1]["session"] == 298 and rows[1]["uid"] == 27688


def test_viewer_url():
    assert cs.viewer_url(29391) == 'https://council.example.invalid/viewer/pdf.do?group=bbs&uid=29391'
