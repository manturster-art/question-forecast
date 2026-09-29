# 역할: 파싱한 것들을 모아 공개 스냅샷(다른 도구가 가져갈 것)과 화면 자료를 만든다.
#
# findings_public.json 은 다른 도구와 주고받는 단방향 스냅샷이다. 모양을 바꾸면
# 받는 쪽 결합 코드도 함께 바꿔야 한다(스펙 §10).
# 여기서 이름 필드를 새로 만들지 않는다. 앞 단계가 이미 버렸고, 이 파일은 옮겨 담기만 한다.
#
# 최종 검토 뒤 고침(2026-09-25, 통제관 판단 R1~R4)
#   R1 (2026-09-25 사용자 결정으로 뒤집힘 — 아래 「의회운영 포함」 참조)
#   R2 id = F{연도}-{위원회}-{보고서 안 파서 순번:03d}. 인쇄 번호는 묶음마다 1부터 다시
#      도는 문서가 많아 id 로 못 쓴다(전량 1509건 중 유일 431). 인쇄 번호는 no 에 둔다.
#   R3 직함 앞 이름을 ○○○ 로 가린다(지적 title·body·group, 약속 topic·question·commitments).
#   R4 write 는 쓰기 전에 누출 검사를 하고 걸리면 쓰지 않는다.
#
# 의회운영 포함 (2026-09-25 사용자 결정)
#   R1(의회운영위원회는 의회사무처 소관이라 지적에서 뺀다)을 사용자가 뒤집었다. 의회운영
#   결과보고서도 다른 위원회와 똑같이 findings 에 들어가고, sources 행에 excluded·reason
#   을 남기지 않는다.
import json
from collections import defaultdict
from dcc import committees, council_site, depts, expenditure, paths, privacy, qna, recurring, region


def assemble(reports, expenditure_rows, qna_reports, today):
    raws = [f['dept_raw'] for r in reports for f in r['parsed']['findings']]
    vocab = depts.build_vocab(raws)
    findings, sources = [], []
    raw_seen = defaultdict(set)
    for r in reports:
        m, p = r['meta'], r['parsed']
        src = {"kind": "결과보고서", "year": m['year'], "com": m['com'], "uid": m['uid'],
               "url": council_site.viewer_url(m['uid']),
               "declared": p['declared'], "parsed": len(p['findings'])}
        sources.append(src)
        for seq, f in enumerate(p['findings'], 1):
            bare = depts.normalize(f['dept_raw'], vocab)
            where = depts.places(bare, f['group'], f['dept_raw'])
            # Task 4f: 두 구 공통 지적은 기록 하나(같은 id)에 dept 는 맨 이름, depts 에 구마다의 이름.
            d = where[0] if len(where) == 1 else bare
            if f['dept_raw'] and len(where) == 1:
                raw_seen[d].add(f['dept_raw'])
            row = {**f, "title": privacy.mask_names(f['title']),
                   "body": privacy.mask_names(f['body']),
                   "group": privacy.mask_names(f['group']),
                   "id": f"F{f['year']}-{f['com']}-{seq:03d}",
                   "dept": d, "silguk": '·'.join(dict.fromkeys(depts.silguk_of(n) for n in where))}
            if len(where) > 1:
                row['depts'] = where
            findings.append(row)
    ids = [f['id'] for f in findings]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise ValueError(f'지적 id 가 겹칩니다: {dup[:5]}')
    unplaced = place_guard(findings)
    groups = recurring.group(findings)
    for f in findings:
        f.setdefault('recurring', None)
    findings.sort(key=lambda f: (f['dept'], -f['year'], f['com'], f['id']))
    pub = {"generated": today, "sources": sources, "findings": findings, "recurring": groups}

    words = qna.project_words(expenditure_rows)
    promises, qna_sources = [], []
    for q in qna_reports:
        for p in q['promises']:
            if not p['commitments']:
                continue
            d, basis = qna.guess_dept(p['question'] + ' ' + ' '.join(p['commitments']), words)
            promises.append({**p, "topic": privacy.mask_names(p['topic']),
                             "question": privacy.mask_names(p['question']),
                             "commitments": [privacy.mask_names(c) for c in p['commitments']],
                             "dept": d, "dept_basis": basis, "dept_guess": True})
        qna_sources.append({"kind": "답변요지서", "session": q['meta']['session'], "date": q['meta']['date'],
                            "uid": q['meta']['uid'], "url": council_site.viewer_url(q['meta']['uid'])})

    spend = expenditure.by_dept(expenditure_rows)
    for r in expenditure_rows:
        raw_seen[depts.normalize(r['dept'])].add(r['dept'])
    names = ({n for f in findings for n in f.get('depts') or [f['dept']]}
             | set(spend) | {p['dept'] for p in promises})
    # site_data.json 의 sources 는 결과보고서 + 답변요지서 모두를 담는다(화면 용).
    # findings_public.json(pub) 은 다른 도구가 가져가는 결과보고서 전용 스냅샷이므로
    # 여기서 새 리스트로 만들어 pub['sources'] 와 물리적으로 분리한다(같은 리스트를 쓰면
    # 답변요지서 행이 findings_public.json 에도 새 나간다).
    site = {**pub, "sources": sources + qna_sources, "promises": promises,
            "expenditure": spend, "depts": depts.catalog(names, raw_seen),
            # 화면 실·국 공통 지적 칸이 「가람구 및 14개동」 같은 묶음 머리를 그 구에 붙일 때 쓴다(region.json 「구」 앞말).
            "gu": list(depts.GU_NAMES),
            # 구 실·국 부서 목록에서 구청 부서를 먼저, 동을 뒤에 두려고 동 이름 앞말을 넘긴다(region.json 「구」).
            "dong": region.dong_prefixes(),
            # 부서 목록에 없는 이름이라 「여러 부서 공통」으로 돌린 지적 수(최종 검토 I2). sync.log 에도 적는다.
            "unplaced": unplaced}
    # 의원용 페이지: 부서 → 현 상임위(overrides → 구청·동 묶음 → 소관표 이름 → 소관표 실·국 → 지적 많은 위원회 → 미확인).
    # 기준값·묶음 이름·overrides 는 config/council.json. 규칙은 dcc/committees.py 머리말.
    cfg = json.loads((paths.CONFIG / '행정기구.json').read_text(encoding='utf-8'))
    hist = json.loads((paths.CONFIG / '상임위_변천.json').read_text(encoding='utf-8'))
    table = {c: list(u) for c, u in (cfg.get('상임위') or {}).items()}
    council = json.loads((paths.CONFIG / 'council.json').read_text(encoding='utf-8'))
    r = committees.assign(site['depts'], site['findings'], table, hist,
                          dong=site['dong'], group=council.get('dong_group'), overrides=council.get('overrides'))
    site['committees'], site['groups'], site['unassigned'] = r['committees'], r['groups'], r['unassigned']
    site['council'] = council
    return pub, site


BUCKETS = ('여러 부서 공통', '미상')


def place_guard(findings):
    """최종 검토 I2: 지적의 dept(두 구 공통이면 depts 각각)가 화면 부서 목록(catalog)에 없으면 어느 화면에도
    안 보인 채 총수에만 남는다(예: 구 신호 없는 맨 「건설과」 — catalog 는 맨 구 부서 이름을 지운다). 그런 지적은
    「여러 부서 공통」으로 돌리고 몇 건인지 알린다(run.py 출력·sync.log). 꼬리표 원문(dept_raw)은 그대로 남는다."""
    known = {d['name'] for d in depts.catalog({n for f in findings for n in f.get('depts') or [f['dept']]})}
    moved = 0
    for f in findings:
        if any(n not in known and n not in BUCKETS for n in f.get('depts') or [f['dept']]):
            f['dept'], f['silguk'] = '여러 부서 공통', depts.silguk_of('여러 부서 공통')
            f.pop('depts', None)
            moved += 1
    if moved:
        print(f'   ⚠ 부서 목록에 없는 부서 이름 {moved}건을 「여러 부서 공통」으로 돌렸습니다(꼬리표 원문은 dept_raw)')
    return moved


def write(obj, name, names=()):
    """누출 검사(privacy.assert_no_leak)를 거친 뒤에만 쓴다. names 는 run.py 가 이번
    실행에서 거둔 이름 목록이다(메모리에만 있다)."""
    privacy.assert_no_leak(obj, names)
    paths.OUT.mkdir(parents=True, exist_ok=True)
    p = paths.OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')
    return p


def write_both(pub, site, names=()):
    """findings_public.json 과 site_data.json 을 함께 쓴다. Task 0 고침: 둘 다 누출
    검사를 먼저 통과해야 하나라도 쓴다 — site_data 만 걸려도 findings_public 은
    (이미 검사를 통과했더라도) 쓰이지 않는다."""
    privacy.assert_no_leak(pub, names)
    privacy.assert_no_leak(site, names)
    p1 = write(pub, 'findings_public.json', names)
    p2 = write(site, 'site_data.json', names)
    return p1, p2
