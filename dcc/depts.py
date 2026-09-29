# 역할: 부서 이름을 한 꼴로 맞추고 어느 실·국 소속인지 찾는다.
#
# 앞선 점검 도구(비공개)의 dnorm·split_first 를 옮겨 왔다
# (2026-09-24). 규칙의 이유는 그쪽 주석에 자세하다. 요점만 적는다.
#   - hwp 자간 때문에 부서 이름에 공백이 끼므로 다 붙인 뒤 구 접두를 뗀다
#   - 「공통」「전 부서」류는 한 부서로 몰지 않고 「여러 부서 공통」
#   - 붙어 버린 이름(「행정지원과자치행정과」)은 사전 낱말로 남김없이 갈릴 때만 앞 부서를 취한다
#   - 줄여 적은 이름은 config/별칭.json 으로 정식 이름에 맞춘다
#   - 구·동 이름(「가람」「나래」과 동 앞말)은 config/region.json 의 「구」에서 읽는다(Task 4b)
#
# _org() 는 브리프 초안과 다르다. config/행정기구.json 실물을 확인해 보니(2026-09-25)
# 실국 은 dict, 부시장 직속(옛 키 보좌기관) 은 평평한 list, 소속기관·구 는 중첩 dict/list 가 섞여 있어
# 브리프의 얕은 두 갈래(dict/list) 처리로는 청년정책관·보건정책과 같은 항목이
# 누락됐다. 실국 만 원래 뜻(부서 → 실국명, 실국명 자기 자신도 등록)을 살리고,
# 나머지 세 키는 재귀로 편다 — list 를 만나면 그 원소들을 지금 키 이름에 걸고,
# dict 를 만나면 그 밑으로 내려가 가장 안쪽 list 의 원소들을 가장 안쪽 키에 건다.
import json
import re
from collections import Counter
from functools import lru_cache
from dcc import paths, region

# 구 관련 정규식(GU·BOTH_GU·GU_DONG·GU_PREFIX)은 region.json 의 「구」로 _build_region() 이 만든다.
# region.json 을 바꾸면 프로세스를 다시 시작하거나 region.refresh() 를 부른다(아래 _refresh).
# 최종 검토 뒤 재검토 고침(2026-09-25, commit a8b14ac 회귀): 가람·나래 둘 다 이름
# 붙인 꼬리표(같은 부서가 두 구에 다 있음)는 구를 떼는 while 루프가 첫 조각에서
# 멈춰 두 구 이름이 부서 이름에 그대로 눌어붙었다(「가람구나래구도서관」류). 두 구가
# 다 나오면 구를 붙이지 않고 남는 이름만 쓴다(남는 게 없으면 「여러 부서 공통」).
# Task 0 고침: 「가람구청, 나래구청」(구 뒤 「청」꼬리)·「가람구 및 나래구」(구분자
# 「및」)도 양구 판정에 받는다. (BOTH_GU 는 아래 _build_region() 에서 만든다.)
SUF = re.compile(r'(과|실|관|국|단|원|소|센터|공사|재단|사업소|도서관|보건소|시장|축구단)$')
COMMON = re.compile(r'^(공통|각동|각실과|전부서|전체부서|산하기관|출자출연기관|'
                    r'출자·출연기관|모든부서|해당부서|각부서|집행기관|각기금|'
                    # 최종 검토 뒤 고침(I2): 「전 동」「31개동」「전동행정복지센터」「해당기관」
                    r'전동|\d+개동|해당기관)|소관부서')


@lru_cache(maxsize=1)
def _alias():
    return json.loads((paths.CONFIG / '별칭.json').read_text(encoding='utf-8'))


def _flatten(v, key, m):
    """list 는 원소를 key 에 걸고, dict 는 그 그룹 이름을 새 key 삼아 내려간다."""
    if isinstance(v, list):
        for item in v:
            name = item if isinstance(item, str) else (item.get('이름') or item.get('name'))
            if name:
                m.setdefault(name, key)
    elif isinstance(v, dict):
        for group, members in v.items():
            _flatten(members, group, m)


@lru_cache(maxsize=1)
def _org():
    """행정기구 JSON 을 {부서: 실국} 으로 편다.

    실국 은 부서 → 실국명, 실국명 자신도 자기 자신에 매핑한다(브리프 원 뜻).
    부시장 직속(평평한 list)·소속기관·구(중첩 dict/list 혼재) 는 _flatten 으로
    재귀로 편다 — 청년정책관 → 부시장 직속, 보건정책과 → 보건소 처럼 가장 안쪽
    list 원소가 가장 안쪽 그룹 이름에 걸리게 한다. setdefault 라 먼저 등록된
    (실국 이 가장 먼저) 매핑이 이긴다.
    """
    b = json.loads((paths.CONFIG / '행정기구.json').read_text(encoding='utf-8'))
    m = {}
    silguk = b.get('실국') or {}
    for group, members in silguk.items():
        m.setdefault(group, group)
        for d in members if isinstance(members, list) else []:
            m.setdefault(d, group)
    # 2026-09-28 사용자 지적: 홍보기획관·청년정책관·감사관은 「보좌기관」이 아니라 「부시장 직속」이다. 키 이름이
    # 곧 화면의 실·국 이름이다. 옛 키 「보좌기관」도 읽기는 한다(다른 지자체 설정 호환).
    for key in ('부시장 직속', '보좌기관', '소속기관', '구'):
        _flatten(b.get(key), key, m)
    return m


def split_first(name, vocab):
    n = len(name)
    ok = [False] * (n + 1)
    ok[n] = True
    for i in range(n - 1, -1, -1):
        for j in range(n, i + 2, -1):
            seg = name[i:j]
            g = GU.match(seg)
            if g:
                seg = seg[g.end():]
            if seg in vocab and ok[j]:
                ok[i] = True
                break
    if not ok[0]:
        return name
    for j in range(n - 1, 2, -1):
        seg = name[:j]
        g = GU.match(seg)
        if g:
            seg = seg[g.end():]
        if seg in vocab and ok[j]:
            return name[:j]
    return name


def normalize(raw, vocab=None):
    d = re.sub(r'\(.*?\)', ' ', raw or '')
    d = re.sub(r'등\s*\d+개\s*부서.*', ' ', d)
    d = re.sub(r'\s+', '', d)
    if not d:
        return '미상'
    # 「31개동노인복지과」: 동 전체 + 한 부서가 붙은 꼬리표. 뒤의 부서를 취한다(최종 검토 I2).
    n = re.match(r'^\d+개동(.{2,}?(과|관|실|국|소))$', d)
    if n:
        d = n.group(1)
    # Task 4f: 구 이름이 앞에 붙은 정식 이름(「나래구도서관」「가람구보건소」)은 구를 떼지 않는다.
    # 떼면 「나래구 도서관」처럼 조직도에 없는 옛 꼴이 따로 생겨 현 부서와 갈린다.
    if GU.match(d) and _org().get(d) not in (None, d):
        return d
    if COMMON.match(d) or COMMON.match(GU.sub('', d)):
        return '여러 부서 공통'
    both = BOTH_GU.match(d)
    if both and both.group(1) != both.group(2):
        rest = re.sub(r'^[·,/․]+', '', both.group(3))
        return normalize(rest, vocab) if rest else '여러 부서 공통'
    # 「양 보건소 X」「양구청 X」「양구 X」: 두 구에 다 있는 같은 부서. 구를 붙이지 않고 X 로 둔다.
    d = re.sub(r'^양(?:구청|구|보건소)(?=.{2,})', '', d)
    d = re.sub(r'(?<=.{3})[·,]?공통$', '', d)
    gus = []
    while True:
        g = GU.match(d)
        rest = d[g.end():] if g else ''
        # 여러 부서 꼬리표(「가람 행정지원과, ○○2동」)는 첫 조각의 접미로 본다
        if not g or len(rest) < 3 or not SUF.search(re.split(r'[·,/․]', rest)[0]):
            break
        gus.append(g.group(1))
        d = rest
    health = False
    if gus and d.startswith('보건소'):
        # 「가람구보건소 건강증진과」「가람구보건소」
        d, health = d[3:] or '보건소', True
    parts = re.split(r'[·,/․]', d)
    d = parts[0] if len(parts) == 1 or SUF.search(parts[0]) else ''.join(parts)
    if vocab:
        d = split_first(d, vocab)
    d = _alias().get(d, d) or '미상'
    if len(gus) != 1:
        return d
    if d == '보건소':
        return f'{gus[0]}구보건소'
    if health or _org().get(d) == '보건소':
        return f'{gus[0]}구보건소 {d}'
    return f'{gus[0]}구 {d}'


def build_vocab(raws):
    c = Counter(re.sub(rf'^({_GU})구(보건소)?\s*', '', normalize(r)) for r in raws)
    v = {d for d, n in c.items() if n >= 2 and len(d) >= 3 and SUF.search(d)}
    return v | set(_alias())


# ── 구 단위 부서 (최종 검토 뒤 고침 I1, 2026-09-25) ─────────────────────────
# 구청 부서(행정지원과·건설과…)와 동 행정복지센터는 가람구·나래구에 같은 이름으로 있다.
# 구를 떼 버리면 두 구의 지적이 한 부서로 섞이고 되풀이 묶기도 두 구를 잇는다. 그래서
# 묶음 머리(group)나 꼬리표(dept_raw)에 한 구만 나오면 그 구를 붙인다. 둘 다 나오거나
# 아무것도 없으면 localize 는 붙이지 않는다(실국 「구청」). Task 4f(2026-09-28)부터 둘 다
# 나오는 꼴은 places() 가 구마다 이름을 주고, 2018 도시건설처럼 묶음 머리가 없는 문서는
# findings._groups_from_restarts 가 총괄 표로 묶음을 붙여 「구청」으로 남는 지적은 없다.
# 동 → 구: 2025 총무경제 결과보고서(29391) 증인 표의 「가람동」「나래동」 줄과
# 「가람구 및 14개동, 나래구 및 17개동」 묶음 머리로 확인했다. 옛 동 이름(○○8·9동 등)도
# 같은 앞말이라 앞말로 가른다. 구별 동 앞말은 config/region.json 의 「구」에 있다.
def _build_region():
    global GU_NAMES, _GU, GU, BOTH_GU, GU_DONG, GU_PREFIX
    GU_NAMES = region.gu_names()
    _GU = region.gu_alt()
    GU = re.compile(rf'^[·,/․]*({_GU})구?')
    BOTH_GU = re.compile(rf'^({_GU})구?청?(?:[·,/․]+|및)({_GU})구?청?(.*)$')
    GU_DONG = {g: re.compile('^(' + '|'.join(re.escape(d) for d in ds) + r')\d*동$')
               for g, ds in region.dong_prefixes().items() if ds}
    GU_PREFIX = re.compile(rf'^({_GU})구(보건소)?(\s|$)')


_build_region()


@lru_cache(maxsize=1)
def _config():
    return json.loads((paths.CONFIG / '행정기구.json').read_text(encoding='utf-8'))


@lru_cache(maxsize=1)
def _gu_depts():
    return set((_config().get('구') or {}).get('부서') or []) | {'동행정복지센터'}


@lru_cache(maxsize=1)
def _affiliates():
    """출자출연기관 이름. 조직도 정식 이름, 별칭 뒤 이름, 앞의 지자체 이름(「○○(시)」)을 뗀 이름을 다 받는다."""
    out, city = set(), region.city_prefix_pattern()
    for row in _config().get('출자출연기관') or []:
        n = row.get('기관') if isinstance(row, dict) else row
        if not n:
            continue
        for v in (n, re.sub(city, '', n), n.split()[-1]):
            out |= {v, _alias().get(v, v)}
    return out


def _district(dept):
    g = GU_PREFIX.match(dept or '')
    if g:
        return g.group(1) + '구'
    for g, pat in GU_DONG.items():
        if pat.match(dept or ''):
            return g + '구'
    return None


def localize(dept, group='', raw=''):
    """구 단위 부서면 묶음 머리·꼬리표에서 한 구를 찾아 앞에 붙인다."""
    if not dept or GU_PREFIX.match(dept):
        return dept
    health = _org().get(dept) == '보건소'
    if dept not in _gu_depts() and not health:
        return dept
    text = f'{group} {raw}'
    has = [g for g in GU_NAMES if g in text]
    if len(has) != 1:
        return dept
    return f'{has[0]}구보건소 {dept}' if health else f'{has[0]}구 {dept}'


# ── 두 구 공통 지적 (Task 4f, 사용자 결정 2026-09-28) ─────────────────────
# 「양 구청 및 31개 동」「가람구 및 14개동, 나래구 및 17개동」처럼 두 구에 함께 준 지적은
# 한 구로 가를 수 없다. 기록은 하나(같은 ID)로 두고 각 구의 같은 부서 밑에 함께 보인다.
# places() 가 그 부서 이름 목록을 준다(한 구면 하나, 두 구 공통이면 구마다 하나).
# 「양 구청」「양구」「양 보건소」(후속: 두 구 보건소에 함께 준 지적도 같은 규칙, 2026-09-28).
_BOTH_WORD = re.compile(r'(?<![가-힣])양\s*(?:구|보건소)')


def _per_gu(dept, g):
    """g 구의 같은 부서 이름. 구 단위 부서는 「○○구 X」, 보건소 부서는 「○○구보건소 X」,
    조직도에 「○○구X」가 있으면 그 이름."""
    if dept in _gu_depts():
        return f'{g}구 {dept}'
    if _org().get(dept) == '보건소':
        return f'{g}구보건소 {dept}'
    n = f'{g}구{dept}'
    return n if _org().get(n) not in (None, n) else None


def places(dept, group='', raw=''):
    """이 지적을 보일 부서 이름 목록. 두 구 공통이면 구마다 하나씩, 아니면 localize 한 이름 하나."""
    one = localize(dept, group, raw)
    if one != dept or len(GU_NAMES) < 2:
        return [one]
    text = f'{group} {raw}'
    has = [g for g in GU_NAMES if g in text]
    # 최종 검토 I1(통제관 판정 2026-09-28): 구 신호가 아예 없는 보건소 부서(묶음 머리 「보건소」의 맨
    # 건강증진과·보건정책과)는 두 구 보건소에 다 있는 부서라 「양 보건소」와 같이 두 구 공통으로 둔다.
    health_bare = not has and _org().get(dept) == '보건소'
    if len(has) < 2 and not _BOTH_WORD.search(text) and not health_bare:
        return [dept]
    names = [_per_gu(dept, g) for g in (has if len(has) >= 2 else GU_NAMES)]
    return names if all(names) else [dept]


def silguk_of(dept):
    g = GU_PREFIX.match(dept or '')
    if g:
        return g.group(1) + ('구보건소' if g.group(2) else '구')
    if dept in {g + '구' for g in GU_NAMES}:
        return dept
    dist = _district(dept)
    if dist:
        return dist
    if dept in _affiliates():
        return '출자출연기관'
    org = _org().get(dept)
    if org in ('부서', '동', '구청') or (org is None and dept in _gu_depts()):
        return '구청'
    return org or '기타'


def all_depts():
    return [{"name": d, "silguk": s} for d, s in sorted(_org().items()) if d != s]


def _base(name):
    return GU_PREFIX.sub('', name).strip() or name


def catalog(names, raw_seen=None):
    """화면 부서 목록(I2). 지적·세출·약속에 나온 부서와 현 조직도의 합집합.
    aliases 는 별칭.json 에서 이 이름으로 가는 옛 이름과 실제로 본 원문 꼴을 합친다.
    current 는 (구를 뗀) 이름이 현 조직도나 출자출연기관 목록에 있는지다."""
    raw_seen = raw_seen or {}
    org = _org()
    silguk_names = set((_config().get('실국') or {}))
    # 동행정복지센터는 조직도에 동 이름으로만 있지만 구마다 있는 현행 단위다(Task 4f).
    cur = {d for d, s in org.items() if d not in silguk_names} | _affiliates() | _gu_depts()
    pool = (set(names) | {d for d in org if d not in silguk_names}) - {'여러 부서 공통', '미상', ''}
    # Task 4f: 구 단위 부서(조직도 「구」.「부서」)의 맨 이름은 구마다 「○○구 X」로 편다.
    # 맨 이름을 그대로 두면 어느 구인지 모를 「구청」 묶음이 따로 생긴다.
    # 시 본청에도 같은 이름이 있으면(건축과 — 도시주택국) 맨 이름은 본청 부서로 남긴다.
    # 보건소 부서(조직도 소속기관.부서.보건소)의 맨 이름도 구마다 「○○구보건소 X」로 편다(최종 검토 I1) —
    # 맨 이름을 두면 어느 보건소인지 모를 「보건소」 묶음이 따로 생긴다.
    if GU_NAMES:
        bare = {n for n in pool if n in _gu_depts() or org.get(n) == '보건소'}
        pool = ((pool - {n for n in bare if org.get(n) in (None, '부서', '보건소')})
                | {_per_gu(n, g) for n in bare for g in GU_NAMES})
    back = {}
    for old, new in _alias().items():
        back.setdefault(new, set()).add(old)
    out = []
    for n in sorted(pool):
        b = _base(n)
        al = (back.get(n, set()) | (back.get(b, set()) if b != n else set())
              | {r.strip() for r in raw_seen.get(n, ()) if r and r.strip()}) - {n}
        out.append({"name": n, "silguk": silguk_of(n), "aliases": al,
                    "current": b in cur or n in cur})
    # Task 4f(Bug A): 다른 부서 이름과 같은 표기나 두 부서 이상에 걸린 표기(「건설과」가 가람구
    # 건설과·나래구 건설과 양쪽에)는 별칭으로 두지 않는다 — 화면 색인이 한쪽으로 몰아 셌다.
    seen = Counter(a for d in out for a in d['aliases'])
    taken = {d['name'] for d in out}
    for d in out:
        d['aliases'] = sorted(a for a in d['aliases'] if seen[a] == 1 and a not in taken)
    return out


@region.on_refresh
def _refresh():
    _build_region()
    for f in (_alias, _org, _config, _gu_depts, _affiliates):
        f.cache_clear()
