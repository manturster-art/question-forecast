# 역할: 시정질문 답변요지서에서 질문과 「하겠음」류 약속 문장을 뽑고, 약속이 어느 부서 몫인지 추정한다.
#
# 문서 꼴 (제309회 임시회로 확인)
#   표마다 머리 두 줄: 질문의원·소속 / 질문방식·답변자   → 이름은 읽고 버린다
#   본문 칸: 「1. 주제」, 「1-1) 질문」, 「○ 답변 …」 이 <br> 로 이어진다
#   수치 표 줄(칸이 여럿)은 약속이 아니므로 건너뛴다
# 답변자가 거의 늘 「시 장」이라 부서가 적혀 있지 않다. 그래서 부서는 추정이다.
#   질문·약속 문장의 낱말이 어느 부서의 사업명·부서명 낱말과 가장 많이 겹치는지로 고르고,
#   겹친 낱말을 근거로 함께 넘긴다. 둘 미만이거나 1·2등이 같으면 「미상」.
#
# id 꼴: 답변요지서 한 편 안에서 의원마다 주제·질문 번호가 1부터 다시 시작돼
#   session-topic-question 만으로는 id 가 겹친다(제309회 실측: 32문항 중 유일 16개).
#   그래서 문서 안 질문자 순번(q, 1부터)을 더 앞에 끼운다. 「질문의원」 머리행 값이
#   앞 표와 달라지면 순번을 올린다 — 이 값 자체(이름)는 비교 한 번에만 쓰고
#   변수에도 출력에도 남기지 않는다. 이름을 들고 있는 변수는 이 함수 밖으로 나가지 않는다.
import re
from collections import defaultdict

from dcc import region

ROW = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
CELL = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.S)
TOPIC = re.compile(r'^(\d+)\.\s*(.+)$')
QUESTION = re.compile(r'^(\d+)-(\d+)\)\s*(.+)$')
PROMISE = re.compile(r'(하겠음|하겠습니다|할\s*계획임|할\s*예정임|추진\s*예정|검토\s*예정|노력하겠|만전을\s*기하겠)\.?$')
ASKER_LABEL = '질문의원'
HEAD = re.compile(r'질문의원|질문방식')
# Task 2 고침: 질문 문장이 원문에서 <br> 로 줄바꿈되면(예: 「…차카타<br>시장의 견해는?」,
# 이름은 가짜로 재현) 뒷줄이 답변 글머리(○▸ 등)로 시작하지 않는 한 아직 같은 질문이다.
# 예전엔 이 뒷줄을 「약속 문장이 아니면 버림」 규칙에 걸려 통째로 잃어, 질문이 이름에서
# 뚝 끊긴 채(뒤따르던 직함이 사라져) 이름 가림 규칙(이름+직함)을 피해가는 채로 남았다
# (F291-… 답변요지서에서 확인: 실제 산출물 누출 검사로 드러남).
#
# 1차 고침(컨트롤러 지시 e, 리뷰에서 지적): 처음엔 「글머리로 시작 안 하면 무조건 이어붙임」
# 이라 질문이 물음표로 이미 끝난 뒤에도(완결된 문장 뒤에) 글머리 없는 답변 줄이 오면
# 그 줄까지 질문에 먹혀 약속 문장을 잃을 위험이 있었다. 이제 이어붙이는 조건에 「아직
# 물음표(?/？)로 끝나지 않았다」를 더한다 — 물음표로 끝난 순간 그 질문은 완결이다.
# 표 한 줄(<tr>)이 바뀌거나 새 「N. 주제」 줄을 만나도 이어붙이던 질문은 끝난 것으로 본다
# (표·주제 경계를 넘어 이어붙이는 것은 애초에 대상이 아니었다).
#
# 61개 캐시 답변요지서로 다시 재어 보니(컨트롤러 지시 e) 「❍」(U+274D, 「○」와 다른
# 글자)로 시작하는 답변 글머리를 못 알아채 물음표 없는 긴 답변 문단이 통째로 질문에
# 먹혀 약속을 잃는 문서가 하나 있었다(26414.md, main 대비 -5). 실사용 글머리 글자를
# 넓혀 담는다(○ 계열이 여럿이라 ‣▸ 계와 점 계까지).
BULLET = re.compile(r'^[○◯❍•‣▸▶□◦∙⦁∘·ㆍ\-]')
# Task 2 검토 뒤 고침(Task 3): 약속 문장 앞머리를 벗기는 정규식이 BULLET 보다 좁은
# 글머리 목록(○▸□◦·-)만 썼다. 「❍」(U+274D) 등 BULLET 이 이미 넓혀 둔 글자로 시작하는
# 답변이면 글머리가 안 벗겨진 채 commitments 에 남았다. BULLET 과 같은 글자 집합을 쓴다.
STRIP_BULLET = re.compile(r'^[○◯❍•‣▸▶□◦∙⦁∘·ㆍ\-]\s*')
QUESTION_END = ('?', '？')
_STOPW_BASE = set('관련하여 대한 계획은 현황과 위한 시의 노력은 어떻게 있는지 방안은 대책은 우리 '
            '추진 운영 계획 현황 사업'.split())
# 최종 검토 뒤 고침(R5): 어느 부서에나 나오는 낱말. 질문 쪽에서도 사업명 쪽에서도,
# 부서 이름 줄기(「주택과」→「주택」)에서도 뺀다 — 부분 일치로 긴 사업명을 끌어와
# 근거처럼 보이던 것(「지원」→「장애인가족지원센터」)을 막는다.
_GENERIC_BASE = set('검토 처리 검사 배출 주택 방향 추진 운영 관리 계획 사업 지원 조성 설치 수립 시설 '
              '지역 구축 개발 강화 용역 개선 확대 마련 대책 방안 현황 필요 예정 관련 관련자 '
              '공사 시민 주민 문제 부분 업무 대상 기관 부서 사항 추가 증진 정비 '
              '점검 확보 활성화 활용 도입 실시 진행 보수 교체 구입 일반 기타'.split())


# 지자체명(「○○시」)·약칭(「○○」)은 config/region.json 에서 더한다. region.json 을 바꾸면
# 프로세스를 다시 시작하거나 region.refresh() 를 부른다.
@region.on_refresh
def _build_region():
    global STOPW, GENERIC
    r = region.load()
    GENERIC = _GENERIC_BASE | {r['약칭']}
    STOPW = _STOPW_BASE | {r['지자체명']} | GENERIC


_build_region()


def _asker_marker(row, cells):
    """머리행이면 「질문의원」 다음 칸(이름)을 돌려주고, 아니면 None.

    이름 자체는 여기서만 만들어졌다가 호출한 쪽에서 앞 표 값과 같은지만 보고 버려진다.
    """
    if ASKER_LABEL not in row:
        return None
    texts = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
    for i, t in enumerate(texts):
        if ASKER_LABEL in t and i + 1 < len(texts):
            return texts[i + 1]
    return None


def parse_report(md, session, date, uid):
    out, topic, cur, in_question = [], '', None, False
    q_ord, _prev_asker = 0, None  # _prev_asker 는 표 하나 넘어갈 때까지만 살아 있다
    for row in ROW.findall(md):
        in_question = False  # 표 한 줄이 바뀌면 이어붙이던 질문은 끝난 것으로 본다
        cells = CELL.findall(row)
        asker = _asker_marker(row, cells)
        if asker is not None:
            if asker != _prev_asker:
                q_ord += 1
            _prev_asker = asker
            del asker
            continue
        if len(cells) != 1 or HEAD.search(row):
            continue
        for part in re.split(r'<br\s*/?>', cells[0]):
            s = re.sub(r'<[^>]+>', '', part).strip()
            if not s:
                continue
            m = TOPIC.match(s)
            if m and not QUESTION.match(s):
                topic = m.group(2).strip()
                in_question = False  # 새 주제로 넘어가면 이어붙이던 질문은 끝난 것으로 본다
                continue
            q = QUESTION.match(s)
            if q:
                qtext = q.group(3).strip()
                cur = {"id": f'P{session}-{q_ord:02d}-{int(q.group(1)):02d}-{int(q.group(2)):02d}',
                       "session": session, "date": date, "topic": topic,
                       "question": qtext, "commitments": [], "uid": uid}
                out.append(cur)
                in_question = not qtext.endswith(QUESTION_END)
                continue
            if cur is None:
                continue
            if in_question and not BULLET.match(s):
                cur['question'] += ' ' + s
                in_question = not cur['question'].endswith(QUESTION_END)
                continue
            in_question = False
            body = STRIP_BULLET.sub('', s)
            if PROMISE.search(body):
                cur['commitments'].append(body)
    return out


def _words(text):
    return {w for w in re.findall(r'[가-힣]{2,}', text) if w not in STOPW}


def project_words(rows, recent=3):
    last = max((r['year'] for r in rows), default=0)
    out = defaultdict(set)
    from dcc import depts
    for r in rows:
        if r['year'] > last - recent:
            d = depts.normalize(r['dept'])
            out[d] |= _words(r['project'])
    for d in list(out):
        out[d] |= _words(re.sub(r'(과|관|실|국|소|센터)$', '', d)) | {re.sub(r'(과|관|실|국)$', '', d)}
        out[d] -= GENERIC
    return dict(out)


def guess_dept(text, words):
    tw = _words(text)
    scored = []
    for d, ws in words.items():
        cand = [w for w in ws - GENERIC if any(w in t or t in w for t in tw) and len(w) >= 2]
        # 짧은 낱말이 같은 부서의 더 긴 낱말에 포함되면(「청년」⊂「청년정책」) 짧은 쪽은 버린다.
        hit = sorted(w for w in cand if not any(w != o and w in o for o in cand))
        if hit:
            scored.append((len(hit), d, hit))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if not scored:
        return '미상', []
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return '미상', []
    n, d, hit = scored[0]
    if n < 2 and not any(len(h) >= 4 for h in hit):
        return '미상', []
    return d, hit
