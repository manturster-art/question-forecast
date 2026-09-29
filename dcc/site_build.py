# 역할: 틀·CSS·JS·kordoc 번들·프롬프트 틀·자료를 HTML 한 장으로 굽는다.
# 굽기 전에 1차의 누출 검사를 인라인할 자료 전체에 다시 건다. 걸리면 파일을 쓰지 않는다.
import base64
import datetime
import json
import re
from pathlib import Path
from dcc import brand, paths, privacy, region

JS_ORDER = ['core.js', 'attach.js', 'prompts.js', 'kit.js', 'deptview.js', 'ui.js']
# 자체 시험(Task 8) 전용 — selftest=True 일 때만 ui.js 뒤에 붙는다. 브라우저 통신 API 이름이
# 그대로 들어 있어(호출은 안 하고 감시만 함) 출하판(JS_ORDER 만 굽는 기본값)에는 절대 넣지 않는다.
SELFTEST_JS = ['selftest_fixture.js', 'selftest.js']
# 4차 의원용 페이지(page='council'): 같은 자료·같은 CSS·kordoc 에 틀·JS·프롬프트·이름만 다르다.
# 집행부 화면(ui.js)은 넣지 않고, 공용 도구(kit.js)·부서 탭 공용 모듈(deptview.js)과 의원용 계산·화면을 붙인다.
PAGES = {
    'dept': {'template': 'template.html', 'js': JS_ORDER, 'selftest_js': SELFTEST_JS, 'prompts': 'prompts'},
    'council': {'template': 'council.html',
                'js': ['core.js', 'attach.js', 'prompts.js', 'kit.js', 'deptview.js', 'council_core.js', 'council.js'],
                'selftest_js': ['selftest_fixture.js', 'council_selftest.js'], 'prompts': 'prompts/council'},
}
# 자료(지적 제목 등)에 「<script>」「</script>」 글자가 그대로 들어와도 화면의 실제
# <script> 태그를 끊지 못하게 '<' 뒤에 역슬래시를 끼워 넣는다. '</' 만 가리면 열림
# 태그(닫힘 슬래시 없는 「<script>」)는 그대로 남아 틀의 진짜 태그 수와 어긋난다.
_SLOT = re.compile(r'\{\{(STYLE|KORDOC|DATA|PROMPTS|BUILT|JS|TITLE|BRAND|REGION)\}\}')
_SCRIPT_TAG = re.compile(r'<(/?)script', re.IGNORECASE)
# 글꼴(Task 4c): Geist·Geist Mono(SIL OFL 1.1, site/fonts/OFL.txt) 가변 글꼴을 라틴·숫자·기호만 남긴 woff2
# 부분집합으로 CSS 에 base64 로 넣는다(오프라인 — 바깥 글꼴 주소 없음). 한글은 unicode-range 밖이라
# Pretendard·맑은 고딕 폴백이 그린다. 파일이 없으면 글꼴 없이 굽는다(시스템 글꼴).
FONTS = [('Geist', 'Geist-Variable.woff2'), ('Geist Mono', 'GeistMono-Variable.woff2')]
FONT_RANGE = 'U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2190-2193,U+2197'
FONT_SLOT = '/* @font-face — 굽을 때 dcc/site_build.py 가 이 줄을 Geist·Geist Mono(라틴 부분집합, base64 woff2)로 바꾼다 */'


def font_css(font_dir=None):
    font_dir = Path(font_dir or paths.ROOT / 'site' / 'fonts')
    out = []
    for family, name in FONTS:
        p = font_dir / name
        if not p.exists():
            continue
        b64 = base64.b64encode(p.read_bytes()).decode('ascii')
        out.append(f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{b64}) format('woff2');"
                   f"font-weight:100 900;font-style:normal;font-display:swap;unicode-range:{FONT_RANGE};}}")
    return chr(10).join(out)


def inline_json(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    s = _SCRIPT_TAG.sub(lambda m: '<\\' + m.group(1) + 'script', s)
    return s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def _screen_region(reg):
    """화면에 넣을 몫만 고른다(지자체·의회 이름, 의회 누리집 주소). 세출·시장 주소와 구·동 표는 넣지 않는다."""
    return {k: reg[k] for k in ('지자체명', '약칭', '의회명', '의회') if k in reg}


def build(site_data, out_path, selftest=False, names=(), page='dept'):
    if page not in PAGES:
        raise ValueError(f'모르는 페이지 종류입니다: {page}')
    conf = PAGES[page]
    if page == 'council':
        # 의원용 기준값(집행률·날씨 구간)은 굽는 때 config/council.json 을 다시 읽어 얹는다 — --site-only 로
        # 옛 out/site_data.json 을 구워도 「weather」 같은 새 기준값이 빠지지 않게(자료층 snapshot 도 같은 파일을 넣는다).
        cfg = json.loads((paths.CONFIG / 'council.json').read_text(encoding='utf-8'))
        site_data = dict(site_data, council=dict(site_data.get('council') or {}, **cfg))
    privacy.assert_no_leak(site_data, names)
    site = paths.ROOT / 'site'
    reg = region.load()
    # 프롬프트 틀의 {{지자체}} 는 굽는 때 region.json 의 지자체명으로 채운다(Task 4b).
    # {{대상}}·{{자료}} 는 prompts.js 가 붙여넣기 시점에 채우므로 그대로 둔다.
    prompts = {p.stem: p.read_text(encoding='utf-8').replace('{{지자체}}', reg['지자체명'])
               for p in sorted((paths.ROOT / conf['prompts']).glob('*.md'))}
    privacy.assert_no_leak(prompts, names)
    order = conf['js'] + (conf['selftest_js'] if selftest else [])
    js = '\n'.join((site / 'js' / n).read_text(encoding='utf-8') for n in order)
    kordoc = (paths.ROOT / 'vendor' / 'kordoc' / 'kordoc.browser.js').read_text(encoding='utf-8')
    html = (site / conf['template']).read_text(encoding='utf-8')
    # 이름: 집행부는 brand.json 최상위, 의원용은 그 「council」 묶음.
    b = brand.load()
    if page == 'council':
        b = b['council']
    parts = {'STYLE': (site / 'style.css').read_text(encoding='utf-8').replace(FONT_SLOT, font_css(site / 'fonts')),
             'KORDOC': kordoc.replace('</script', '<\\/script'),
             'DATA': inline_json(site_data), 'PROMPTS': inline_json(prompts),
             'BUILT': inline_json(datetime.date.today().isoformat()),
             'JS': js.replace('</script', '<\\/script'),
             'TITLE': f'{b["name"]} · {b["subtitle"]}',
             'BRAND': inline_json(b), 'REGION': inline_json(_screen_region(reg))}
    # 틀의 자리표시만 한 번에 바꾼다(최종 검토 수정 5). 차례로 replace 하면 앞서 넣은 자료 속
    # 「{{JS}}」 같은 글자가 뒤 치환에 다시 걸린다. 프롬프트 속 {{대상}}·{{자료}}는 이름이 달라 남는다.
    html = _SLOT.sub(lambda m: parts[m.group(1)], html)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding='utf-8')
    return out_path
