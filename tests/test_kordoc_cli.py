import shutil
import subprocess
import pytest
from dcc import kordoc_cli, paths


@pytest.mark.skipif(shutil.which('kordoc') is None, reason='kordoc CLI 없음')
def test_markdown_from_hwpx(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    src = tmp_path / 'a.hwpx'
    # kordoc 이 스스로 만든 hwpx 로 시험한다. 저장소에 남의 문서를 넣지 않기 위해서다.
    (tmp_path / 'a.md').write_text('# 제목\n\n본문 한 줄', encoding='utf-8')
    subprocess.run(f'kordoc generate "{tmp_path / "a.md"}" -o "{src}"', shell=True, check=False)
    if not src.exists():
        pytest.skip('이 kordoc 판에는 generate 가 없음')
    md = kordoc_cli.to_markdown(src)
    assert '본문 한 줄' in md
    assert (tmp_path / 'md' / 'a.md').exists()


def test_timeout_raises_runtime_error(tmp_path, monkeypatch):
    # subprocess.run 이 TimeoutExpired 를 일으킬 때 RuntimeError 로 변환되는지 검증한다.
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    src = tmp_path / 'timeout_test.pdf'
    src.touch()

    def mock_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd='kordoc', timeout=900)

    monkeypatch.setattr(subprocess, 'run', mock_run)

    with pytest.raises(RuntimeError) as exc_info:
        kordoc_cli.to_markdown(src)

    assert '900초 안에 못 읽었습니다' in str(exc_info.value)
    assert exc_info.value.__cause__.__class__.__name__ == 'TimeoutExpired'


class _R:
    def __init__(self, rc, err=''):
        self.returncode, self.stderr, self.stdout = rc, err, ''


def test_nonzero_return_code_fails_and_removes_partial_output(tmp_path, monkeypatch):
    """최종 검토 뒤 고침(I6): kordoc 이 0 아닌 값으로 끝나면 반쯤 쓴 md 를 지우고 실패로 본다."""
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    src = tmp_path / 'x.pdf'
    src.touch()
    out = tmp_path / 'md' / 'x.md'

    def run(*a, **k):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text('반쪽 ' * 200, encoding='utf-8')
        return _R(1, 'boom')
    monkeypatch.setattr(subprocess, 'run', run)
    with pytest.raises(RuntimeError):
        kordoc_cli.to_markdown(src)
    assert not out.exists()


def test_refresh_ignores_and_replaces_cached_markdown(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'WORK', tmp_path)
    src = tmp_path / 'x.pdf'
    src.touch()
    out = tmp_path / 'md' / 'x.md'
    out.parent.mkdir(parents=True)
    out.write_text('옛 것 ' * 100, encoding='utf-8')

    def run(*a, **k):
        assert not out.exists()          # 부르기 전에 옛 캐시를 지웠어야 한다
        out.write_text('새 것 ' * 100, encoding='utf-8')
        return _R(0)
    monkeypatch.setattr(subprocess, 'run', run)
    assert kordoc_cli.to_markdown(src).startswith('옛 것')      # refresh 아니면 캐시
    assert kordoc_cli.to_markdown(src, refresh=True).startswith('새 것')
