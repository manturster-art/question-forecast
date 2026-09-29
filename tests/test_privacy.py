import pytest
from dcc import privacy


@pytest.mark.parametrize('src, want', [
    ('홍길동 시장은 답변하였음', '○○○ 시장은 답변하였음'),
    ('홍길동 의원님 질의에 대해', '○○○ 의원님 질의에 대해'),
    ('홍길동의원이 요구한 자료', '○○○의원이 요구한 자료'),
    ('김철수 부시장, 이영희 과장', '○○○ 부시장, ○○○ 과장'),
    ('박민수 사무국장 보고', '○○○ 사무국장 보고'),
    ('최가나 구청장·정다라 동장', '○○○ 구청장·○○○ 동장'),
    ('홍길동 의원이 요구한 자료', '○○○ 의원이 요구한 자료'),
])
def test_masks_name_before_title(src, want):
    assert privacy.mask_names(src) == want


@pytest.mark.parametrize('src', [
    '가나시장 명의로 공고', '농수산물도매시장 시설 개선', '전통 시장 활성화', '전통시장 지원',
    '대한 시장님 답변', '따라서 의원님께서', '해외 시장 개척', '가나종합운동장 보수',
    '의회사무처장 소관', '예산법무과장 협의', '주민자치위원장 선출', '지역구 의원 요구',
    '은하수동장 보고', '청년도깨비야시장 운영', '국회의원 공약', '각 동장님께',
    '이러한 시장 상황', '복지문화국장 답변',
    # 최종 검토 뒤 고침(Task 0): 「하여」로 끝나는 말(「인하여」)이 이름으로 잘못
    # 가려지던 것(F2018-의회운영-001 회귀).
    '일정으로 인하여 의원들이',
])
def test_leaves_ordinary_words(src):
    assert privacy.mask_names(src) == src


def test_leak_check_flags_html_and_name_column_and_names():
    ok = {"findings": [{"title": "가 점검", "body": "본문"}]}
    privacy.assert_no_leak(ok, {'홍길동'})
    for bad in ('<td>x</td>', '<table>', '성 명', '성명 칸', '홍길동 과장', '담당 홍길동'):
        with pytest.raises(privacy.LeakError):
            privacy.assert_no_leak({"findings": [{"title": bad}]}, {'홍길동'})


def test_leak_check_walks_nested_values_and_keys():
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"expenditure": {"<td>": [1]}}, set())
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"a": [{"b": ["x", "가나다 의원"]}]}, set())


def test_leak_check_ignores_short_harvested_tokens():
    # 두 글자 조각(「이용」 등)은 흔한 낱말과 겹쳐 검사하지 않는다
    privacy.assert_no_leak({"t": "시설 이용 안내"}, {'이용'})


# Task 2(공개 명단): 사전에 든 이름이 「(숫자·절반 등) …상인 …」류 관용구 자리에 우연히
# 겹치면 사람 이름이 아니다(실제 산출물 검사로 발견한 사례를 가짜 이름 「다상인」으로
# 재현 — 실제 이름은 여기 적지 않는다). 1차 고침(컨트롤러 지시 d): 왼쪽 수량어뿐 아니라
# 오른쪽에도 관용구 꼬리(경우·것·자·때·숫자)가 있어야 하고, 이름 자체도 흔한 한자어
# 서술꼴 끝 두 글자(…상인·…하인·…만인·…과인·…일인)로 끝나야만 봐준다.
def test_leak_check_allows_quantity_idiom_that_coincides_with_a_public_name():
    privacy.assert_no_leak({"t": "장애인이 2명 다상인 경우"}, {'다상인'})
    privacy.assert_no_leak({"t": "응답자의 절반 다상인 50.9퍼센트"}, {'다상인'})


def test_leak_check_still_flags_the_same_name_used_as_a_real_reference():
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "다상인 위원이 발언하였음"}, {'다상인'})


# 1차 고침(컨트롤러 지시 d): 숫자가 앞에 있다고 무조건 봐주지 않는다 — 이름이 관용구
# 서술꼴로 끝나지 않거나 뒤에 관용구 꼬리가 없으면 여전히 걸려야 한다(가짜 이름으로 재현).
def test_leak_check_still_catches_ordinary_names_preceded_by_a_count():
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "참석 2명 가나다, 라마바"}, {'가나다', '라마바'})
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "제9대 가나다 발언"}, {'가나다'})
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "3차 가나다"}, {'가나다'})


# 컨트롤러 지시: 자료 원문에서 이름이 「김 신」처럼 글자 사이에 공백이 들어간 채로 나올 수
# 있다(공개 명단 쪽에서는 parse_members 가 공백을 이미 지워 사전엔 「김신」으로만 들어간다).
# 사전 이름 글자 사이에 공백이 끼어 나와도 걸려야 한다.
def test_leak_check_catches_name_with_space_inserted_between_characters():
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "가 나다 위원이 발언하였음"}, {'가나다'})
    with pytest.raises(privacy.LeakError):
        privacy.assert_no_leak({"t": "라마 바 위원이 발언하였음"}, {'라마바'})
