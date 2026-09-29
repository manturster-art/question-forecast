from pathlib import Path
from dcc import findings

MD = (Path(__file__).parent / 'fixtures' / 'result_report.md').read_text(encoding='utf-8')
MD_2023 = (Path(__file__).parent / 'fixtures' / 'result_report_2023.md').read_text(encoding='utf-8')
MD_2020 = (Path(__file__).parent / 'fixtures' / 'result_report_2020.md').read_text(encoding='utf-8')
MD_2019_DASH = (Path(__file__).parent / 'fixtures' / 'result_report_2019_dash.md').read_text(encoding='utf-8')
MD_2018_CIRCLED = (Path(__file__).parent / 'fixtures' / 'result_report_2018_circled.md').read_text(encoding='utf-8')
MD_2025_WITAK = (Path(__file__).parent / 'fixtures' / 'result_report_2025_dosigeonseol.md').read_text(encoding='utf-8')
MD_2025_UIHOE = (Path(__file__).parent / 'fixtures' / 'result_report_2025_uihoeunyeong.md').read_text(encoding='utf-8')


def test_declared_total():
    assert findings.declared_total(MD) == 4


def test_parses_items_after_heading_only():
    r = findings.parse_report(MD, 2025, '총무경제', 29391)
    fs = r['findings']
    assert len(fs) == 4
    assert r['declared'] == 4
    names = ' '.join(f['title'] + f['body'] for f in fs)
    assert '가나다' not in names and '홍길동' not in names


def test_title_spans_lines_and_tag_on_next_line():
    f = findings.parse_report(MD, 2025, '총무경제', 29391)['findings'][0]
    assert f['no'] == 1
    assert f['title'] == '시정 소식지 발행 계획을 독자층에 맞게 다시 세워 주시기 바랍니다.'
    assert f['dept_raw'] == '홍보기획관'
    assert f['group'] == '부시장 직속부서, 안전행정국'
    assert f['body'].startswith('연령, 지역')


def test_tag_on_same_line_and_common_dept():
    fs = findings.parse_report(MD, 2025, '총무경제', 29391)['findings']
    assert fs[1]['dept_raw'] == '청년정책관'
    assert fs[1]['body'].startswith('2023년부터')
    assert fs[2]['dept_raw'] == '전 부서'
    assert fs[2]['group'] == '기획경제실, 농수산물도매시장관리사업소'


def test_missing_tag_is_empty_not_guessed():
    f = findings.parse_report(MD, 2025, '총무경제', 29391)['findings'][3]
    assert f['no'] == 16
    assert f['title'].startswith('공유재산의 취득')
    assert f['title'].endswith('바랍니다.')
    assert f['dept_raw'] == ''
    assert '출석' not in f['body']


def test_witness_attendance_heading_is_not_a_finding():
    """「N. 증인출석현황」은 「나. 시정및처리요구사항」과 같은 상위 번호매기기를 쓰는
    별개 절 제목이라 ITEM 정규식이 오인한다(2025 총무경제 결과보고서 실물에서 확인,
    선언 65 대 파싱 66 불일치의 원인). 출석요구인 표 앞에서 멈춰야 한다."""
    r = findings.parse_report(MD, 2025, '총무경제', 29391)
    assert len(r['findings']) == 4
    names = ' '.join(f['title'] + f['body'] for f in r['findings'])
    assert '증인출석현황' not in names


def test_2023_shape_paren_tag_and_plain_heading_group():
    """2023 보사환경 실물 꼴: 묶음 머리가 《…》 없이 맨 ### 헤딩(### 복지문화국)이고,
    부서 꼬리표가 <…> 대신 (…)로 온다. 같은 줄(1번)과 다음 줄(2번) 두 경우 모두 확인한다."""
    fs = findings.parse_report(MD_2023, 2023, '보사환경', 24821)['findings']
    assert len(fs) == 5
    assert fs[0]['group'] == '복지문화국'
    assert fs[0]['dept_raw'] == '공통'
    assert fs[0]['body'].startswith('예산과목별 50%이상')
    assert fs[1]['group'] == '복지문화국'
    assert fs[1]['dept_raw'] == '문화관광과'
    names = ' '.join(f['title'] + f['body'] for f in fs)
    assert '홍길동' not in names


def test_2020_shape_no_space_bullet_and_no_ending_title():
    """2020 도시건설 실물 꼴: START 가 ≪…≫(#3개), 본문 글머리표가 ▸(공백 없음), 제목이
    「바람」 없이 「철저」로 끝나도 소괄호 꼬리표만으로 닫혀야 한다."""
    fs = findings.parse_report(MD_2020, 2020, '도시건설', 20568)['findings']
    assert fs[0]['group'] == '도시주택국'
    assert fs[0]['dept_raw'] == '공통'
    assert fs[0]['title'] == '도시주택국의 비전 및 전략 수립 철저'
    assert fs[0]['body'].startswith('도시주택국의 비전 및 전략 수립 시')
    assert fs[1]['dept_raw'] == '도시계획과'


def test_bare_heading_mid_section_closes_group_2023():
    """헤딩 표시 없는 맨 줄 묶음 머리(「보건소」)는 이전 지적을 끊고 새 묶음을 연다.
    이전 지적 본문에 그 글자가 섞여 들어가면 안 된다(fix round 2, 원인: 2023 보사환경
    9개 그룹 중 첫 하나만 ### 헤딩이라 나머지 5개가 이전 본문에 흡수됐었다)."""
    fs = findings.parse_report(MD_2023, 2023, '보사환경', 24821)['findings']
    assert len(fs) == 5
    assert fs[1]['group'] == '복지문화국'
    assert '보건소' not in fs[1]['body']
    assert fs[2]['group'] == '보건소'
    assert fs[2]['dept_raw'] == '건강증진과'


def test_bare_gu_dong_list_heading_ignores_length_cap_2023():
    """「가람구 및 14개동, 나래구 및 17개동」(22자)은 다른 헤딩 없는 묶음 머리의 20자
    상한을 넘지만, 「OO구 및 N개동」이 이어 붙은 꼴이면 상한과 무관하게 묶음으로
    받는다(fix round 3, 원인: 2023 보사환경 304행이 이 상한에 걸려 직전 지적(4번,
    평생학습원 그룹)의 body 끝에 흡수되고 group 이 갱신되지 않았다)."""
    fs = findings.parse_report(MD_2023, 2023, '보사환경', 24821)['findings']
    assert len(fs) == 5
    assert fs[3]['group'] == '보건소'
    assert '개동' not in fs[3]['body']
    assert fs[4]['group'] == '가람구 및 14개동, 나래구 및 17개동'
    assert fs[4]['dept_raw'] == '공통'


def test_bare_heading_mid_section_closes_group_2020():
    """2020 도시건설 꼴: 「가람구 및 14개동」처럼 숫자 섞인 헤딩 없는 묶음 머리도 받는다."""
    fs = findings.parse_report(MD_2020, 2020, '도시건설', 20568)['findings']
    assert len(fs) == 4
    assert fs[1]['group'] == '도시주택국'
    assert '가람구' not in fs[1]['body']
    assert fs[2]['group'] == '가람구 및 14개동'
    assert fs[2]['dept_raw'] == '교통정책과'


def test_paren_tag_rejects_non_department_parenthetical():
    """소괄호 꼬리표 남용 방지: 「(2020년 기준)」은 부서꼴이 아니므로 dept_raw 로 삼지
    않고 제목 글 안에 그대로 둔다(fix round 2, over-match 위험 지적)."""
    fs = findings.parse_report(MD_2020, 2020, '도시건설', 20568)['findings']
    f = fs[3]
    assert f['dept_raw'] == ''
    assert f['title'].endswith('(2020년 기준)')


def test_dash_paren_number_items_2019():
    """2018·2019 도시건설·보사환경 실물 꼴: 항목 번호가 「1.」이 아니라 「- 1)」
    (대시+숫자+닫는 괄호)로 온다(T10 전량 실행에서 발견, 2019 도시건설 선언 62 대
    파싱 0 원인). ITEM 이 이 꼴을 받지 못하면 지적이 통째로 안 잡힌다."""
    r = findings.parse_report(MD_2019_DASH, 2019, '도시건설', 20560)
    fs = r['findings']
    assert len(fs) == 3
    assert fs[0]['no'] == 1
    assert fs[0]['group'] == '도시주택국'
    assert fs[0]['dept_raw'] == '공통'
    assert fs[0]['title'].startswith('예산불용액이')
    assert fs[1]['no'] == 2
    assert fs[1]['dept_raw'] == '도시계획과'
    names = ' '.join(f['title'] + f['body'] for f in fs)
    assert '홍길동' not in names and '출석' not in names


def test_bare_paren_number_without_dash_2019():
    """같은 문서 안에서도 쪽 넘김 등으로 대시가 빠진 「1)」 단독 꼴이 섞여 나온다
    (T10 전량 실행에서 발견, 2019 도시건설 가나도시공사 그룹 전체가 이 꼴이라
    통째로 안 잡혔었다)."""
    fs = findings.parse_report(MD_2019_DASH, 2019, '도시건설', 20560)['findings']
    assert fs[2]['no'] == 1
    assert fs[2]['group'] == '가나도시공사'
    assert fs[2]['title'].startswith('가나도시공사의 업무 효율화')


def test_dash_circled_number_items_2018():
    """2018 보사환경 실물 꼴: 항목 번호가 원문자(①②③…)이고 그룹마다 1부터 다시
    돈다(T10 전량 실행에서 발견, 선언 53 대 파싱 0 원인). 부서 꼬리표가 없는 항목도
    있다(②)."""
    r = findings.parse_report(MD_2018_CIRCLED, 2018, '보사환경', 20557)
    fs = r['findings']
    assert len(fs) == 3
    assert fs[0]['no'] == 1
    assert fs[0]['group'] == '복지문화국'
    assert fs[0]['dept_raw'] == '공통'
    assert fs[1]['no'] == 2
    assert fs[1]['dept_raw'] == '복지정책과'
    assert fs[2]['no'] == 1
    assert fs[2]['group'] == '보건소'
    assert fs[2]['dept_raw'] == ''
    names = ' '.join(f['title'] + f['body'] for f in fs)
    assert '홍길동' not in names


def test_bare_group_heading_ends_in_eupche_2025():
    """2025 도시건설 실물 꼴: 「가나시 공공하수처리시설 위탁관리업체」가 헤딩 표시
    없는 맨 줄 묶음 머리로 온다(T10 전량 실행에서 발견, 선언 87 대 파싱 88 불일치의
    원인 — 이 묶음이 묶음으로 안 잡혀 앞 지적(가나도시공사 그룹) 본문에 흡수되고
    다음 지적의 group 이 '가나도시공사'로 잘못 남았었다)."""
    fs = findings.parse_report(MD_2025_WITAK, 2025, '도시건설', 29395)['findings']
    assert len(fs) == 2
    assert fs[0]['group'] == '가나도시공사'
    assert fs[1]['group'] == '가나시 공공하수처리시설 위탁관리업체'
    assert '위탁관리업체' not in fs[0]['body']


def test_declared_total_reads_html_table_row_2019():
    """2018~2022 총무경제 실물 꼴: 총괄 표가 마크다운 파이프 표가 아니라 HTML
    <table> 로 오고, 「계」 행이 rowspan="2" 로 다음 부서 행과 첫 칸이 묶여 있다
    (T10 전량 실행에서 발견 — 이전에는 declared 가 None 으로 나와 2019 총무경제의
    실제 불일치(계 50 대 파싱 51)가 「확인할 것」에 안 잡히고 조용히 넘어갔었다)."""
    md = (
        '<table>\n'
        '<tr><th>구 분</th><th>계</th><th>시정 및 처리요구사항</th><th>비 고</th></tr>\n'
        '<tr><td rowspan="2">계<br>홍보기획관․감사관안전행정국<br>(자원봉사센터,시민프로축구단)</td>'
        '<td>50</td><td>50</td><td></td></tr>\n'
        '<tr><td>16</td><td>16</td><td></td></tr>\n'
        '</table>\n'
    )
    assert findings.declared_total(md) == 50


def test_item_number_directly_followed_by_quote_bracket_2018():
    """2018·2019 총무경제 실물 꼴: 「번호.」 뒤에 공백 없이 낫표(「)가 바로 온다
    (T10 전량 실행에서 발견, 2018 총무경제 선언 62 대 파싱 60 불일치의 원인 —
    이 항목이 공백을 요구하는 ITEM 정규식에 안 걸려 앞 항목 본문에 흡수됐었다).
    날짜 조각처럼 괄호가 뒤따르는 「1.(목)」류는 여전히 항목으로 안 받는다."""
    md = (
        '### 나. 시정 및 처리 요구사항\n\n'
        '《 나래구 》\n\n'
        '1.「사계절 꽃 가로수 길」조성을 위한 노고에 감사드림\n\n'
        '<행정지원과>\n\n'
        '○ 주민과 방문객에게 좋은 반응을 얻고 있음.\n\n'
        '2. 주민자치 프로그램 다양화 <행정지원과, 동 행정복지센터>\n'
        '○ 동마다 프로그램 내용이 비슷하므로 새로운 시도가 필요함.\n\n'
        '출 석 요 구 인\n'
    )
    fs = findings.parse_report(md, 2018, '총무경제', 20559)['findings']
    assert len(fs) == 2
    assert fs[0]['no'] == 1
    assert fs[0]['title'].startswith('「사계절 꽃 가로수')
    assert fs[0]['dept_raw'] == '행정지원과'
    assert fs[1]['no'] == 2
    # 「1.(목)」처럼 괄호가 뒤따르는 날짜 조각은 공백 없는 예외 대상이 아니라 여전히
    # 항목으로 받지 않는다.
    assert findings._item_match('1.(목) 감사 개시') is None


# ── 최종 검토 뒤 고침 (C1) ────────────────────────────────────────────────
# 2025 의회운영(29389) 끝머리 꼴: 「8. 증인(참고인) 출석 현황」 뒤에 HTML 표가 오고
# 표 머리에 「출석공무원」·「성 명」 칸이 있다. 예전 STOP 은 「증인출석현황」(붙여 쓴 꼴)만
# 받아서 이 절을 8번 지적으로 삼고 표 전체를 본문에, 「<table>」을 부서로 넣었다.
TAIL_29389 = (
    '### 나. 시정 및 처리 요구사항\n\n'
    '1. 예산불용 방지 철저 <의회사무처>\n'
    '○ 사업 단계별로 계획을 세워 주시기 바랍니다.\n\n'
    '8. 증인(참고인) 출석 현황\n\n'
    '<table>\n'
    '<tr><th colspan="2">출석공무원</th><th rowspan="2">출석일시</th></tr>\n'
    '<tr><td>직 위</td><td>성 명</td></tr>\n'
    '<tr><td>사무국장</td><td>홍길동</td><td>2025. 11. 27.</td></tr>\n'
    '</table>\n'
)


def test_witness_heading_with_parenthesis_stops():
    fs = findings.parse_report(TAIL_29389, 2025, '의회운영', 29389)['findings']
    assert len(fs) == 1
    assert fs[0]['dept_raw'] == '의회사무처'
    blob = repr(fs)
    assert '홍길동' not in blob and '<t' not in blob and '성 명' not in blob


def test_stops_on_attending_officials_line_or_name_header_cell():
    md = TAIL_29389.replace('8. 증인(참고인) 출석 현황\n', '')
    fs = findings.parse_report(md, 2025, '의회운영', 29389)['findings']
    assert len(fs) == 1 and '홍길동' not in repr(fs)
    md2 = md.replace('<tr><th colspan="2">출석공무원</th><th rowspan="2">출석일시</th></tr>\n', '')
    fs2 = findings.parse_report(md2, 2025, '의회운영', 29389)['findings']
    assert len(fs2) == 1 and '홍길동' not in repr(fs2)
    md3 = '### 나. 시정 및 처리 요구사항\n\n1. 가나다 점검 <총무과>\n○ 본문.\n\n출 석 공 무 원\n홍길동\n'
    assert '홍길동' not in repr(findings.parse_report(md3, 2025, '총무경제', 1)['findings'])


def test_tag_never_accepts_html_tag_names():
    for t in ('<table>', '<tr>', '<td>', '<th>', '<br>', '</table>', '<br/>'):
        assert findings._tag_match('제목 ' + t) is None
        assert findings._tag_fullmatch(t) is None
    assert findings._tag_match('제목 <총무과>').group(1) == '총무과'


def test_html_table_lines_never_enter_title_or_body():
    md = ('### 나. 시정 및 처리 요구사항\n\n1. 가나다 점검 <총무과>\n○ 본문.\n'
          '<table>\n<tr><td>구분</td><td>금액</td></tr>\n</table>\n○ 이어지는 본문.\n')
    f = findings.parse_report(md, 2025, '총무경제', 1)['findings'][0]
    assert '<' not in f['title'] + f['body']
    assert f['body'] == '본문. 이어지는 본문.'


# 2018 도시건설(20556) 꼴: 「시정 및 처리요구사항」이 총괄 표 머리칸에만 있고 따로 된
# 절 제목이 없다. 표 줄은 시작 신호로 안 받으니 전부 0건이 됐다(선언 60 · 파싱 0).
NO_HEADING_2018 = (
    '|구분|계|시정및처리요구사항|건의요구사항|비고|\n'
    '| --- | --- | --- | --- | --- |\n'
    '|계|2|2|0||\n'
    '| 도시주택국 | 2 | 2 |  |  |\n\n'
    '- 1) 도시재생 주민참여 방안 강구 (도시재생과)\n'
    '도시재생 사업을 알리는 방안을 강구하여 주시기 바람\n\n'
    '- 2) 건설현장 민원 대처 당부 (공통)\n'
    '민원해결에 노력하여 주시기 바람\n'
)


def test_falls_back_to_summary_table_when_no_start_heading():
    r = findings.parse_report(NO_HEADING_2018, 2018, '도시건설', 20556)
    assert r['declared'] == 2
    assert [f['no'] for f in r['findings']] == [1, 2]
    assert r['findings'][0]['dept_raw'] == '도시재생과'
    assert '|' not in r['findings'][0]['body']


def test_group_name_strips_stray_brackets_and_joins_split_heading():
    md = ('### 나. 시정 및 처리 요구사항\n\n'
          '### 《가나도시공사, 가나산업진흥원,\n\n'
          '### 가나시민프로축구단》\n\n'
          '1. 가나다 점검 <가나도시공사>\n○ 본문.\n\n'
          '### 〈복지문화국〉》\n\n'
          '2. 라마바 점검 <복지정책과>\n○ 본문.\n')
    fs = findings.parse_report(md, 2025, '총무경제', 1)['findings']
    assert fs[0]['group'] == '가나도시공사, 가나산업진흥원, 가나시민프로축구단'
    assert fs[1]['group'] == '복지문화국'


def test_harvest_names_from_inspection_team_and_witness_tables():
    md = ('4. 감사반 편성\n\n| 감사위원장 | 감사위원 | 보조직원 |\n| --- | --- | --- |\n'
          '| 가나다 | 라마바, 사아자<br>차카타 | 전문위원 파하가<br>속기사나다라 |\n\n'
          '5. 감사일시\n\n### 나. 시정 및 처리 요구사항\n\n1. 점검 <총무과>\n\n'
          '7. 증인출석현황\n<table>\n'
          '<tr><td>부 서</td><td>직 위</td><td>성 명</td></tr>\n'
          '<tr><td>총무과</td><td>총무과장<br>회계과장</td><td>홍길동<br>김철수</td></tr>\n'
          '<tr><td>나래동</td><td>갑동장<br>을동장</td><td>이영희박민수</td></tr>\n'
          '</table>\n')
    names = findings.harvest_names(md)
    assert {'가나다', '라마바', '사아자', '차카타', '파하가', '나다라', '홍길동', '김철수',
            '이영희', '박민수'} <= names
    assert '총무과' not in names and '감사위원' not in names


# ── 의회운영 지적 포함 (사용자 결정, 2026-09-25 — R1 뒤집음) ─────────────────
# 2025 의회운영(29389) 실물 꼴: 항목 번호가 없고 「○」/「- ○」 글머리로만 지적이
# 시작한다. 「가. 총괄」 표는 부서 행이 「의회사무처」 하나뿐이라(계 행 없음) 그
# 이름을 꼬리표 없는 지적의 기본 부서로 쓴다.
def test_uihoeunyeong_circle_items_parsed_with_default_dept():
    r = findings.parse_report(MD_2025_UIHOE, 2025, '의회운영', 29389)
    fs = r['findings']
    assert len(fs) == 7
    assert [f['no'] for f in fs] == [1, 2, 3, 4, 5, 6, 7]
    assert fs[0]['title'] == '본회의장 방청석 안내 체계 정비'
    assert fs[0]['body'].startswith('본회의장을 찾은')
    assert fs[1]['title'] == '예산불용 방지 철저'
    assert fs[5]['title'] == '실효적인 결산검사 개선사항 도출 및 이행 점검'
    assert fs[6]['title'] == '의회소식지 편찬 만전'
    assert all(f['dept_raw'] == '의회사무처' for f in fs)
    assert r['default_dept'] == '의회사무처'
    blob = repr(fs)
    assert '홍길동' not in blob and '<t' not in blob and '성 명' not in blob


def test_uihoeunyeong_numbered_shape_unaffected_by_circle_mode():
    """번호 매기기 항목이 있는 보고서(다른 위원회)는 그대로 numbered 모드를 쓰고,
    항목 본문의 ○ 글머리를 새 지적으로 오인하지 않는다(회귀)."""
    fs = findings.parse_report(MD, 2025, '총무경제', 29391)['findings']
    assert len(fs) == 4


def test_total_table_single_dept_row_gives_default_dept():
    assert findings.default_dept(
        '| 부서별 | 계 | 시정 및 처리 요구사항 | 건의사항 | 비고 |\n'
        '| --- | --- | --- | --- | --- |\n'
        '|의회사무처|7|7|-||\n'
        '### 나. 시정 및 처리 요구사항\n'
    ) == '의회사무처'


def test_total_table_multiple_dept_rows_gives_no_default():
    assert findings.default_dept(
        '| 부서별 | 계 | 시정 및 처리 요구사항 | 건의사항 | 비고 |\n'
        '| --- | --- | --- | --- | --- |\n'
        '|총무과|2|2|-||\n'
        '|회계과|1|1|-||\n'
        '### 나. 시정 및 처리 요구사항\n'
    ) is None


# ── 의회운영 전체 연도 포함 (사용자 결정, 2026-09-25 후속) ───────────────────
# 2018~2021 은 「- ▶」/「#### ▶」/「▸」 글머리에 제목·본문이 줄을 나눠 온다(2025 와
# 같은 여러줄 꼴, 글머리만 다르다). 2022 는 「▸」 글머리에 제목·본문이 한 줄에 붙어
# 온다(예: 「▸ 정책지원관 전문성 강화 방안 강구 정책지원관의 업무를…」).
def test_circle_mode_accepts_dash_and_heading_arrow_markers():
    """2018~2020 실물 꼴: 「- ▶」 나 「#### ▶」 글머리도 ○ 글머리와 똑같이 받되,
    본문이 딴 줄에 있는 제목줄은 그 안에 우연히 낀 낱말(「관리 철저」)로 잘못 갈리지
    않는다(한 줄 쪼개기는 다음 줄에 본문이 없을 때만 쓴다)."""
    md = ('### 나. 시정 및 처리 요구사항\n\n'
          '- ▶ 가나다 계획 수립시 신중을 기해주시기 바람.\n'
          '가나다 상세 설명 첫째줄\n'
          '가나다 상세 설명 둘째줄\n\n'
          '#### ▶ 라마바 기념품 준비 및 사바아 관리 철저\n\n'
          '라마바 상세 설명 첫째줄\n'
          '라마바 상세 설명 둘째줄\n\n'
          '8. 증인(참고인) 출석 현황\n')
    fs = findings.parse_report(md, 2018, '의회운영', 1)['findings']
    assert len(fs) == 2
    assert fs[0]['title'] == '가나다 계획 수립시 신중을 기해주시기 바람.'
    assert fs[0]['body'] == '가나다 상세 설명 첫째줄 가나다 상세 설명 둘째줄'
    # 「관리 철저」가 제목 안에 있어도 한 줄 쪼개기 낱말(「관리」)에 안 걸린다 — 본문이
    # 딴 줄에 실제로 있기 때문
    assert fs[1]['title'] == '라마바 기념품 준비 및 사바아 관리 철저'
    assert fs[1]['body'] == '라마바 상세 설명 첫째줄 라마바 상세 설명 둘째줄'


def test_circle_mode_accepts_bare_triangle_marker_2021_shape():
    """2021 실물 꼴: 글머리가 대시 없이 「▸ 」뿐이고 제목·본문이 딴 줄에 온다."""
    md = ('### 나. 시정 및 처리 요구사항\n\n'
          '▸ 민원 회신 기한 준수\n\n'
          '민원 회신이 늦어지는 사례가 있어 기한을 지켜야 함\n\n'
          '▸ 의정 연수비 불용액 최소화\n\n'
          '의정 연수비 예산이 불용되지 않도록\n\n'
          '8. 증인(참고인) 출석 현황\n')
    fs = findings.parse_report(md, 2021, '의회운영', 1)['findings']
    assert len(fs) == 2
    assert fs[0]['title'] == '민원 회신 기한 준수'
    assert fs[0]['body'] == '민원 회신이 늦어지는 사례가 있어 기한을 지켜야 함'
    assert fs[1]['title'] == '의정 연수비 불용액 최소화'


def test_circle_mode_one_line_title_body_2022_shape_all_real_shapes():
    """2022 실물 8건과 같은 꼴(제목·본문이 한 줄에 붙음)을 가짜 낱말로 검증한다.
    다섯째 줄(MOU)만 본문이 딴 줄에 있다."""
    md = ('### 나. 시정 및 처리 요구사항\n\n'
          '▸ 가나다 전문성 강화 방안 강구 가나다의 업무를 명확히 하여 마 바랍니다.\n'
          '▸ 시민과 소통하는 사아자 제작 자차카 인터넷 생중계에 인력을 증원 바랍니다.\n'
          '▸ 타파하 제작·배부 시 시민 접근성 강화 타파하는 시민들이 쉽게 바랍니다.\n'
          '▸ 하가나 합동세미나 운영방법 개선 하가나 합동세미나 개최 시 장소 바랍니다.\n'
          '▸ MOU체결 시 신중한 검토\n'
          'MOU체결 시 대상기관 선정 및 내용에 신중을 기하시기 바랍니다.\n'
          '▸ 다라마 소프트웨어 정비 바사아에서 사용하는 문서 및 보안 바랍니다.\n'
          '▸ 자차카를 반영한 아자차 세미나 추진 아자차는 요구사항이 반영될 바랍니다.\n'
          '▸ 취지에 맞는 카타파 위원회 운영 윤리 자문위원회 등 취지에 맞게 운영하시기 바 랍니다 . - 5 -\n\n'
          '8. 증인(참고인) 출석 현황\n')
    fs = findings.parse_report(md, 2022, '의회운영', 1)['findings']
    assert len(fs) == 8
    assert fs[0]['title'] == '가나다 전문성 강화 방안 강구'
    assert fs[0]['body'].startswith('가나다의 업무를')
    assert fs[1]['title'] == '시민과 소통하는 사아자 제작'
    assert fs[1]['body'].startswith('자차카 인터넷')
    assert fs[2]['title'] == '타파하 제작·배부 시 시민 접근성 강화'
    assert fs[2]['body'].startswith('타파하는 시민들이')
    assert fs[3]['title'] == '하가나 합동세미나 운영방법 개선'
    assert fs[3]['body'].startswith('하가나 합동세미나')
    # MOU 꼴: 본문이 딴 줄에 있으면 쪼개지 않는다
    assert fs[4]['title'] == 'MOU체결 시 신중한 검토'
    assert fs[4]['body'] == 'MOU체결 시 대상기관 선정 및 내용에 신중을 기하시기 바랍니다.'
    assert fs[5]['title'] == '다라마 소프트웨어 정비'
    assert fs[5]['body'].startswith('바사아에서')
    assert fs[6]['title'] == '자차카를 반영한 아자차 세미나 추진'
    assert fs[6]['body'].startswith('아자차는')
    assert fs[7]['title'] == '취지에 맞는 카타파 위원회 운영'
    # 끝에 붙은 쪽 표시 「- 5 -」가 본문에 남지 않는다
    assert '- 5 -' not in fs[7]['body']
    assert '5' not in fs[7]['body']


def test_split_title_body_unit_cases():
    """_split_title_body 단위 시험: 낱말 쪼개기 · 첫말 되풀이 쪼개기 · 못 찾으면 통짜."""
    assert findings._split_title_body('가나다 강구 나머지 본문') == ('가나다 강구', '나머지 본문')
    # 낱말 뒤에 공백이 없으면(붙어 쓴 말) 쪼개지 않는다
    t, b = findings._split_title_body('가나다 강구시 나머지 본문')
    assert t == '가나다 강구시 나머지 본문' and b == ''
    # 첫말이 되풀이되면 그 자리에서 가른다(꼬리 낱말이 하나도 없을 때의 마지막 수)
    assert findings._split_title_body('가나다 마아바 가나다 사아자') == ('가나다 마아바', '가나다 사아자')
    # 아무 실마리도 없으면 통짜 제목, 빈 본문
    assert findings._split_title_body('가나다 마아바 사아자') == ('가나다 마아바 사아자', '')


# ── declared_total: 총괄 표에 「계」 행이 없고 부서 행이 하나뿐일 때 ──────────
def test_declared_total_single_dept_row_no_gye_row():
    assert findings.declared_total(
        '| 부서별 | 계 | 시정 및 처리 요구사항 | 건의사항 | 비고 |\n'
        '| --- | --- | --- | --- | --- |\n'
        '|의회사무처|8|8|-||\n'
        '### 나. 시정 및 처리 요구사항\n'
    ) == 8
    assert findings.declared_total(
        '| 부서별 | 계 | 시정 및 처리 요구사항 | 건의사항 | 비고 |\n'
        '| --- | --- | --- | --- | --- |\n'
        '| 의회사무처 | 11 | 11 | - |  |\n'
        '### 나. 시정 및 처리 요구사항\n'
    ) == 11
    assert findings.default_dept(MD) is None


# ── Task 0: parse_report 가 numbered/circle 모드를 밝힌다 ─────────────────
def test_parse_report_mode_is_numbered_when_items_are_numbered():
    r = findings.parse_report(MD, 2025, '총무경제', 29391)
    assert r['mode'] == 'numbered'


def test_parse_report_mode_is_circle_when_no_numbered_items():
    md = '### 나. 시정 및 처리 요구사항\n\n○ 가나다 점검\n본문\n'
    r = findings.parse_report(md, 2025, '총무경제', 1)
    assert r['mode'] == 'circle'
    assert r['findings'][0]['title'] == '가나다 점검'


def test_witness_words_in_body_do_not_stop_parsing():
    """2025 보사환경(29393) 5번 지적 본문에 「증인 출석을 요구한 건」이 있다. 증인 절
    제목(「…출석 현황」)만 멈춤 신호여야 한다(느슨한 꼴은 64건을 4건으로 잘랐다)."""
    md = ('### 나. 시정 및 처리 요구사항\n\n1. 가나다 유감 <문화관광과>\n'
          '○ 증인 출석을 요구한 건에 대하여 불출석 통보함.\n\n2. 라마바 점검 <체육과>\n○ 본문.\n')
    assert len(findings.parse_report(md, 2025, '보사환경', 1)['findings']) == 2


# ── Task 4f: 묶음 머리가 없으면 번호가 다시 도는 자리로 총괄 표 차례대로 묶음을 붙인다 ─────
RESTART_MD = ('| 구분 | 계 | 시정및처리요구사항 |\n| --- | --- | --- |\n| 계 | 5 | 5 |\n'
              '| 도시주택국 | 2 | 2 |\n| 가람구청 및 동 | 2 | 2 |\n| 나래구청 및 동 | 1 | 1 |\n\n'
              '- 1) 가 점검 (주택과)\n본문.\n- 2) 나 점검 (도시계획과)\n본문.\n'
              '- 1) 다 점검 (건설과)\n본문.\n- 2) 라 점검 (민원봉사과)\n본문.\n'
              '- 1) 마 점검 (건설과)\n본문.\n')


def test_groups_from_numbering_restarts_follow_summary_table():
    fs = findings.parse_report(RESTART_MD, 2018, '도시건설', 1)['findings']
    assert [f['group'] for f in fs] == ['도시주택국', '도시주택국', '가람구청 및 동', '가람구청 및 동', '나래구청 및 동']


def test_groups_from_restarts_left_alone_when_counts_disagree():
    md = RESTART_MD.replace('| 나래구청 및 동 | 1 | 1 |\n', '')     # 토막 셋, 표 행 둘
    assert all(f['group'] == '' for f in findings.parse_report(md, 2018, '도시건설', 1)['findings'])
    md = RESTART_MD.replace('| 가람구청 및 동 | 2 | 2 |', '| 가람구청 및 동 | 1 | 1 |')   # 토막이 표 수보다 많다
    assert all(f['group'] == '' for f in findings.parse_report(md, 2018, '도시건설', 1)['findings'])
