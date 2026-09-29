# 역할: 부서를 현 상임위에 배정한다(의원용 페이지). 순수 함수 — 파일은 읽지 않는다.
# 규칙(앞의 것이 이긴다, 사용자 판정 2026-09-29):
# 0) overrides(config/council.json 「overrides」 {부서: [상임위…]})에 있으면 그대로(예: 구청 민원봉사과는 두 상임위).
# 1) group(config/council.json 「dong_group」)이 켜져 있으면 현행 동(「○○동」「○○2동」, 앞말은 region.json 「구」)·
#    구 동행정복지센터(「가람구 동행정복지센터」)·구청 본체(「가람구」)는 상임위가 아니라 그 묶음에 둔다 — 지적이 있어도.
#    구 실·국 전체를 넣지 않는 까닭: 구 건설과·복지과 같은 부서까지 끌려온다.
# 2) 소관표(행정기구.json 「상임위」)에 부서 이름 자체가 있으면 그 상임위만(여럿이면 모두 — 두 상임위 소관 공사).
#    그래야 환경국 부서가 실·국으로 두 상임위에 겹치지 않는다.
# 3) 이름이 없고 그 실·국이 있으면 그 상임위(여럿이면 모두).
# 4) 표에 없으면 지적 수가 가장 많은 상임위(약칭은 변천표로 현 이름으로 합쳐 셈). 두 구 공통 지적(depts 가 있는 것)은
#    빼고 세고, 공통 지적뿐일 때만 그것을 쓴다. 수가 같으면 가장 최근 연도가 있는 상임위, 그것도 같으면 모두.
# 5) 그래도 없으면 unassigned.
# 소관표의 상임위는 비어도 표 순서대로 먼저, 변천으로 새로 생긴 상임위는 그 뒤에 둔다.

import re


def _local(dong):
    """{구 앞말: [동 앞말]} → 부서가 현행 동·구 동행정복지센터·구청 본체인지 가리는 함수."""
    gu = {f'{g}구' for g in dong}
    centers = {f'{g}구 동행정복지센터' for g in dong}
    ps = [re.escape(p) for v in dong.values() for p in v]
    rx = re.compile('^(' + '|'.join(ps) + r')\d*동$') if ps else None
    return lambda d: (d['name'] in gu or d['name'] in centers or
                      bool(d.get('current') and rx and rx.match(d['name'])))


def _by_findings(findings, history):
    """부서 → {현 상임위: [단독 수, 단독 최근 연도, 공통 수, 공통 최근 연도]}."""
    tally = {}
    for f in findings:
        c = history.get(f.get('com'))
        if not c:
            continue
        i = 2 if f.get('depts') else 0
        for d in f.get('depts') or [f.get('dept')]:
            t = tally.setdefault(d, {}).setdefault(c, [0, 0, 0, 0])
            t[i] += 1
            t[i + 1] = max(t[i + 1], f['year'])
    return tally


def _pick(t):
    i = 0 if any(v[0] for v in t.values()) else 2
    cand = {c: (v[i], v[i + 1]) for c, v in t.items() if v[i]}
    if not cand:
        return []
    best = max(cand.values())
    return sorted(c for c, v in cand.items() if v == best)


def assign(depts, findings, table, history, dong=None, group=None, overrides=None):
    tally = _by_findings(findings, history)
    order = list(table)
    members = {c: set() for c in order}
    grouped, unassigned = [], []
    local = _local(dong or {}) if group else (lambda d: False)
    overrides = overrides or {}
    for d in depts:
        name, sg = d['name'], d.get('silguk')
        if name in overrides:
            hit = list(overrides[name])
        elif local(d):
            grouped.append(name)
            continue
        else:
            hit = [c for c, units in table.items() if name in units]
            if not hit:
                hit = [c for c, units in table.items() if sg in units]
            if not hit and name in tally:
                hit = _pick(tally[name])
        if not hit:
            unassigned.append(name)
            continue
        for c in hit:
            if c not in members:
                members[c] = set()
                order.append(c)
            members[c].add(name)
    # 소관표의 상임위는 소관 부서가 하나도 안 잡혀도 남긴다(시작 화면 카드 4장, spec §5).
    return {"committees": [{"name": c, "depts": sorted(members[c])} for c in order if members[c] or c in table],
            "groups": [{"name": group, "depts": sorted(grouped)}] if group else [],
            "unassigned": sorted(unassigned)}
