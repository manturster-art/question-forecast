from dcc import snapshot

META = {"year": 2025, "com": "총무경제", "kind": "결과보고서", "uid": 29391}


def _reports():
    fs = [{"year": 2025, "com": "총무경제", "group": "g", "no": 1, "title": "청년정책실무위원회 재가동 검토",
           "body": "b", "dept_raw": "청년정책관", "uid": 29391},
          {"year": 2025, "com": "총무경제", "group": "g", "no": 2, "title": "지역업체 물품구매",
           "body": "b", "dept_raw": "전 부서", "uid": 29391}]
    old = [{"year": 2023, "com": "총무경제", "group": "g", "no": 7, "title": "청년정책실무위원회 재가동 요구",
            "body": "b", "dept_raw": "청년정책관", "uid": 20000}]
    return [{"meta": META, "parsed": {"declared": 2, "findings": fs}},
            {"meta": {**META, "year": 2023, "uid": 20000}, "parsed": {"declared": 1, "findings": old}}]


def _qna():
    return [{"meta": {"date": "2026-03-09", "session": 309, "title": "t", "uid": 29229},
             "promises": [{"id": "P309-02-01", "session": 309, "date": "2026-03-09", "topic": "청년정책",
                           "question": "청년정책실무위원회 재가동 계획은?",
                           "commitments": ["재구성하여 운영할 계획임."], "uid": 29229}]}]


def _exp():
    return [{"year": 2025, "dept": "청년정책관", "acct": "일반회계", "project": "청년정책 네트워크 운영",
             "budget": 100, "spent": 80, "mended": False}]


def test_findings_public_shape():
    pub, _ = snapshot.assemble(_reports(), _exp(), _qna(), '2026-10-02')
    assert pub['generated'] == '2026-10-02'
    ids = [f['id'] for f in pub['findings']]
    # 통제관 판단 R2(2026-09-25): id 끝 번호는 보고서 안 파서 순번. 인쇄 번호는 no 에 남는다
    assert 'F2025-총무경제-001' in ids and 'F2023-총무경제-001' in ids
    assert next(f for f in pub['findings'] if f['id'] == 'F2023-총무경제-001')['no'] == 7
    f = next(f for f in pub['findings'] if f['id'] == 'F2025-총무경제-001')
    assert f['dept'] == '청년정책관' and f['recurring'] == 'R001'
    assert pub['recurring'][0]['years'] == [2023, 2025]
    s = next(s for s in pub['sources'] if s['uid'] == 29391)
    assert s['declared'] == 2 and s['parsed'] == 2
    assert s['url'].endswith('uid=29391')


def test_site_data_adds_promises_expenditure_depts():
    _, site = snapshot.assemble(_reports(), _exp(), _qna(), '2026-10-02')
    p = site['promises'][0]
    assert p['dept'] == '청년정책관' and p['dept_guess'] is True and p['dept_basis']
    assert site['expenditure']['청년정책관'][0]['budget'] == 100
    assert any(d['name'] == '청년정책관' for d in site['depts'])


def test_pub_sources_exclude_qna_rows():
    pub, site = snapshot.assemble(_reports(), _exp(), _qna(), '2026-10-02')
    assert all(s['kind'] == '결과보고서' for s in pub['sources'])
    assert any(s.get('kind') == '답변요지서' and s['uid'] == 29229 for s in site['sources'])


def test_only_promises_with_commitments_kept():
    q = _qna()
    q[0]['promises'].append({**q[0]['promises'][0], "id": "P309-02-02", "commitments": []})
    _, site = snapshot.assemble(_reports(), _exp(), q, '2026-10-02')
    assert [p['id'] for p in site['promises']] == ['P309-02-01']


# ── 최종 검토 뒤 고침 (R1·R2·R3·R4·I1·I2·minor) ──────────────────────────
import pytest
from dcc import paths


def _one(com, fs, uid=1, declared=None, year=2025):
    return {"meta": {"year": year, "com": com, "kind": "결과보고서", "uid": uid},
            "parsed": {"declared": declared, "findings": fs}}


def _f(no, title, dept_raw, group='g', year=2025, com='총무경제', uid=1):
    return {"year": year, "com": com, "group": group, "no": no, "title": title, "body": "b",
            "dept_raw": dept_raw, "uid": uid}


def test_ids_unique_when_printed_numbers_restart_per_group():
    fs = [_f(1, '가 점검', '총무과', 'g1'), _f(2, '나 점검', '총무과', 'g1'), _f(1, '다 점검', '회계과', 'g2')]
    pub, _ = snapshot.assemble([_one('총무경제', fs)], [], [], 'd')
    ids = sorted(f['id'] for f in pub['findings'])
    assert ids == ['F2025-총무경제-001', 'F2025-총무경제-002', 'F2025-총무경제-003']
    assert sorted(f['no'] for f in pub['findings']) == [1, 1, 2]


def test_assemble_raises_on_duplicate_ids():
    r = _one('총무경제', [_f(1, '가 점검', '총무과')])
    with pytest.raises(ValueError):
        snapshot.assemble([r, r], [], [], 'd')


# 사용자 결정(2026-09-25)으로 R1(의회운영 제외)을 뒤집는다: 의회운영위원회 지적도
# 다른 위원회와 똑같이 findings 에 들어가고 sources 행에 excluded/reason 을 남기지 않는다.
def test_council_operations_committee_included_with_source_row():
    rs = [_one('의회운영', [_f(1, '사무국 점검', '의회사무처', com='의회운영', uid=9)], uid=9),
          _one('총무경제', [_f(1, '가 점검', '총무과')])]
    pub, site = snapshot.assemble(rs, [], [], 'd')
    assert any(f['com'] == '의회운영' for f in pub['findings'])
    ids = [f['id'] for f in pub['findings']]
    assert 'F2025-의회운영-001' in ids
    s = next(s for s in pub['sources'] if s['com'] == '의회운영')
    assert 'excluded' not in s and 'reason' not in s
    assert all('excluded' not in s for s in pub['sources'])


def test_names_before_titles_are_masked_in_findings_and_promises():
    fs = [_f(1, '홍길동 과장 답변 관련', '총무과')]
    fs[0]['body'] = '김철수 의원이 요구함'
    fs[0]['group'] = '이영희 국장 소관'
    q = _qna()
    q[0]['promises'][0]['question'] = '최가나 시장님 청년정책 계획은?'
    q[0]['promises'][0]['topic'] = '박민수 부시장 답변'
    q[0]['promises'][0]['commitments'] = ['정다라 과장이 운영할 계획임.']
    pub, site = snapshot.assemble([_one('총무경제', fs)], _exp(), q, 'd')
    f = pub['findings'][0]
    assert f['title'] == '○○○ 과장 답변 관련' and f['body'] == '○○○ 의원이 요구함'
    assert f['group'] == '○○○ 국장 소관'
    p = site['promises'][0]
    assert p['question'].startswith('○○○ 시장님') and p['topic'] == '○○○ 부시장 답변'
    assert p['commitments'] == ['○○○ 과장이 운영할 계획임.']


def test_non_recurring_findings_carry_null():
    pub, _ = snapshot.assemble(_reports(), _exp(), _qna(), 'd')
    f = next(f for f in pub['findings'] if f['dept'] == '여러 부서 공통')
    assert 'recurring' in f and f['recurring'] is None


def test_manan_and_dongan_same_dept_not_merged():
    rs = [_one('총무경제', [_f(1, '도로 굴착 복구 관리 철저', '건설과', '가람구', 2023)], uid=1, year=2023),
          _one('총무경제', [_f(1, '도로 굴착 복구 관리 철저', '건설과', '나래구', 2025)], uid=2)]
    pub, _ = snapshot.assemble(rs, [], [], 'd')
    assert {f['dept'] for f in pub['findings']} == {'가람구 건설과', '나래구 건설과'}
    assert {f['silguk'] for f in pub['findings']} == {'가람구', '나래구'}
    assert pub['recurring'] == []


def test_site_depts_is_catalog_union():
    _, site = snapshot.assemble(_reports(), _exp() + [
        {"year": 2019, "dept": "녹지과", "acct": "일반회계", "project": "가로수 정비",
         "budget": 1, "spent": 1, "mended": False}], _qna(), 'd')
    by = {d['name']: d for d in site['depts']}
    assert set(by['청년정책관']) == {'name', 'silguk', 'aliases', 'current'}
    assert '녹지과' in by['정원도시과']['aliases']
    assert by['청년정책관']['current'] is True


def test_write_refuses_leaks_and_writes_clean(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'OUT', tmp_path)
    for bad in ({"t": "<td>x</td>"}, {"t": "성 명"}, {"t": "홍길동 과장"}, {"t": "담당 가나다라"}):
        with pytest.raises(Exception):
            snapshot.write(bad, 'x.json', names={'가나다라'})
        assert not (tmp_path / 'x.json').exists()
    assert snapshot.write({"t": "깨끗"}, 'x.json', names={'가나다라'}).exists()


# ── Task 0: 두 산출물 다 누출 검사를 먼저 통과해야 하나라도 쓴다 ─────────────────
def test_write_both_checks_both_leaks_before_writing_either(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, 'OUT', tmp_path)
    ok = {"t": "깨끗"}
    bad = {"t": "홍길동 과장"}
    with pytest.raises(Exception):
        snapshot.write_both(ok, bad, names=set())
    assert not (tmp_path / 'findings_public.json').exists()
    assert not (tmp_path / 'site_data.json').exists()
    p1, p2 = snapshot.write_both(ok, ok, names=set())
    assert p1.exists() and p2.exists()


# ── Task 4f: 두 구 공통 지적은 기록 하나로 두 구 부서에 함께 든다 ─────────────────
def test_joint_district_finding_is_one_record_listed_under_both():
    g = '양 구청 및 31개 동 행정복지센터'
    rs = [_one('총무경제', [_f(1, '공유재산 대부료 체납 관리 철저', '행정지원과', g)], uid=1)]
    pub, site = snapshot.assemble(rs, [], [], 'd')
    [f] = pub['findings']
    assert f['dept'] == '행정지원과' and f['depts'] == ['가람구 행정지원과', '나래구 행정지원과']
    assert f['silguk'] == '가람구·나래구'
    names = {d['name'] for d in site['depts']}
    assert {'가람구 행정지원과', '나래구 행정지원과'} <= names and '행정지원과' not in names
    assert all(d['silguk'] != '구청' for d in site['depts'])


def test_joint_findings_chain_only_with_joint_findings():
    g = '가람구 및 14개동, 나래구 및 17개동'
    rs = [_one('보사환경', [_f(1, '경로당 냉난방비 지원 점검 철저', '복지문화과', g, 2023, '보사환경')], uid=1, year=2023),
          _one('보사환경', [_f(1, '경로당 냉난방비 지원 점검 철저', '복지문화과', g, 2025, '보사환경', 2)], uid=2),
          _one('보사환경', [_f(1, '경로당 냉난방비 지원 점검 철저', '복지문화과', '가람구', 2024, '보사환경', 3)],
               uid=3, year=2024)]
    pub, _ = snapshot.assemble(rs, [], [], 'd')
    [r] = pub['recurring']
    assert r['years'] == [2023, 2025] and r['depts'] == ['가람구 복지문화과', '나래구 복지문화과']
    solo = next(f for f in pub['findings'] if f['year'] == 2024)
    assert solo['dept'] == '가람구 복지문화과' and solo['recurring'] is None


# ── 최종 검토 I1·I2 ──────────────────────────────────────────────────────
def test_bare_district_dept_without_signal_goes_to_common_not_nowhere(capsys):
    # 구 신호가 없는 맨 「건설과」(빈 묶음 머리)는 catalog 에 없어 어느 화면에도 안 보인다 → 여러 부서 공통으로 돌린다
    rs = [_one('도시건설', [_f(1, '보도 정비 철저', '건설과', '', com='도시건설')], uid=1)]
    pub, site = snapshot.assemble(rs, [], [], 'd')
    [f] = pub['findings']
    assert f['dept'] == '여러 부서 공통' and 'depts' not in f and f['dept_raw'] == '건설과'
    assert site['unplaced'] == 1
    assert '1건' in capsys.readouterr().out
    names = {d['name'] for d in site['depts']}
    for g in pub['findings']:
        assert all(n in names or n in snapshot.BUCKETS for n in g.get('depts') or [g['dept']])


def test_bare_health_center_group_is_joint_and_no_health_bucket():
    rs = [_one('보사환경', [_f(1, '금연구역 점검 철저', '건강증진과', '보건소', com='보사환경')], uid=1)]
    pub, site = snapshot.assemble(rs, [], [], 'd')
    [f] = pub['findings']
    assert f['depts'] == ['가람구보건소 건강증진과', '나래구보건소 건강증진과']
    assert site['unplaced'] == 0
    assert not [d for d in site['depts'] if d['silguk'] == '보건소']


def test_site_data_assigns_every_current_dept_to_a_committee_or_unassigned():
    _, site = snapshot.assemble(_reports(), _exp(), _qna(), 'd')
    assert 'committees' in site and 'unassigned' in site and 'groups' in site
    assert site["council"]["exec_low"] == 60 and site["council"]["exec_high"] == 100
    assert site["council"]["dong_group"] == "구청·동 행정복지센터"
    assert site["council"]["overrides"]["가람구 민원봉사과"] == ["기획행정위원회", "도시교통위원회"]
    assert [g['name'] for g in site['groups']] == ["구청·동 행정복지센터"]
    placed = ({n for c in site['committees'] for n in c['depts']} | {n for g in site['groups'] for n in g['depts']}
              | set(site['unassigned']))
    for d in site['depts']:
        if d['current']:
            assert d['name'] in placed
    by = {c['name']: c['depts'] for c in site['committees']}
    assert '청년정책관' in by['기획행정위원회']
