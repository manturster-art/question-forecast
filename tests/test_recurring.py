from dcc import recurring


def F(i, y, d, t):
    return {"id": i, "year": y, "dept": d, "title": t}


def test_groups_same_dept_two_shared_words_different_years():
    fs = [F('a', 2023, '청년정책관', '청년정책실무위원회 재가동 검토'),
          F('b', 2025, '청년정책관', '청년정책실무위원회 재가동 요구'),
          F('c', 2025, '총무과', '청년정책실무위원회 재가동')]
    gs = recurring.group(fs)
    assert len(gs) == 1
    g = gs[0]
    assert g['dept'] == '청년정책관' and g['years'] == [2023, 2025]
    assert set(g['finding_ids']) == {'a', 'b'}
    assert '청년정책실무위원회' in g['common']
    assert fs[0]['recurring'] == g['id'] and 'recurring' not in fs[2]


def test_same_year_not_grouped():
    fs = [F('a', 2025, '총무과', '공무원 충원계획 수립'), F('b', 2025, '총무과', '공무원 충원계획 점검')]
    assert recurring.group(fs) == []


def test_formal_excluded():
    assert recurring.is_formal('행정사무감사 자료 제출 철저')
    fs = [F('a', 2023, '총무과', '행정사무감사 자료 제출 철저'),
          F('b', 2024, '총무과', '행정사무감사 자료 제출 철저')]
    assert recurring.group(fs) == []


def test_common_dept_bucket_excluded():
    fs = [F('a', 2023, '여러 부서 공통', '지역업체 물품구매 우선'),
          F('b', 2024, '여러 부서 공통', '지역업체 물품구매 확대')]
    assert recurring.group(fs) == []


def test_generic_inflected_words_alone_do_not_group():
    # Fix round 1: 「철저히」「관리를」「방안을」「마련하여」 같은 활용형 일반어만 겹치면 묶지 않는다.
    fs = [F('a', 2018, '징수과', '「체납자 실태조사반」운영준비를 철저히 하여 세입증대에 만전을 기하시기 바람'),
          F('b', 2024, '징수과', '체납자 관리를 철저히 하여 주시기 바랍니다.'),
          F('c', 2022, '고용노동과', '이동노동자쉼터 활성화 방안을 마련하시기 바랍니다.'),
          F('d', 2023, '고용노동과', '청년들을 위한 적극적 인 지원 방안을 마련하시기 바랍니다.'),
          F('e', 2020, '회계과', '물품 관리를 철저히 하여 주시기 바랍니다.'),
          F('f', 2021, '회계과', '계약 관리를 철저를 기하여 주시고 노력하여 주시기 바랍니다.')]
    assert recurring.group(fs) == []


def test_substantive_group_survives_generic_filter():
    fs = [F('a', 2023, '세정과', '마을세무사 활성화 및 지원책을 마련하여 주시기 바랍니다.'),
          F('b', 2024, '세정과', '마을세무사 활성화 및 지원책을 마련하여 주시기 바랍니다.')]
    gs = recurring.group(fs)
    assert len(gs) == 1 and '마을세무사' in gs[0]['common']
    assert not ({'마련하여', '주시기', '바랍니다'} & set(gs[0]['common']))


def test_is_generic_forms():
    for w in ['철저히', '철저를', '마련하여', '마련해', '방안을', '방안', '관리를', '관리', '노력',
              '기하여', '바랍니다', '주시고', '하여', '대하여', '등을', '위하여', '있도록', '마련하시기']:
        assert recurring.is_generic(w), w
    for w in ['마을세무사', '체납자', '공유재산', '청년정책실무위원회', '건설과', '지원책']:
        assert not recurring.is_generic(w), w


def test_prevention_phrasing_alone_does_not_group():
    # 최종 검토 수정 3: 「…발생하지 않도록」만 겹친 서로 다른 지적(가나도시공사 2023·2024, 행정지원과
    # 2024·2025 꼴)이 되풀이로 묶였다. 「발생」「않도록」「없도록」 꼴은 일반어로 본다.
    fs = [F('a', 2023, '가나도시공사', '체육시설 이용객 안전사고가 발생하지 않도록 관리에 만전을 기하시기 바랍니다.'),
          F('b', 2024, '가나도시공사', '공사 현장 소음 민원이 발생하지 않도록 조치해 주시기 바랍니다.'),
          F('c', 2024, '행정지원과', '청사 주차 민원이 발생되지 않도록 대책을 마련해 주실 것 바랍니다.'),
          F('d', 2025, '행정지원과', '청사 방호 안전사고가 없도록 대책을 마련해 주시기 바랍니다.')]
    assert recurring.group(fs) == []
    for w in ['발생', '발생하지', '발생되지', '않도록', '없도록']:
        assert recurring.is_generic(w), w
