import hashlib
from dcc import paths

V = paths.ROOT / 'vendor' / 'kordoc'


def test_bundle_present_and_small():
    b = V / 'kordoc.browser.js'
    assert b.exists()
    assert 1_000_000 < b.stat().st_size < 3_500_000


def test_bundle_has_no_node_only_calls():
    t = (V / 'kordoc.browser.js').read_text(encoding='utf-8')
    assert 'var kordoc=' in t or 'var kordoc =' in t
    for bad in ('require("fs")', "require('fs')", 'child_process'):
        assert bad not in t


def test_version_records_sha256():
    v = (V / 'VERSION').read_text(encoding='utf-8')
    h = hashlib.sha256((V / 'kordoc.browser.js').read_bytes()).hexdigest()
    assert h in v and 'kordoc 4.' in v


def test_licenses_listed():
    t = (V / 'LICENSES.md').read_text(encoding='utf-8')
    for name in ('kordoc', 'pdf.js', 'cfb', 'jszip', 'xmldom', 'pako', 'buffer'):
        assert name in t
