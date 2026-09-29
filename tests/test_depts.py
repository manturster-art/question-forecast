from dcc import depts


def test_spacing_and_gu_prefix():
    assert depts.normalize('가 람복지문화과') == '가람구 복지문화과'
    assert depts.normalize(' 홍보기획관 ') == '홍보기획관'


def test_common():
    assert depts.normalize('전 부서') == '여러 부서 공통'
    assert depts.normalize('행정지원과, 동 행정복지센터') == '행정지원과'
    assert depts.normalize('') == '미상'


def test_alias():
    assert depts.normalize('도시공사') == '가나도시공사'
    assert depts.normalize('행정복지센터') == '동행정복지센터'


def test_split_glued_names_with_vocab():
    vocab = depts.build_vocab(['행정지원과', '행정지원과', '자치행정과', '자치행정과'])
    assert depts.normalize('행정지원과자치행정과', vocab) == '행정지원과'


def test_silguk():
    assert depts.silguk_of('예산법무과') == '기획경제실'
    assert depts.silguk_of('가람구 복지문화과') == '가람구'
    assert depts.silguk_of('없는과') == '기타'


def test_silguk_org_shapes():
    # 통제관 판단(2026-09-25): 실국 은 dict, 부시장 직속(옛 보좌기관) 은 평평한 list, 소속기관 은
    # 중첩 dict(부서 밑에 또 부서명별 list) 라 브리프의 얕은 dict/list 두 갈래로는
    # 못 잡는다. _org() 를 재귀 평탄화로 고치며 추가한 시험.
    assert depts.silguk_of('청년정책관') == '부시장 직속'
    assert depts.silguk_of('보건정책과') == '보건소'


def test_all_depts_includes_flat_list_members():
    names = {d['name'] for d in depts.all_depts()}
    assert '청년정책관' in names
    assert '홍보기획관' in names
    assert '감사관' in names


# ── 최종 검토 뒤 고침 (I1·I2) ────────────────────────────────────────────
def test_localize_gu_level_dept_from_group_or_raw():
    assert depts.localize('건설과', '가람구 및 14개동', '건설과') == '가람구 건설과'
    assert depts.localize('건축과', '나래구', '건축과') == '나래구 건축과'
    assert depts.localize('동행정복지센터', '나래구 및 동 행정복지센터', '동 행정복지센터') == '나래구 동행정복지센터'
    # 두 구가 한 묶음이면 가를 수 없다
    assert depts.localize('건설과', '가람구 및 14개동, 나래구 및 17개동', '건설과') == '건설과'
    assert depts.localize('세무과', '양 구청 및 31개 동 행정복지센터', '세무과') == '세무과'
    # 시 본청 건축과(도시주택국)는 구 이름이 없으면 그대로
    assert depts.localize('건축과', '도시주택국', '건축과') == '건축과'
    # 구 단위가 아닌 부서는 구 묶음 안에 있어도 붙이지 않는다
    assert depts.localize('총무과', '가람구', '총무과') == '총무과'
    # 이미 붙은 것은 그대로
    assert depts.localize('가람구 세무과', '나래구', '가람 세무과') == '가람구 세무과'


def test_localize_health_center_depts():
    assert depts.localize('건강증진과', '가람구 및 14개동', '건강증진과') == '가람구보건소 건강증진과'
    assert depts.normalize('가람구보건소 건강증진과') == '가람구보건소 건강증진과'
    assert depts.silguk_of('가람구보건소 건강증진과') == '가람구보건소'
    assert depts.silguk_of('가람구보건소') == '가람구보건소'


def test_silguk_of_gu_and_dong_and_affiliates():
    assert depts.silguk_of('나래구 건설과') == '나래구'
    assert depts.silguk_of('건설과') == '구청'          # 어느 구인지 모름
    assert depts.silguk_of('가나1동') == '가람구'
    assert depts.silguk_of('초롱동') == '나래구'
    assert depts.silguk_of('가나도시공사') == '출자출연기관'
    assert depts.silguk_of('가나시청소년재단') == '출자출연기관'
    assert depts.silguk_of('가나시민프로축구단') == '출자출연기관'


def test_normalize_common_and_both_districts():
    for raw in ('전 동', '31개동', '전동행정복지센터', '31개 동', '해당기관', '각 동 행정복지센터'):
        assert depts.normalize(raw) == '여러 부서 공통', raw
    assert depts.normalize('양보건소 건강증진과') == '건강증진과'
    assert depts.normalize('양 보건소 보건정책과') == '보건정책과'
    assert depts.normalize('양구청 복지문화과') == '복지문화과'
    assert depts.normalize('양구 도서관') == '도서관'
    assert depts.normalize('31개동노인복지과') == '노인복지과'
    assert depts.normalize('행정복지센터') == '동행정복지센터'
    assert depts.normalize('동 행정복지센터') == '동행정복지센터'


def test_old_names_follow_data_backed_aliases():
    # config/별칭.json 의 예시 줄(옛 이름 → 현 이름). 표에 없는 이름은 그대로 둔다.
    assert depts.normalize('녹지과') == '정원도시과'
    assert depts.normalize('기후대기과') == '기후대기과'


def test_catalog_unions_sources_with_aliases_and_current_flag():
    cat = depts.catalog(['정원도시과', '가람구 건설과', '없던과'],
                        raw_seen={'정원도시과': {'녹지과', '정원 도시과'}, '가람구 건설과': {'가람건설과'}})
    by = {d['name']: d for d in cat}
    assert set(by['정원도시과']) == {'name', 'silguk', 'aliases', 'current'}
    assert '녹지과' in by['정원도시과']['aliases'] and '정원 도시과' in by['정원도시과']['aliases']
    assert by['정원도시과']['current'] is True and by['정원도시과']['silguk'] == '환경국'
    assert by['가람구 건설과']['current'] is True and by['가람구 건설과']['silguk'] == '가람구'
    assert by['없던과']['current'] is False
    assert '청년정책관' in by                     # 현 조직도는 늘 들어간다
    assert '여러 부서 공통' not in by and '미상' not in by
    assert all(d['name'] not in d['aliases'] for d in cat)


def test_gu_prefix_kept_when_multi_dept_tag_ends_in_dong():
    # 실물(2024 총무경제): 「가람 행정지원과, 가나2동」 — 끝 조각이 「동」이라 구 접두를 못 떼던 것
    assert depts.normalize('가람 행정지원과, 가나2동') == '가람구 행정지원과'


def test_affiliate_short_name_from_long_official_name():
    # 행정기구.json 의 「가나ㆍ가온ㆍ누리ㆍ다솜 공동급식지원센터」를 결과보고서는 줄여 쓴다
    assert depts.silguk_of('공동급식지원센터') == '출자출연기관'


# ── 최종 검토 뒤 재검토 고침 (2026-09-25, commit a8b14ac 회귀) ──────────────
# 가람구·나래구를 둘 다 이름 지어 붙인 꼬리표(같은 부서가 두 구에 다 있다는 뜻)는
# 구를 떼는 while 루프가 첫 조각에서 멈춰 버려 두 구 이름이 부서 이름에 그대로
# 눌어붙었다(「가람구나래구도서관」류 뒤범벅). 두 구가 다 나오면 구를 붙이지 않고
# 부서만 남기거나(부서가 남으면), 남는 게 없으면 「여러 부서 공통」으로 본다.
def test_normalize_both_districts_tag_does_not_glue_names():
    assert depts.normalize('가람구, 나래구도서관') == '도서관'
    assert depts.normalize('가람, 나래 행정지원과') == '행정지원과'
    assert depts.normalize('가람구, 나래구') == '여러 부서 공통'


def test_normalize_single_district_prefix_still_works():
    assert depts.normalize('가람구 건설과') == '가람구 건설과'
    assert depts.normalize('나래구 건축과') == '나래구 건축과'


# ── Task 0: 「구청」 꼬리·「및」 이음말도 양구 판정에 받는다 ────────────────────
def test_both_gu_widened_for_cheong_suffix_and_and_connector():
    assert depts.normalize('가람구청, 나래구청') == '여러 부서 공통'
    assert depts.normalize('가람구 및 나래구') == '여러 부서 공통'
    assert depts.normalize('가람구, 나래구도서관') == '도서관'


# ── Task 4f: 구청을 가람구·나래구로 나눈다 ─────────────────────────────────
def test_places_joint_findings_go_to_both_districts():
    assert depts.places('건설과', '양 구청 및 31개 동 행정복지센터', '건설과') == ['가람구 건설과', '나래구 건설과']
    assert depts.places('복지문화과', '가람구 및 14개동, 나래구 및 17개동', '복지문화과') == \
        ['가람구 복지문화과', '나래구 복지문화과']
    assert depts.places('동행정복지센터', '양 구청 및 31개동 행정복지센터', '동 행정복지센터') == \
        ['가람구 동행정복지센터', '나래구 동행정복지센터']
    # 구 이름이 붙은 정식 이름이 조직도에 있는 부서(도서관)도 두 구 공통이면 둘 다
    assert depts.places('도서관', '평생학습원', '양구 도서관') == ['가람구도서관', '나래구도서관']
    # 한 구면 하나
    assert depts.places('건설과', '가람구청 및 동', '건설과') == ['가람구 건설과']
    # 구 단위가 아닌 부서, 구 신호가 없는 부서는 그대로
    assert depts.places('총무과', '양 구청 및 31개 동', '총무과') == ['총무과']
    assert depts.places('건축과', '도시주택국', '건축과') == ['건축과']


def test_normalize_keeps_official_name_with_district_prefix():
    assert depts.normalize('나래구도서관') == '나래구도서관'
    assert depts.normalize('나래구 도서관') == '나래구도서관'
    assert depts.normalize('가람구도서관') == '가람구도서관'
    assert depts.normalize('가람구보건소') == '가람구보건소'
    assert depts.normalize('가람 건설과') == '가람구 건설과'


def test_catalog_has_no_district_office_bucket_and_no_ambiguous_aliases():
    names = ['가람구 건설과', '나래구 건설과', '건축과', '가람구 동행정복지센터', '나래구 동행정복지센터']
    raw = {'가람구 건설과': {'건설과', '가람 건설과'}, '나래구 건설과': {'건설과', '나래 건설과'},
           '나래구 동행정복지센터': {'행정복지센터'}}
    cat = depts.catalog(names, raw)
    by = {d['name']: d for d in cat}
    taken = set(by)
    seen = {}
    for d in cat:
        for a in d['aliases']:
            assert a not in taken, (d['name'], a)               # 다른 부서 이름과 같은 표기는 별칭이 아니다
            assert a not in seen, (a, seen.get(a), d['name'])   # 두 부서에 걸린 표기도 아니다
            seen[a] = d['name']
    assert '건설과' not in by['가람구 건설과']['aliases'] and '건설과' not in by['나래구 건설과']['aliases']
    assert '가람 건설과' in by['가람구 건설과']['aliases']
    assert '행정복지센터' not in by['나래구 동행정복지센터']['aliases']   # 두 구 동행정복지센터에 다 걸린다
    # 구 단위 부서의 맨 이름은 없고 구마다 편 이름만 있다(본청에도 있는 건축과는 본청 부서로 남는다)
    assert '행정지원과' not in by and {'가람구 행정지원과', '나래구 행정지원과'} <= taken
    assert by['건축과']['silguk'] == '도시주택국'
    assert all(d['silguk'] != '구청' for d in cat)


def test_places_joint_health_center_findings():
    # 후속(2026-09-28): 「양 보건소」도 두 구 공통 — 구마다 「○○구보건소 X」
    assert depts.places('건강증진과', '양 보건소', '건강증진과') == ['가람구보건소 건강증진과', '나래구보건소 건강증진과']
    assert depts.places('보건정책과', '보건소', '양보건소 보건정책과') == ['가람구보건소 보건정책과', '나래구보건소 보건정책과']
    # 최종 검토 I1(통제관 판정): 구 신호가 없는 보건소 부서도 두 구 공통
    assert depts.places('건강증진과', '보건소', '건강증진과') == ['가람구보건소 건강증진과', '나래구보건소 건강증진과']
    assert depts.places('건강증진과', '보건소', '가람 건강증진과') == ['가람구보건소 건강증진과']
