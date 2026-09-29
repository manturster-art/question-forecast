from pathlib import Path
from dcc import qna

MD = (Path(__file__).parent / 'fixtures' / 'qna_report.md').read_text(encoding='utf-8')


def test_questions_and_commitments():
    ps = qna.parse_report(MD, 309, '2026-03-09', 29229)
    assert [p['question'] for p in ps] == [
        '2022년, 2026년 가나시 예산 규모 및 세입 구조 변화는?',
        '세출 구조의 건전성 운영 현황과 개선을 위한 시의 노력은?',
        '청년정책실무위원회 재가동 계획은?']
    assert ps[0]['topic'] == ps[1]['topic'] == '가나시 건전재정과 관련하여'
    assert ps[0]['commitments'] == []
    assert ps[1]['commitments'] == ['앞으로도 예산부서와 지출부서가 협조하여 재정운용의 건전성 확보를 위해 만전을 기하도록 하겠음.']
    assert ps[2]['commitments'] == ['하반기 중 청년정책실무위원회를 재구성하여 운영할 계획임.']
    assert ps[1]['id'] == 'P309-01-01-02'


# Task 2 고침: 질문 문장이 <br> 로 줄바꿈되고 뒷줄이 답변 글머리로 시작하지 않으면 같은
# 질문이다(F291-291-01-03 실물 꼴 재현 — 「…차카타<br>시장의 견해는?」에서 뒷줄 「시장의
# 견해는?」이 통째로 사라져 질문이 이름에서 뚝 끊긴 채 남던 것을 실제 산출물 누출 검사로
# 확인. 실제 이름은 여기 적지 않는다).
WRAPPED_QUESTION_MD = (
    '<table>\n'
    '<tr><th>질문의원</th><th>가나다의원</th><th>소 속</th><th>기획행정위원회</th></tr>\n'
    '<tr><td>질문방식</td><td>일문일답</td><td>답변자</td><td>시 장</td></tr>\n'
    '<tr><td colspan="4">1-3) 학교체육시설의 개방에 대한 사아자<br>구청장의 견해는?'
    '<br>○ 가나시는 지속적으로 노력하고 있음.'
    '<br>○ 협의하여 만전을 기하도록 하겠음.</td></tr>\n'
    '</table>\n')


def test_question_line_wrapped_across_br_is_not_truncated():
    ps = qna.parse_report(WRAPPED_QUESTION_MD, 291, '2024-03-18', 25356)
    assert ps[0]['question'] == '학교체육시설의 개방에 대한 사아자 구청장의 견해는?'
    assert ps[0]['commitments'] == ['협의하여 만전을 기하도록 하겠음.']


# 1차 고침(컨트롤러 지시 e, 리뷰에서 지적): 질문이 물음표로 이미 끝난 뒤에 글머리(○▸ 등)
# 없이 온 답변 줄까지 예전 규칙대로면 질문에 먹혀 약속 문장을 잃을 수 있었다. 물음표로
# 끝난 순간 그 질문은 완결이므로, 뒤이은 글머리 없는 줄은 본문(약속 후보)으로 본다.
UNBULLETED_ANSWER_MD = (
    '<table>\n'
    '<tr><th>질문의원</th><th>가나다의원</th><th>소 속</th><th>기획행정위원회</th></tr>\n'
    '<tr><td>질문방식</td><td>일문일답</td><td>답변자</td><td>시 장</td></tr>\n'
    '<tr><td colspan="4">1-1) 청년정책실무위원회 재가동 계획은?'
    '<br>하반기 중 청년정책실무위원회를 재구성하여 운영할 계획임.</td></tr>\n'
    '</table>\n')


def test_unbulleted_answer_line_after_a_complete_question_is_not_absorbed():
    ps = qna.parse_report(UNBULLETED_ANSWER_MD, 291, '2024-03-18', 25356)
    assert ps[0]['question'] == '청년정책실무위원회 재가동 계획은?'
    assert ps[0]['commitments'] == ['하반기 중 청년정책실무위원회를 재구성하여 운영할 계획임.']


# Task 3 고침: 글머리 벗기기가 BULLET 보다 좁은 집합만 써서 「❍」(U+274D) 로 시작하는
# 답변은 글머리가 안 벗겨진 채 commitments 에 남았다.
CIRCLE_JAM_ANSWER_MD = (
    '<table>\n'
    '<tr><th>질문의원</th><th>가나다의원</th><th>소 속</th><th>기획행정위원회</th></tr>\n'
    '<tr><td>질문방식</td><td>일문일답</td><td>답변자</td><td>시 장</td></tr>\n'
    '<tr><td colspan="4">1-1) 청년정책실무위원회 재가동 계획은?'
    '<br>❍ 하반기 중 청년정책실무위원회를 재구성하여 운영할 계획임.</td></tr>\n'
    '</table>\n')


def test_circle_jam_bullet_is_stripped_from_commitment():
    ps = qna.parse_report(CIRCLE_JAM_ANSWER_MD, 291, '2024-03-18', 25356)
    assert ps[0]['commitments'] == ['하반기 중 청년정책실무위원회를 재구성하여 운영할 계획임.']


def test_no_commitment_starts_with_a_bullet_char():
    for md_name in ('qna_report.md', 'qna_report_two_askers.md'):
        md = (Path(__file__).parent / 'fixtures' / md_name).read_text(encoding='utf-8')
        ps = qna.parse_report(md, 309, '2026-03-09', 29229)
        for p in ps:
            for c in p['commitments']:
                assert not qna.BULLET.match(c), c


def test_no_names_anywhere():
    ps = qna.parse_report(MD, 309, '2026-03-09', 29229)
    assert '가나다' not in repr(ps)
    assert all(set(p) == {'id', 'session', 'date', 'topic', 'question', 'commitments', 'uid'} for p in ps)


TWO_ASKERS = (Path(__file__).parent / 'fixtures' / 'qna_report_two_askers.md').read_text(encoding='utf-8')


def test_id_includes_questioner_ordinal_and_stays_unique():
    ps = qna.parse_report(TWO_ASKERS, 309, '2026-03-09', 29229)
    ids = [p['id'] for p in ps]
    assert len(ids) == len(set(ids))
    assert ids[0] == 'P309-01-01-01'
    second_asker_first = next(p for p in ps if p['topic'] == '둘째 주제와 관련하여')
    assert second_asker_first['id'] == 'P309-02-01-01'
    assert '가나다' not in repr(ps)
    assert '라마바' not in repr(ps)


def test_guess_dept_by_project_words():
    words = {'청년정책관': {'청년정책', '청년', '네트워크'}, '예산법무과': {'예산', '편성', '세출'}}
    assert qna.guess_dept('청년정책실무위원회 재가동 계획은?', words) == ('청년정책관', ['청년정책'])
    d, basis = qna.guess_dept('세출 구조의 건전성 예산 편성', words)
    assert d == '예산법무과' and set(basis) >= {'예산', '세출'}
    assert qna.guess_dept('날씨가 좋다', words) == ('미상', [])


def test_generic_words_are_not_dept_evidence():
    """최종 검토 뒤 고침(R5): 「지원」「주택」「관리」 같은 두루 쓰는 낱말이 부분 일치로
    긴 사업명(「장애인가족지원센터」)을 끌어와 부서 근거가 되던 것을 막는다."""
    words = {'장애인복지과': {'장애인가족지원센터', '장애인'}, '주택과': {'주택', '공동주택관리'}}
    assert qna.guess_dept('지원 방안 검토 처리', words) == ('미상', [])
    assert qna.guess_dept('주택 관리 계획 추진 운영 사업', words) == ('미상', [])
    d, basis = qna.guess_dept('장애인 가족 쉼터', words)
    assert d == '장애인복지과' or d == '미상'
    rows = [{"year": 2025, "dept": "주택과", "project": "주택 관리 지원 사업"}]
    assert not ({'주택', '관리', '지원', '사업'} & qna.project_words(rows)['주택과'])
