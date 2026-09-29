# 역할: 도구를 소개하는 구동 동영상(out/영상/구동영상.mp4)을 자동으로 만든다.
#   ① out/부서점검표.html 을 work/video/녹화판.html 로 복사하고 녹화 전용 주입 스크립트(overlay.js — 자막 띠·
#      가짜 커서·표지/끝 화면)를 파일 끝에 붙인다. 배포 HTML 은 읽기만 하고 건드리지 않는다.
#   ② node tools/video/record.mjs 가 Edge 헤드리스를 CDP 로 움직여 scenario.json 장면을 돌리며 프레임을 받는다.
#   ③ 프레임 타임스탬프로 가변 간격을 맞춰(ffmpeg concat demuxer 의 duration) H.264·yuv420p·30fps·1280×800·
#      소리 없음 MP4 로 굽는다. ffmpeg 는 imageio_ffmpeg.get_ffmpeg_exe().
#   끝 화면 「이 도구로 N분」의 N 은 이번 녹화에서 3~8 장면에 실제로 걸린 시간(올림)이다 — record.mjs 가 재어
#   끝 화면에 넣고, 여기서 frames.json 의 장면 시각으로 다시 재어 같은지 확인한다(다르면 실패).
# 쓰임: python run.py --site-only 뒤(견본으로는 python run.py --sample 뒤)  python tools/video/make_video.py [--stub-clipboard] [--stills 폴더]
#   --stub-clipboard: 헤드리스 Edge 가 클립보드를 막아 [복사]가 「복사하지 못했습니다」로 나올 때만, 녹화판에서만
#                     navigator.clipboard.writeText 를 성공으로 바꿔 끼운다(배포 HTML 에는 없음).
# 영상·프레임·녹화판은 work/·out/ 에 두며 git 에 넣지 않는다.
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT_HTML = ROOT / 'out' / '부서점검표.html'
WORK = ROOT / 'work' / 'video'
RECORD_HTML = WORK / '녹화판.html'
FRAMES_JSON = WORK / 'frames.json'
MP4 = ROOT / 'out' / '영상' / '구동영상.mp4'
BRAND = ROOT / 'config' / 'brand.json'
MARKER = '<!-- 녹화 전용 주입(구동 동영상) — 배포판 아님 -->'
W, H, FPS = 1280, 800, 30

CLIPBOARD_STUB = ("window.__clipboardStub = true; try { Object.defineProperty(navigator, 'clipboard', "
                  "{ configurable: true, value: { writeText: () => Promise.resolve() } }); } catch (e) {}")


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def build_record_html(src=OUT_HTML, dst=RECORD_HTML, brand_path=BRAND, stub_clipboard=False):
    """배포 HTML 을 복사해 녹화 전용 스크립트를 끝(</body> 앞)에 붙인 녹화판을 만든다. 원본은 읽기만 한다."""
    src, dst = Path(src), Path(dst)
    if src.resolve() == dst.resolve():
        raise ValueError('녹화판은 배포 HTML 과 다른 파일이어야 합니다')
    html = src.read_text(encoding='utf-8')
    brand = json.loads(Path(brand_path).read_text(encoding='utf-8'))
    overlay = (HERE / 'overlay.js').read_text(encoding='utf-8')
    brand_js = json.dumps({k: brand[k] for k in ('name', 'subtitle', 'tagline')}, ensure_ascii=False)
    inject = (MARKER + '<script>window.REC_BRAND = ' + brand_js + ';' + (CLIPBOARD_STUB if stub_clipboard else '') +
              '</script><script>' + overlay.replace('</script', '<\\/script') + '</script>')
    i = html.rfind('</body>')
    out = html[:i] + inject + html[i:] if i >= 0 else html + inject
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(out, encoding='utf-8')
    return dst


def record(html=RECORD_HTML, out_dir=WORK):
    node = shutil.which('node') or 'node'
    r = subprocess.run([node, str(HERE / 'record.mjs'), str(html), str(HERE / 'scenario.json'), str(out_dir)],
                       cwd=ROOT, timeout=900)
    if r.returncode:
        raise SystemExit(f'record.mjs 실패 (코드 {r.returncode})')
    return json.loads((Path(out_dir) / 'frames.json').read_text(encoding='utf-8'))


def measured_minutes(rec):
    """3~8 장면(scenario.measure)에 실제로 걸린 시간 → (초, 올림한 분)."""
    m = rec['measure']
    a = next(s for s in rec['scenes'] if s['no'] == m['from'])
    b = next(s for s in rec['scenes'] if s['no'] == m['to'])
    sec = b['end'] - a['start']
    return round(sec, 2), math.ceil(sec / 60)


def concat_list(rec, frames_dir):
    """프레임마다 다음 프레임까지의 간격을 duration 으로 적는다(마지막 프레임은 녹화 끝까지)."""
    fr = rec['frames']
    lines = ['ffconcat version 1.0']
    for i, f in enumerate(fr):
        nxt = fr[i + 1]['t'] if i + 1 < len(fr) else rec['end']
        d = max(0.0005, nxt - f["t"])   # 실제 간격 그대로(30fps 로 맞추는 것은 fps 필터 몫)
        lines += [f"file '{f['file']}'", f'duration {d:.4f}']
    lines.append(f"file '{fr[-1]['file']}'")   # concat demuxer 는 마지막 duration 을 쓰려면 한 번 더 적어야 한다
    p = Path(frames_dir) / 'list.ffconcat'
    p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return p


def encode(rec, frames_dir=WORK / 'frames', mp4=MP4):
    lst = concat_list(rec, frames_dir)
    mp4.parent.mkdir(parents=True, exist_ok=True)
    vf = (f'scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=white,'
          f'fps={FPS},format=yuv420p')
    cmd = [ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst.name,
           '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', str(FPS),
           '-an', '-movflags', '+faststart', str(mp4)]
    subprocess.run(cmd, cwd=frames_dir, check=True, timeout=900)
    return mp4


def probe(mp4=MP4):
    """ffprobe 없이 ffmpeg -i 출력에서 길이(초)·코덱·해상도·fps 를 읽는다."""
    r = subprocess.run([ffmpeg_exe(), '-hide_banner', '-i', str(mp4)], capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    err = r.stderr
    d = re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', err)
    v = re.search(r'Stream #\S+.*?Video:\s*(\w+).*?,\s*(\d{2,5})x(\d{2,5})', err)
    fps = re.search(r'([\d.]+)\s*fps', err)
    return {
        'duration': int(d[1]) * 3600 + int(d[2]) * 60 + float(d[3]) if d else None,
        'codec': v[1] if v else None, 'width': int(v[2]) if v else None, 'height': int(v[3]) if v else None,
        'fps': float(fps[1]) if fps else None, 'audio': 'Audio:' in err,
    }


def still(t, dst, mp4=MP4):
    subprocess.run([ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error', '-ss', f'{t:.2f}', '-i', str(mp4),
                    '-frames:v', '1', str(dst)], check=True, timeout=120)


def main(argv=None):
    ap = argparse.ArgumentParser(description='구동 동영상 자동 제작')
    ap.add_argument('--stub-clipboard', action='store_true', help='녹화판에서만 클립보드 쓰기를 성공으로 대체')
    ap.add_argument('--stills', help='대표 장면 캡처(png) 4장을 둘 폴더')
    ap.add_argument('--encode-only', action='store_true', help='녹화 없이 기존 프레임으로 굽기만')
    a = ap.parse_args(argv)
    if not OUT_HTML.exists():
        raise SystemExit('먼저 python run.py --site-only 로 out/부서점검표.html 을 굽습니다')
    if a.encode_only:
        rec = json.loads(FRAMES_JSON.read_text(encoding='utf-8'))
    else:
        before = OUT_HTML.read_bytes()
        build_record_html(stub_clipboard=a.stub_clipboard)
        rec = record()
        assert OUT_HTML.read_bytes() == before, '배포 HTML 이 바뀌었습니다'
    sec, minutes = measured_minutes(rec)
    shown = next(s['minutes'] for s in rec['scenes'] if s.get('minutes') is not None)
    if shown != minutes:
        raise SystemExit(f'끝 화면 {shown}분 ≠ 잰 값 {minutes}분')
    sizes = {(f['w'], f['h']) for f in rec['frames']}
    mp4 = encode(rec)
    info = probe(mp4)
    t0 = rec['frames'][0]['t']
    scenes = [{**s, 'video_at': round(s['start'] - t0, 2)} for s in rec['scenes']]
    summary = {'mp4': str(mp4), 'bytes': mp4.stat().st_size, **info, 'frames': len(rec['frames']),
               'frame_sizes': sorted(sizes), 'theme_light': rec.get('theme'), 'viewport': rec.get('viewport'),
               'measured_seconds_3to8': sec, 'minutes': minutes, 'copyMsg': rec.get('copyMsg'),
               'clipboardStub': rec.get('clipboardStub'), 'applied': rec.get('applied'), 'scenes': scenes}
    if a.stills:
        out = Path(a.stills)
        out.mkdir(parents=True, exist_ok=True)
        by = {s['no']: s for s in scenes}
        picks = {'video_1_search.png': by[3]['video_at'] + by[3]['seconds'] - 0.4,
                 'video_2_attach.png': by[7]['video_at'] + by[7]['seconds'] - 1.0,
                 'video_3_copy.png': by[8]['video_at'] + by[8]['seconds'] - 0.8,
                 'video_4_end.png': by[11]['video_at'] + by[11]['seconds'] - 0.8}
        summary['stills'] = {}
        for name, t in picks.items():
            still(t, out / name, mp4)
            summary['stills'][name] = round(t, 2)
    (WORK / 'result.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: v for k, v in summary.items() if k != 'scenes'}, ensure_ascii=False, indent=1))
    ok = (info['codec'] == 'h264' and (info['width'], info['height']) == (W, H) and 60 <= (info['duration'] or 0) <= 240)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
