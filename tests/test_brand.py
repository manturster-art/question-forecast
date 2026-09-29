# 역할: 도구 이름을 config/brand.json 한 곳에서 읽는지 확인한다.
# brand 값을 바꾸면 구운 HTML 의 <title>·window.DCC_BRAND 가 바뀌고, README 첫 줄 제목이
# brand.name 과 같아야 한다(가칭 이름을 다시 흘려 넣는 실수를 막는 시험).
import json
import re
import pytest
from dcc import brand, paths, site_build

DATA = {"generated": "2026-09-25", "sources": [], "findings": [], "recurring": [],
        "promises": [], "expenditure": {}, "depts": []}


def test_brand_load_reads_config_json():
    b = brand.load()
    assert set(b) >= {"name", "subtitle", "tagline"}
    assert set(b["council"]) >= {"name", "subtitle", "tagline"}      # 4차 의원용 페이지 이름
    raw = json.loads((paths.ROOT / 'config' / 'brand.json').read_text(encoding='utf-8'))
    assert b == raw


def test_build_fills_title_and_window_brand(tmp_path):
    out = site_build.build(DATA, tmp_path / 'p.html')
    t = out.read_text(encoding='utf-8')
    b = brand.load()
    assert f'<title>{b["name"]} · {b["subtitle"]}</title>' in t
    assert '{{TITLE}}' not in t and '{{BRAND}}' not in t
    assert 'window.DCC_BRAND=' in t
    m = re.search(r'window\.DCC_BRAND=(\{.*?\});', t)
    assert m, t[:2000]
    assert json.loads(m.group(1)) == b


def test_readme_title_matches_brand():
    b = brand.load()
    readme = (paths.ROOT / 'README.md').read_text(encoding='utf-8').splitlines()
    assert readme[0].strip() == f'# {b["name"]}'
    body = '\n'.join(readme[1:6])
    assert b['subtitle'] in body
