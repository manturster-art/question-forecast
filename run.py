# 역할: 한 줄로 자료층을 돈다. 수집 → 파싱 → 조립.
#   python run.py            캐시가 있으면 쓰고 없는 것만 받는다
#   python run.py --refresh  전부 다시 받는다(PDF·md·세출 캐시를 새로 만든다)
#   python run.py --offline  받지 않고 캐시만 쓴다(md 캐시가 있으면 PDF 가 없어도 된다)
#   python run.py --force    지적이 0건이거나 앞선 산출보다 30% 넘게 줄어도 덮어쓴다
#   python run.py --site-only  ①~⑤ 를 건너뛰고 out/site_data.json 만 읽어 ⑥ 만 굽는다
#   python run.py --site-only --sample  합성 견본 자료(examples/sample/site_data.json, 가상 지자체)로 ⑥ 만 굽는다.
#                              받지 않고 out/site_data.json 도 건드리지 않는다(--sample 만 줘도 같다)
# 한 문서가 안 읽혀도 멈추지 않고 이름을 적고 넘어간다. 끝에 모아서 알린다.
#
# 이름 누출 검사(최종 검토 뒤 고침 R4): 결과보고서마다 감사반 편성·출석·증인 표에서 이름을
# 거둬 names(메모리의 set)에 모으고 snapshot.write 에 넘긴다. 파일로 남기지 않는다.
#
# Task 2: 이름 사전을 의회 공개 명단(현직·역대 의원)·시장 이름으로 넓힌다. 받은 이름은
# work/names_public.json 에만 캐시하고(names_public.py), 여기서 읽어 위 names 에 합친다.
# --site-only 는 새로 받지 않고 캐시가 있으면 그것만 쓴다(offline=True).
import datetime
import json
import sys
from dcc import council_site as cs, expenditure, findings, kordoc_cli, names_public, paths, qna, site_build, snapshot

DROP_LIMIT = 0.30


def load_lists(offline, problems):
    cached = paths.WORK / 'lists.json'
    if not offline:
        try:
            insp, qlist = cs.fetch_lists()
            cached.write_text(json.dumps([insp, qlist], ensure_ascii=False), encoding='utf-8')
            return insp, qlist
        except Exception as e:
            problems.append(f'누리집 목록을 못 받아 캐시된 목록(work/lists.json)을 씁니다: {e}')
    if cached.exists():
        insp, qlist = json.loads(cached.read_text(encoding='utf-8'))
        return insp, qlist
    print('   캐시된 목록이 없습니다. 빈 목록으로 계속합니다')
    return [], []


def md_of(uid, refresh, offline):
    pdf = paths.WORK / 'pdf' / f'{uid}.pdf'
    md = paths.WORK / 'md' / f'{uid}.md'
    if offline:
        # PDF 를 지웠어도 md 캐시가 있으면 그것으로 충분하다
        if md.exists() and md.stat().st_size > 200:
            return md.read_text(encoding='utf-8')
        if not pdf.exists():
            raise RuntimeError('캐시에 없음(--offline)')
        return kordoc_cli.to_markdown(pdf)
    if refresh and pdf.exists():
        pdf.unlink()
    cs.download_pdf(uid, pdf)
    return kordoc_cli.to_markdown(pdf, refresh=refresh)


def source_warnings(meta, parsed):
    """「확인할 것」에 올릴 말. 선언 수가 없거나(None), 0건이거나, 선언과 다르면 적는다."""
    tag, n, dec = f'{meta["year"]} {meta["com"]}', len(parsed['findings']), parsed['declared']
    out = []
    if n == 0:
        out.append(f'{tag}: 파싱 0건')
    if dec is None:
        out.append(f'{tag}: 총괄 표에서 선언 수를 못 읽음(파싱 {n})')
    elif dec != n:
        out.append(f'{tag}: 선언 {dec} · 파싱 {n}')
    return out


def overwrite_refusal(n_new, force):
    """덮어쓰면 안 될 까닭을 돌려준다. 괜찮으면 None."""
    if force:
        return None
    if n_new == 0:
        return '지적이 0건입니다'
    old = paths.OUT / 'findings_public.json'
    if old.exists():
        try:
            n_old = len(json.loads(old.read_text(encoding='utf-8')).get('findings', []))
        except (ValueError, AttributeError):
            n_old = 0
        if n_old and n_new < n_old * (1 - DROP_LIMIT):
            return f'지적이 {n_old} → {n_new} 로 {round((1 - n_new / n_old) * 100)}% 줄었습니다'
    return None


def build_site(site, names=()):
    print('⑥ HTML 굽기')
    out = site_build.build(site, paths.OUT / '부서점검표.html', names=names)
    print(f'   {out} ({out.stat().st_size / 1_000_000:.1f}MB)')
    # 자체 시험판(Task 8) — ?selftest 러너가 붙은 별도 산출물. 출하판(위)에는 안 들어간다.
    out_st = site_build.build(site, paths.OUT / '부서점검표_selftest.html', selftest=True, names=names)
    print(f'   {out_st} ({out_st.stat().st_size / 1_000_000:.1f}MB, 자체 시험판)')
    # 의원용 페이지 — 같은 자료로 따로 굽는다(공개 주소 배포 대상 아님).
    out_c = site_build.build(site, paths.OUT / '의원점검표.html', names=names, page='council')
    print(f'   {out_c} ({out_c.stat().st_size / 1_000_000:.1f}MB, 의원용)')
    out_cst = site_build.build(site, paths.OUT / '의원점검표_selftest.html', selftest=True, names=names, page='council')
    print(f'   {out_cst} ({out_cst.stat().st_size / 1_000_000:.1f}MB, 의원용 자체 시험판)')


def main(argv):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    refresh, offline, force = '--refresh' in argv, '--offline' in argv, '--force' in argv
    paths.ensure()

    if '--sample' in argv:
        # 합성 견본 자료: 지어낸 가상 지자체 자료라 공개 명단 이름 사전이 필요 없다(이름+직함 꼴 검사는 그대로 건다).
        site = json.loads(paths.SAMPLE.read_text(encoding='utf-8'))
        print(f'견본 자료로 굽습니다: {paths.SAMPLE.relative_to(paths.ROOT).as_posix()}')
        build_site(site, names_public.fetch_names(offline=True))
        return 0

    if '--site-only' in argv:
        site = json.loads((paths.OUT / 'site_data.json').read_text(encoding='utf-8'))
        # 1차 고침(컨트롤러 지시 g): --site-only 는 새로 받지 않고 캐시만 쓴다. 캐시가
        # 아예 없으면 공개 명단 없이 검사가 도는 셈이니 조용히 넘어가지 않는다.
        if not (paths.WORK / 'names_public.json').exists():
            print('⚠ work/names_public.json 이 없습니다 — 공개 명단 이름 사전 없이 굽습니다'
                  '(한 번은 --refresh 나 --offline 없이 돌려 캐시를 만들어 두세요)')
        build_site(site, names_public.fetch_names(offline=True))
        return 0

    problems, names = [], set()
    pub_names = names_public.fetch_names(offline=offline)
    names |= set(pub_names)
    print(f'① 앞 공개 명단(현직·역대 의원·시장) {len(pub_names)}명')

    print('① 의회 누리집 목록')
    insp, qlist = load_lists(offline, problems)
    print(f'   결과보고서 {sum(r["kind"] == "결과보고서" for r in insp)}건 · 답변요지서 {len(qlist)}건')

    print('② 결과보고서')
    reports = []
    for m in [r for r in insp if r['kind'] == '결과보고서']:
        try:
            md = md_of(m['uid'], refresh, offline)
            p = findings.parse_report(md, m['year'], m['com'], m['uid'])
            names |= findings.harvest_names(md)
        except Exception as e:
            problems.append(f'{m["year"]} {m["com"]} 결과보고서: {e}')
            continue
        # Task 0: 의회운영이 아닌데 번호 항목이 없어 ○ 글머리 모드로 읽었으면 알린다
        # (다른 위원회는 번호 매기기 항목이 정상이라 글머리 모드면 파싱을 놓쳤을 수 있다).
        if p['mode'] == 'circle' and m['com'] != '의회운영':
            problems.append(f'{m["year"]} {m["com"]}: 번호 항목이 없어 글머리 모드로 읽음')
        warn = source_warnings(m, p)
        print(f'   {m["year"]} {m["com"]:6} {len(p["findings"]):>3}건 · 선언 {p["declared"]}')
        problems += warn
        reports.append({"meta": m, "parsed": p})

    print('③ 답변요지서')
    qreports = []
    for m in qlist:
        try:
            ps = qna.parse_report(md_of(m['uid'], refresh, offline), m['session'], m['date'], m['uid'])
        except Exception as e:
            problems.append(f'제{m["session"]}회 답변요지서: {e}')
            continue
        print(f'   제{m["session"]}회 질문 {len(ps)} · 약속 {sum(len(p["commitments"]) for p in ps)}')
        qreports.append({"meta": m, "promises": ps})

    print('④ 시 세출')
    rows = expenditure.load(refresh=refresh, offline=offline)
    print(f'   사업 {len(rows):,}줄')

    print('⑤ 조립')
    pub, site = snapshot.assemble(reports, rows, qreports, datetime.date.today().isoformat())
    why = overwrite_refusal(len(pub['findings']), force)
    rc = 0
    if why:
        print(f'   out/*.json 을 쓰지 않았습니다: {why}. 그래도 쓰려면 --force')
        rc = 1
    else:
        # Task 0: 두 파일 다 누출 검사를 먼저 통과한 뒤에만 쓴다.
        p1, p2 = snapshot.write_both(pub, site, names)
        print('  ', p1)
        print('  ', p2)
        build_site(site, names)
    print(f'   지적 {len(pub["findings"])} · 되풀이 {len(pub["recurring"])}줄기 · 약속 {len(site["promises"])}'
          f' · 이름 검사 목록 {len(names)}개(메모리에만)')
    names.clear()

    if problems:
        print('\n확인할 것')
        for p in problems:
            print('  -', p)
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
