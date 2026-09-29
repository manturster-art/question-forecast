# 역할: 같은 부서가 여러 해에 걸쳐 같은 취지로 지적받은 것을 한 줄기로 묶는다.
#
# 앞선 점검 도구(비공개)의 규칙을 옮겼다. 같은 부서 안에서, 다른 해끼리, 뜻낱말이 둘 이상 겹치면
# 한 줄기다. 기계 추정이므로 겹친 낱말(common)을 함께 넘겨 화면에 근거로 보인다.
# 「여러 부서 공통」「미상」은 부서가 아니므로 묶지 않는다. 형식적 지적(자료 제출·수감 태도)도 뺀다.
import re
from collections import Counter, defaultdict

STOP = set('및 등 관련 방안 마련 개선 검토 추진 노력 강화 철저 바람 하시기 위한 대한 통한 적극 '
           '다양한 실질적 전반적 효율적 내실 기하시기 있도록 하여 주시기 제고 확대 운영 사업 '
           '바랍니다 주시기 해주시기 수립해 기하여 만전을'.split())
# Fix round 1(2026-09-26): 「철저히」「관리를」「방안을」「마련하여」처럼 일반어의 활용형만 겹쳐
# 줄기가 묶였다. 일반어 줄기 + 조사·어미 꼴이면 뜻낱말에서 뺀다(STOP 은 그대로 둔다).
GENERIC_STEMS = ('및 등 관련 방안 마련 개선 검토 추진 노력 강화 철저 바람 바랍 바라 위한 대한 통한 위하 대하 통하 '
                 '적극 다양 실질 전반 효율 내실 기하 있도 주시 해주 하시 하여 수립 만전 제고 확대 운영 사업 '
                 '관리 모색 조치 점검 필요 대책 계획 최선 신경 반영 요망 요청 기울 사항 '
                 # 최종 검토 수정 3: 「…발생하지 않도록」「…없도록」 같은 예방 당부 꼴만 겹쳐 서로 다른
                 # 지적이 묶였다(도시공사 2023·2024, 행정지원과 2024·2025).
                 '발생 않도 없도').split()
ENDINGS = ('', '을', '를', '이', '가', '은', '는', '의', '에', '로', '으로', '와', '과', '도', '히', '적', '적인', '한',
           '하', '하여', '해', '해서', '하고', '하기', '하시기', '하는', '할', '된', '되', '에서', '서', '여', '고',
           '록', '도록', '니다', '기', '시기', '시고', '하여야', '해야', '책', '안', '하지', '되지')
_GENERIC = {st + e for st in GENERIC_STEMS for e in ENDINGS}


def is_generic(w):
    return w in STOP or w in _GENERIC


FORMAL = re.compile(r'행정사무감사\s*(자료|위원|수감)|수감\s*태도|자료\s*(작성|제출)\s*(철저|성실)')
NOT_DEPT = {'여러 부서 공통', '미상'}


def keys(title):
    return {w for w in re.findall(r'[가-힣A-Za-z]{2,}', title) if not is_generic(w)}


def is_formal(title):
    return bool(FORMAL.search(title))


def group(findings):
    # 두 구 공통 지적(depts 가 있는 것, Task 4f)은 같은 부서의 다른 두 구 공통 지적하고만 묶는다.
    # 한 구의 지적과 섞으면 줄기가 두 구를 잇게 된다.
    by = defaultdict(list)
    for f in findings:
        if f['dept'] not in NOT_DEPT and not is_formal(f['title']):
            by[(f['dept'], tuple(f.get('depts') or ()))].append(f)
    groups = []
    for (dept, joint), rs in by.items():
        rs = sorted(rs, key=lambda x: x['year'])
        used = [False] * len(rs)
        for i, a in enumerate(rs):
            if used[i]:
                continue
            g, ka = [a], keys(a['title'])
            used[i] = True
            for j in range(i + 1, len(rs)):
                if used[j] or rs[j]['year'] == a['year']:
                    continue
                if len(ka & keys(rs[j]['title'])) >= 2:
                    g.append(rs[j])
                    used[j] = True
            if len(g) < 2:
                continue
            common = set.intersection(*(keys(x['title']) for x in g))
            if not common:
                c2 = Counter(w for x in g for w in keys(x['title']))
                common = {w for w, n in c2.items() if n >= 2}
            groups.append({"dept": dept, "joint": list(joint), "rows": g, "common": sorted(common)})
    groups.sort(key=lambda g: (-len(g['rows']), g['dept']))
    out = []
    for n, g in enumerate(groups, 1):
        gid = f'R{n:03d}'
        for x in g['rows']:
            x['recurring'] = gid
        row = {"id": gid, "dept": g['dept'],
               "years": sorted({x['year'] for x in g['rows']}),
               "finding_ids": [x['id'] for x in g['rows']], "common": g['common']}
        if g['joint']:
            row['depts'] = g['joint']
        out.append(row)
    return out
