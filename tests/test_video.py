# 구동 동영상(tools/video): 녹화판은 배포 HTML 과 다른 파일이고, 굽은 MP4 가 정한 형식(H.264·1280×800·60~240초)인지.
# 영상·녹화판이 없으면(아직 python tools/video/make_video.py 를 안 돌렸으면) 해당 시험은 건너뛴다.
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('make_video', ROOT / 'tools' / 'video' / 'make_video.py')
mv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mv)


def _has_ffmpeg():
    try:
        mv.ffmpeg_exe()
        return True
    except Exception:
        return False


def test_record_html_is_separate_copy(tmp_path):
    src = tmp_path / '부서점검표.html'
    src.write_text('<html><body><p>x</p><script>DCC.ui.start()</script></body></html>', encoding='utf-8')
    before = src.read_bytes()
    dst = mv.build_record_html(src, tmp_path / 'rec' / '녹화판.html')
    assert src.read_bytes() == before                       # 배포 HTML 은 그대로
    out = dst.read_text(encoding='utf-8')
    assert mv.MARKER in out and 'root.REC = REC' in out and '"질문 예보"' in out
    assert out.index(mv.MARKER) < out.rindex('</body>')    # 끝(</body> 앞)에 붙는다
    assert '__clipboardStub' not in out                     # 대체는 요청할 때만
    assert '__clipboardStub' in mv.build_record_html(src, tmp_path / 'r2.html', stub_clipboard=True).read_text(encoding='utf-8')
    with pytest.raises(ValueError):
        mv.build_record_html(src, src)


def test_shipped_html_has_no_recording_overlay():
    if not mv.OUT_HTML.exists():
        pytest.skip('먼저 python run.py --site-only')
    html = mv.OUT_HTML.read_text(encoding='utf-8')
    assert mv.MARKER not in html and 'rec-cap' not in html


def test_record_html_differs_from_shipped():
    if not mv.RECORD_HTML.exists():
        pytest.skip('녹화판 없음 — python tools/video/make_video.py')
    assert mv.RECORD_HTML.resolve() != mv.OUT_HTML.resolve()
    assert mv.RECORD_HTML.read_bytes() != mv.OUT_HTML.read_bytes()
    assert mv.MARKER in mv.RECORD_HTML.read_text(encoding='utf-8')


def test_scenario_rules():
    sc = json.loads((ROOT / 'tools' / 'video' / 'scenario.json').read_text(encoding='utf-8'))
    text = json.dumps(sc, ensure_ascii=False)
    assert [s['no'] for s in sc['scenes']] == list(range(1, 12))
    assert sc['measure'] == {'from': 3, 'to': 8}
    assert '#csv-template\').click' not in text and '#csv-export' not in text   # 다운로드 단추는 누르지 않는다
    assert 'DCC.attach.templateCsv' in text and "attachBytes('견본.csv'" in text and '가짜' in text
    assert 30 <= sum(s['seconds'] for s in sc['scenes']) <= 200


@pytest.mark.skipif(not mv.MP4.exists(), reason='구동영상.mp4 없음 — python tools/video/make_video.py')
def test_mp4_format():
    if not _has_ffmpeg():
        pytest.skip('imageio_ffmpeg 없음')
    info = mv.probe(mv.MP4)
    assert info['codec'] == 'h264', info
    assert (info['width'], info['height']) == (1280, 800), info
    assert 60 <= info['duration'] <= 240, info
    assert not info['audio'], info


def test_scenario_has_no_hardcoded_city_name():
    # 최종 검토 Minor 7: 지자체 이름은 {{지자체}} 자리로 두고 record.mjs 가 region.json 으로 채운다
    region = json.loads((ROOT / 'config' / 'region.json').read_text(encoding='utf-8'))
    text = (ROOT / 'tools' / 'video' / 'scenario.json').read_text(encoding='utf-8')
    assert region['지자체명'] not in text and '{{지자체}}' in text
    assert "replaceAll('{{지자체}}'" in (ROOT / 'tools' / 'video' / 'record.mjs').read_text(encoding='utf-8')
