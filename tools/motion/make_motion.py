# 역할: 「질문 예보」 30초 모션그래픽(out/영상/모션그래픽_30초.mp4)을 만든다.
#   ① 숫자: node tools/motion/stats.mjs 가 out/site_data.json 에서 뽑는다(부서 카드는 화면과 같은 core.js 계산).
#      뽑은 값은 쓰기 전에 dcc.privacy 누출 검사(이름+직함·거둔 이름 목록)를 거친다.
#   ② 장면: tools/motion/scene.html 틀에 글꼴(Geist base64, 한글은 설치된 Pretendard/Noto Sans KR/맑은 고딕 파일 주소)·
#      자료·scene.js 를 채워 work/motion/scene.html 로 굽는다. 네트워크를 쓰지 않는다.
#   ③ 받기: node tools/motion/capture.mjs 가 Edge 헤드리스에서 seek(i/60) 로 1800장을 PNG 로 받는다.
#      이 PC 에서는 Git Bash 에서 띄운 헤드리스 Edge 가 동작하지 않으니 PowerShell 에서 돌린다.
#   ④ 굽기: imageio_ffmpeg 의 ffmpeg 로 H.264·yuv420p·CRF 18·60fps·소리 없음.
# 쓰임: python tools/motion/make_motion.py [--sample] [--dept 주택과] [--stills 0.8,2.6] [--build-only] [--contact]
#   --sample: 합성 견본 자료(examples/sample/site_data.json)로 만든다. 주지 않으면 out/site_data.json(python run.py 산출)을 쓴다.
# 프레임·장면·영상은 work/·out/ 에 두며 git 에 넣지 않는다.
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))

from dcc import paths, privacy  # noqa: E402

DATA = paths.OUT / 'site_data.json'
WORK = paths.WORK / 'motion'
SCENE_OUT = WORK / 'scene.html'
FRAMES = WORK / 'frames'
STILLS = WORK / 'stills'
MP4 = paths.OUT / '영상' / '모션그래픽_30초.mp4'
CONTACT = paths.WORK / 'motion_contact.png'
FPS = 60
DEPT = '주택과'
# 승인된 새 문구(2026-09-29 스토리보드). config/brand.json 의 예전 문구와 다르다.
TAGLINE = '의회에서 나올 질문, 미리 예보합니다'
# 끝 화면 제작자 표기(2026-09-29 사용자 요청). 공식 사업이 아니므로 의회·사무국을 만든 이로 적지 않는다.
CREDIT = 'made by JJ'
CONTACT_TIMES = [1.2, 2.6, 4.6, 6.3, 8.6, 10.4, 13.4, 16.0, 19.9, 21.9, 26.5, 29.2]

KR_FONTS = [
    Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts/PretendardVariable.ttf',
    Path('C:/Windows/Fonts/PretendardVariable.ttf'),
    Path(os.environ.get('LOCALAPPDATA', '')) / 'Microsoft/Windows/Fonts/NotoSansKR-VF.ttf',
    Path('C:/Windows/Fonts/NotoSansKR-VF.ttf'),
]


def stats(data_path=DATA, dept=DEPT):
    """자료에서 영상 숫자를 뽑는다(node + site/js/core.js)."""
    node = shutil.which('node') or 'node'
    r = subprocess.run([node, str(HERE / 'stats.mjs'), str(data_path), dept], capture_output=True,
                       text=True, encoding='utf-8', timeout=120)
    if r.returncode:
        raise SystemExit('stats.mjs 실패: ' + r.stderr.strip())
    return json.loads(r.stdout)


def _names():
    """거둔 이름 목록(있으면) — 공개 명단 캐시. 없으면 이름+직함 꼴 검사만 한다."""
    cache = paths.WORK / 'names_public.json'
    if cache.exists():
        return sorted(n for n in json.loads(cache.read_text(encoding='utf-8')) if len(n) >= 3)
    return []


def payload(st):
    brand = json.loads((paths.CONFIG / 'brand.json').read_text(encoding='utf-8'))
    p = dict(st)
    p.update(brand=brand['name'], subtitle=brand['subtitle'], tagline=TAGLINE, credit=CREDIT)
    privacy.assert_no_leak(p, names=_names())
    return p


def font_css():
    out = []
    for fam, fn in (('Geist', 'Geist-Variable.woff2'), ('Geist Mono', 'GeistMono-Variable.woff2')):
        b64 = base64.b64encode((ROOT / 'site' / 'fonts' / fn).read_bytes()).decode('ascii')
        out.append(f"@font-face{{font-family:'{fam}';src:url(data:font/woff2;base64,{b64}) format('woff2');font-weight:100 900;}}")
    kr = next((p for p in KR_FONTS if p.exists()), None)
    if kr:
        out.append(f"@font-face{{font-family:'KR';src:url('{kr.as_uri()}');font-weight:100 900;}}")
    else:   # 설치 글꼴이 없으면 맑은 고딕(시스템 글꼴)으로
        out.append("@font-face{font-family:'KR';src:local('Malgun Gothic');font-weight:100 900;}")
    return '\n'.join(out)


def build_html(dst=SCENE_OUT, data_path=DATA, dept=DEPT):
    p = payload(stats(data_path, dept))
    html = (HERE / 'scene.html').read_text(encoding='utf-8')
    scene = (HERE / 'scene.js').read_text(encoding='utf-8')
    data_js = json.dumps(p, ensure_ascii=False).replace('</', '<\\/')
    html = (html.replace('/*__FONTS__*/', font_css())
                .replace('/*__DATA__*/null', data_js)
                .replace('/*__SCENE__*/', scene.replace('</script', '<\\/script')))
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(html, encoding='utf-8')
    return dst, p


def capture(out_dir, times=None):
    node = shutil.which('node') or 'node'
    cmd = [node, str(HERE / 'capture.mjs'), str(SCENE_OUT), str(out_dir), '--fps', str(FPS)]
    if times:
        cmd += ['--times', ','.join(f'{t:g}' for t in times)]
    r = subprocess.run(cmd, cwd=ROOT, timeout=3600)
    if r.returncode:
        raise SystemExit(f'capture.mjs 실패 (코드 {r.returncode})')


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def encode(frames=FRAMES, mp4=MP4):
    mp4 = Path(mp4)
    mp4.parent.mkdir(parents=True, exist_ok=True)
    tmp = WORK / 'motion_tmp.mp4'   # 한글 경로는 굽고 나서 옮긴다
    cmd = [ffmpeg_exe(), '-y', '-v', 'error', '-framerate', str(FPS), '-i', str(Path(frames) / '%06d.png'),
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
           '-movflags', '+faststart', '-an', str(tmp)]
    subprocess.run(cmd, check=True, timeout=3600)
    shutil.move(str(tmp), str(mp4))
    return mp4


def contact_sheet(stills_dir=STILLS, times=CONTACT_TIMES, dst=CONTACT):
    from PIL import Image, ImageDraw
    tw, th, pad = 640, 360, 12
    sheet = Image.new('RGB', (3 * tw + 4 * pad, 4 * th + 5 * pad + 4 * 28), (20, 20, 22))
    d = ImageDraw.Draw(sheet)
    for i, t in enumerate(times):
        im = Image.open(Path(stills_dir) / f't_{t:05.2f}.png').convert('RGB').resize((tw, th), Image.LANCZOS)
        x = pad + (i % 3) * (tw + pad)
        y = pad + (i // 3) * (th + pad + 28)
        sheet.paste(im, (x, y + 28))
        d.text((x, y + 6), f'{t:05.2f}s', fill=(200, 200, 200))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dst)
    return dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dept', default=DEPT)
    ap.add_argument('--stills', help='쉼표로 나눈 초 — 그 시각만 받는다')
    ap.add_argument('--contact', action='store_true', help='대조표(3×4) 시각을 받아 contact sheet 를 만든다')
    ap.add_argument('--build-only', action='store_true')
    ap.add_argument('--sample', action='store_true', help='out/site_data.json 대신 합성 견본 자료(examples/sample)로 만든다')
    a = ap.parse_args()
    dst, p = build_html(data_path=paths.SAMPLE if a.sample else DATA, dept=a.dept)
    print('장면:', dst)
    print('전체:', json.dumps(p['totals'], ensure_ascii=False))
    print('부서:', json.dumps({k: v for k, v in p['dept'].items() if k != 'chains'}, ensure_ascii=False))
    if a.build_only:
        return
    if a.stills or a.contact:
        times = [float(x) for x in a.stills.split(',')] if a.stills else CONTACT_TIMES
        capture(STILLS, times)
        if a.contact:
            print('대조표:', contact_sheet())
        return
    capture(FRAMES)
    mp4 = encode()
    print('영상:', mp4, f'{mp4.stat().st_size / 1e6:.1f}MB')


if __name__ == '__main__':
    main()
