# 역할: 누출 검사 이름 사전을 의회 공개 명단(현직·역대 의원)과 시장 이름으로 넓힌다(Task 2).
#
# 받은 명단은 work/names_public.json 에만 캐시하고 저장소에는 넣지 않는다 — 공개
# 정보이지만 이름 목록 자체를 저장소에 두지 않는다는 방침(constraints.md).
#
# 현직 의원(district.do)과 역대 의원(chronicle.do)은 같은 꼴을 쓴다:
#   <div class="name">\n\t...\n\t<strong>이름</strong>\n...
# (district.do 에는 자바스크립트 템플릿 견본 한 칸이 더 있는데 <p class="name"></p> 로
#  <div> 가 아니고 속이 비어 있어 이 꼴에 안 걸린다.)
# chronicle.do 는 대수(th_sch)별로 쪽이 나뉜다 — 기본 쪽에 걸린 대수 탭 링크(?th_sch=N)를
# 그대로 따라가 모든 대수를 받는다(하드코딩하지 않아 다음 대수가 생겨도 그대로 돈다).
#
# 시장(소통시장실 프로필)은 서명란 꼴을 쓴다: <p class="name">○○시장 <span>이름</span></p>
import json
import re

from dcc import http, paths, region


# 주소는 config/region.json 에서 읽는다(의회 「의원현직」「의원역대」, 「시장소개」).
def district_url():
    return region.council_url('의원현직')


def chronicle_url():
    return region.council_url('의원역대')


def mayor_url():
    return region.load()['시장소개']


# 이름 글자 사이에 공백이 낄 수 있다(예: 「김 신」) — 브리프 인터페이스(「이름 2~4자,
# 공백 제거」) 대로 뽑을 때 공백을 지운다. 글자 수는 공백을 뺀 뒤 2~4자.
_NAME_CHARS = r'[가-힣](?:\s*[가-힣]){1,3}'
MEMBER_NAME = re.compile(r'<div class="name">\s*<strong>(' + _NAME_CHARS + r')</strong>')
TH_SCH = re.compile(r'[?&]th_sch=(\d+)')
MAYOR_NAME = re.compile(r'<p class="name">[^<]*시장[^<]*<span>(' + _NAME_CHARS + r')</span>')

CACHE_NAME = 'names_public.json'


def _strip_and_clip(name):
    return re.sub(r'\s+', '', name)[:4]


def parse_members(html):
    """의원 명단 쪽(현직·역대, 같은 꼴)에서 이름을 뽑는다(공백 제거)."""
    return [_strip_and_clip(n) for n in MEMBER_NAME.findall(html)]


def parse_mayor(html):
    """시장 프로필 쪽 서명란에서 이름을 뽑는다(공백 제거). 없으면 None."""
    m = MAYOR_NAME.search(html)
    return _strip_and_clip(m.group(1)) if m else None


def _generations(chronicle_html):
    """기본 쪽에 걸린 대수 탭(?th_sch=N)을 모두 찾는다. 하나도 없으면 기본 쪽 하나만 본다."""
    return sorted({int(n) for n in TH_SCH.findall(chronicle_html)})


def _cache_path():
    return paths.WORK / CACHE_NAME


def _load_cache():
    p = _cache_path()
    if p.exists():
        return json.loads(p.read_text(encoding='utf-8'))
    return []


def fetch_names(offline=False):
    """현직·역대 의원 + 시장 이름을 모아 work/names_public.json 에 캐시하고 돌려준다.

    offline=True 면 받지 않고 캐시만 읽는다. 온라인 요청이 하나라도 실패하면(누리집
    점검·개편 등) 통째로 캐시로 물러난다 — 절반만 받은 사전으로 새로 덮어쓰지 않는다.

    1차 고침(컨트롤러 지시 f): 예외 없이 그냥 받아지긴 했는데(누리집 쪽 꼴이 바뀌는
    등) 뽑힌 수가 0 이거나 캐시의 절반에 못 미치면, 그 적은 수로 캐시를 덮어써 검사망을
    좁히는 대신 캐시를 그대로 쓴다(왜 그런지 화면에 찍는다).
    """
    if offline:
        return _load_cache()
    cache = _load_cache()
    try:
        chronicle_u = chronicle_url()
        names = set(parse_members(http.get(district_url()).decode('utf-8', 'replace')))
        chronicle = http.get(chronicle_u).decode('utf-8', 'replace')
        gens = _generations(chronicle)
        pages = [chronicle] if not gens else [
            http.get(f'{chronicle_u}?th_sch={g}').decode('utf-8', 'replace') for g in gens]
        for page in pages:
            names |= set(parse_members(page))
        mayor = parse_mayor(http.get(mayor_url()).decode('utf-8', 'replace'))
        if mayor:
            names.add(mayor)
    except Exception:
        return cache
    names = sorted(names)
    if cache and (len(names) == 0 or len(names) < len(cache) / 2):
        print(f'⚠ 공개 명단 새로 받은 수({len(names)}명)가 캐시({len(cache)}명)의 절반에 '
              f'못 미쳐 캐시를 그대로 씁니다(누리집 쪽 꼴이 바뀌었을 수 있습니다)')
        return cache
    paths.WORK.mkdir(parents=True, exist_ok=True)
    _cache_path().write_text(json.dumps(names, ensure_ascii=False), encoding='utf-8')
    return names
