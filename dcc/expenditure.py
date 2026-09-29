# 역할: 시 누리집 「사업 및 예산정보」(주소는 config/region.json 의 「세출」)에서 세출을 사업 단위로 받아 부서별로 모은다.
#
# 앞선 점검 도구(비공개)의 세출 수집기를 옮겼다(2026-09-24). 칸 뜻과 검산 근거는 그쪽 주석에 있다.
#   예산현액 = 편성액 + 이월액, 지출액은 그대로. 원본 집행잔액은 이월이 빠져 쓰지 않는다.
#   지출액 갱신이 늦은 해(2024 가 51% 로 나왔다)는 지방재정365 값을 예산 비율로 나눠 메우고 표시한다.
import json
import re
from collections import defaultdict
from functools import lru_cache
from dcc import depts, http, paths, region


def url(year):
    return region.load()['세출']['시누리집'].format(year=year)


ACCT, DEPT, FIELD, PROJ, KIND, PLAN, CARRY, SPENT = 0, 1, 2, 3, 4, 9, 10, 13
NCELL = 15
TR = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
TD = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.S)
TAG = re.compile(r'<[^>]+>|&nbsp;')


def _clean(s):
    s = TAG.sub('', s).replace('&amp;', '&').replace('&middot;', '·')
    return re.sub(r'\s+', ' ', s).strip()


def _num(s):
    s = re.sub(r'[^\d-]', '', s or '')
    return int(s) if s and s != '-' else 0


def _norm(s):
    return re.sub(r'\s|[()·,]', '', s or '')


def parse(html, year):
    out = []
    for tr in TR.findall(html):
        c = [_clean(x) for x in TD.findall(tr)]
        if len(c) != NCELL or not c[DEPT] or c[ACCT] == '회계구분':
            continue
        out.append({"year": year, "dept": c[DEPT], "acct": c[ACCT], "project": c[PROJ],
                    "budget": _num(c[PLAN]) + _num(c[CARRY]), "spent": _num(c[SPENT]),
                    "mended": False})
    return out


def fetch(year, refresh=False, offline=False):
    p = paths.WORK / '세출' / f'{year}.xls'
    if offline:
        # 최종 검토 뒤 고침(I5): --offline 은 받지 않는다. 캐시가 없으면 그 해는 건너뛴다.
        if not p.exists():
            raise RuntimeError('캐시에 없음(--offline)')
        return p.read_text(encoding='utf-8', errors='replace')
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.stat().st_size > 10000 and not refresh:
        return p.read_text(encoding='utf-8', errors='replace')
    # 이 서버는 파이썬 기본 TLS 로 악수가 깨진다. dcc.http 가 OS TLS(curl.exe)로 받는다.
    data = http.get(url(year), timeout=180)
    text = data.decode('utf-8', errors='replace')
    # 점검 안내·오류 쪽이 크기만 커서 캐시로 굳던 것을 막는다(minor): 사업 줄이 읽혀야 둔다.
    if not parse(text, year):
        raise RuntimeError(f'{year}년 세출 쪽에 사업 줄이 없습니다(캐시하지 않음)')
    p.write_bytes(data)
    return text


def thin_years(rows):
    gen = defaultdict(lambda: [0, 0])
    for r in rows:
        if r['acct'] == '일반회계':
            gen[r['year']][0] += r['budget']
            gen[r['year']][1] += r['spent']
    rate = {y: s / b * 100 for y, (b, s) in gen.items() if b}
    if not rate:
        return []
    med = sorted(rate.values())[len(rate) // 2]
    last = max(rate)
    return sorted(y for y, v in rate.items() if y < last and v < med - 15)


@lru_cache(maxsize=1)
def _reference():
    ref = defaultdict(int)
    # 보충 자료는 선택이다. 없으면(템플릿 기본) 메우지 않고 넘어간다 — 만드는 법은 docs/표준화.md.
    src = paths.DATA / '세출_지방재정365.json'
    if not src.exists():
        return {}
    for r in json.loads(src.read_text(encoding='utf-8')):
        ref[(r['year'], r['acct'], _norm(r['project']))] += r['spent']
    return dict(ref)


def mend(rows, years):
    ref = _reference()
    for y in years:
        same = defaultdict(list)
        for r in rows:
            if r['year'] == y:
                same[(y, r['acct'], _norm(r['project']))].append(r)
        for k, rs in same.items():
            if k not in ref:
                continue
            tot = sum(x['budget'] for x in rs)
            for x in rs:
                x['spent'] = round(ref[k] * (x['budget'] / tot)) if tot else round(ref[k] / len(rs))
                x['mended'] = True


def by_dept(rows):
    acc = defaultdict(lambda: defaultdict(lambda: {"budget": 0, "spent": 0, "mended": False}))
    for r in rows:
        v = acc[depts.normalize(r['dept'])][r['year']]
        v['budget'] += r['budget']
        v['spent'] += r['spent']
        v['mended'] = v['mended'] or r['mended']
    return {d: [{"year": y, **v} for y, v in sorted(ys.items())] for d, ys in acc.items()}


def load(years=range(2016, 2027), refresh=False, offline=False):
    rows = []
    for y in years:
        try:
            rows += parse(fetch(y, refresh, offline), y)
        except Exception as e:          # 한 해가 안 와도 나머지는 쓴다
            print(f'  {y}년 세출을 받지 못했습니다: {e}')
    thin = thin_years(rows)
    if thin:
        print(f'  지출액이 덜 찬 해 {thin} 를 지방재정365 로 메웁니다')
        mend(rows, thin)
    return rows
