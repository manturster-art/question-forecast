import subprocess
from pathlib import Path

import pytest

from dcc import http as dh


class FakeCompleted:
    def __init__(self, returncode=0, stdout=b'ok', stderr=b''):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_get_builds_expected_argv(monkeypatch):
    captured = {}

    def fake_run(argv, **kwargs):
        captured['argv'] = argv
        captured['kwargs'] = kwargs
        return FakeCompleted(stdout=b'hello')

    monkeypatch.setattr(subprocess, 'run', fake_run)
    out = dh.get('https://example.com/x')
    argv = captured['argv']
    assert out == b'hello'
    assert argv[0] == dh.CURL
    for flag in ('-sS', '--fail', '-L'):
        assert flag in argv
    assert '--max-time' in argv
    assert argv[argv.index('--max-time') + 1] == '60'
    assert '-A' in argv
    assert argv[argv.index('-A') + 1] == 'Mozilla/5.0 (question-forecast; public-data collector)'
    assert argv[-1] == 'https://example.com/x'
    assert '-k' not in argv
    assert '--insecure' not in argv


def test_get_passes_cookie_jar_and_headers(monkeypatch, tmp_path):
    captured = {}

    def fake_run(argv, **kwargs):
        captured['argv'] = argv
        return FakeCompleted(stdout=b'x')

    monkeypatch.setattr(subprocess, 'run', fake_run)
    jar = tmp_path / 'cookies.txt'
    dh.get('https://example.com/x', cookies=jar, headers={'X-Foo': 'bar'})
    argv = captured['argv']
    assert '-b' in argv and argv[argv.index('-b') + 1] == str(jar)
    assert '-c' in argv and argv[argv.index('-c') + 1] == str(jar)
    assert '-H' in argv and 'X-Foo: bar' in argv


def test_post_sends_form_fields(monkeypatch):
    captured = {}

    def fake_run(argv, **kwargs):
        captured['argv'] = argv
        return FakeCompleted(stdout=b'{"result":true}')

    monkeypatch.setattr(subprocess, 'run', fake_run)
    out = dh.post('https://example.com/x', {'group': 'bbs', 'uid': 123},
                   headers={'X-CSRF-TOKEN': 'tok'})
    argv = captured['argv']
    assert out == b'{"result":true}'
    assert '--data-urlencode' in argv
    assert 'group=bbs' in argv
    assert 'uid=123' in argv
    assert '-H' in argv and 'X-CSRF-TOKEN: tok' in argv


def test_nonzero_exit_raises(monkeypatch):
    def fake_run(argv, **kwargs):
        return FakeCompleted(returncode=22, stdout=b'', stderr=b'curl: (22) 404')

    monkeypatch.setattr(subprocess, 'run', fake_run)
    with pytest.raises(RuntimeError, match='404'):
        dh.get('https://example.com/missing')


def test_curl_path_prefers_system32_or_which():
    assert Path(dh.CURL).name.lower() == 'curl.exe' or dh.CURL == 'curl'
