# 역할: 의회 누리집 「행정사무감사 결과보고서」 PDF 의 kordoc 마크다운에서 지적을 뽑는다.
#
# 문서 꼴 (2025 총무경제위원회로 확인)
#   4. 감사반 편성 → 의원 실명 표.   읽지 않는다
#   가. 총괄       → 「계」 줄에 지적 수. 파싱 검산에 쓴다
#   나. 시정 및 처리요구사항 → 여기서부터만 읽는다
#     ### 《부서 묶음》
#     N. 제목이 한두 줄에 걸치고 <부서> 꼬리표가 제목 끝이나 다음 줄에 온다
#     ○ 본문 …
#   끝의 출석요구인 명단 → 공무원 실명.  「출석」이 나오면 읽기를 멈춘다
#
# 앞선 점검 도구(비공개) parse_list 는 「N. 제목 <부서>」가 한 줄일 때만 받았다. 누리집 PDF 는
# 줄이 갈려 있어 여기서는 꼬리표가 나올 때까지 제목을 이어 붙인다.
# 꼬리표가 끝내 없는 지적이 있다(2025 총무경제 16번). 부서를 짐작하지 않고 비워 둔다.
#
# 옛 연도 꼴 (2018~2023 보사환경·도시건설 등으로 확인, Task 4 fix round 1)
#   부서 꼬리표가 <…> 대신 (…)로 온다 — 「(문화관광과)」, 「(공통)」.
#   묶음 머리가 《…》 없이 맨 마크다운 헤딩(### 복지문화국)으로 온다.
#   본문 글머리표가 ○ 대신 ▸ 이고 뒤에 공백이 없기도 하다.
#
# 옛 연도 꼴, 이어서 (Task 4 fix round 2)
#   최초 묶음 하나만 ### 헤딩이고 그 뒤 묶음은 헤딩 표시 없는 맨 줄이다(「도로교통환경국」
#   처럼). 짧고, 항목·글머리·꼬리표 줄이 아니고, 문장 종결이 없고, 숫자가 있어도
#   「N개동」 꼴뿐이며, 기관류 접미(국·실·관·사업소…)로 끝나거나 「OO구 및 N개동」
#   꼴이면 묶음 머리로 본다 — 2023 보사환경·2020 도시건설 실물 전체를 이 규칙으로
#   훑어 오탐이 없음을 확인했다.
#   소괄호 꼬리표는 <…>와 달리 남용된다 — 「(2020년 기준)」처럼 부서가 아닌 괄호도
#   많다. 부서 접미로 끝나거나 흔한 공통 표현(「공통」「전 부서」 등)일 때만 받는다.
#
# 옛 연도 꼴, 이어서 (Task 4 fix round 3)
#   「OO구 및 N개동」이 쉼표로 여러 개 이어 붙으면(2023 보사환경 304행 「가람구 및
#   14개동, 나래구 및 17개동」, 22자) 20자 상한을 넘는다. 이 꼴만은 길이 상한과
#   무관하게 통째로 받는다(다른 헤딩 없는 맨 줄 규칙은 20자 상한을 그대로 둔다).
import re

from dcc import region

START = re.compile(r'(시정\s*및\s*처리\s*요구\s*사항|건의\s*사항)')
# 최종 검토 뒤 고침(C1): 「8. 증인(참고인) 출석 현황」(괄호가 끼어 예전 꼴에 안 걸렸다)과
# 「출석공무원」 표 머리, 그리고 머리말 없이 「성 명」 칸이 든 표 줄에서도 멈춘다.
# 브리프의 「증\s*인.{0,10}출\s*석」은 2025 보사환경 5번 지적 본문(「증인 출석을 요구한
# 건」)에서 멈춰 64건을 4건으로 잘랐다. 절 제목 끝말 「현황」까지 요구한다.
STOP = re.compile(r'출\s*석\s*요\s*구|감\s*사\s*반\s*편\s*성|증\s*인.{0,10}출\s*석\s*현\s*황'
                  r'|출\s*석\s*공\s*무\s*원|<t[dh][^>]*>\s*성\s*명\s*</t[dh]>')
# 결과보고서 본문 안 HTML 표 줄(표 머리·자료 표)은 지적 글에 넣지 않는다.
HTML_LINE = re.compile(r'^</?(table|thead|tbody|tr|td|th)\b', re.I)
# 묶음 머리는 《…》(# 유무 상관없이) 또는 맨 마크다운 헤딩(#…#)만 받는다.
# <…> 까지 받으면 한 줄짜리 부서 꼬리표 「<전 부서>」를 묶음으로 오인한다.
GROUP_BRACKET = re.compile(r'^#*\s*《\s*(.+?)\s*》\s*$')
GROUP_HEADING = re.compile(r'^#{1,6}\s*(.+?)\s*$')
# 「가.」「나.」「다.」 같은 절 표지는 헤딩으로 와도 묶음이 아니다(「가. 총괄」 등).
SECTION_LABEL = re.compile(r'^[가-힣]\.\s')
# 의회운영위원회 결과보고서 꼴(2025 29389 로 확인, 사용자 결정 2026-09-25 — R1 뒤집음):
# 항목 번호가 아예 없고 「○」 또는 「- ○」(대시+공백 있어도 없어도) 글머리로만 지적이
# 시작한다. 본문은 다음 ○ 글머리 줄이나 절 끝(STOP)까지 이어지며 글머리 없는 맨 글로
# 온다. 번호 매기기 항목이 있는 다른 위원회 문서에는 적용하지 않는다(_has_numbered_items).
#
# 2026-09-25 후속(전 연도 포함): 옛 의회운영 연도는 글머리가 ○ 말고도 「▶」(2018~2020,
# 「- ▶」 또는 헤딩 「#### ▶」)·「▸」(2021 은 대시 없이 맨 글머리, 여러 줄 꼴 — 2022 는
# 같은 「▸」 인데 제목·본문이 한 줄에 붙는다)로도 온다. 마커 글자 앞에 「- 」나 헤딩
# 기호(#…#)가 있어도 없어도 받는다.
CIRCLE_MARK = re.compile(r'^(?:-\s*|#{1,6}\s*)?[○▶▸]\s*(.*)$')
# 쪽 넘김 표시(「- 5 -」류)가 한 줄 지적의 본문 끝에 그대로 붙어 온다(2022 8번). 본문
# 어디에 있든(줄 끝) 뗀다.
PAGE_MARK = re.compile(r'\s*-+\s*\d{1,4}\s*-+\s*$')
# 2022 의회운영 실물 꼴: 글머리 뒤에 제목과 본문이 한 줄에 그대로 붙어 온다(다음 줄이
# 바로 다음 지적이거나 STOP 이라 이 지적엔 딴 줄 본문이 없다 — _parse_circle 이 본문을
# 못 찾았을 때만 이 쪼개기를 쓴다). 제목이 끝나는 낱말 뒤 첫 공백에서 가른다.
_TITLE_END_WORDS = ('강구', '제작', '강화', '개선', '검토', '정비', '추진', '운영', '철저',
                     '마련', '수립', '관리', '방안', '필요', '조정', '확대', '재검토')
_TITLE_END_PATTERNS = tuple(re.escape(w) for w in _TITLE_END_WORDS) + (
    r'기해주시기\s*바람\.?', r'바랍니다\.?', r'바람\.?')


def _split_title_body(s):
    """제목·본문이 한 줄에 붙어 오는 꼴을 가른다. 낱말 목록을 우선순위 차례로 하나씩
    찾아(줄 안에서 더 먼저 나오는 다른 낱말이 있어도 목록 순서를 따른다 — 「강화」가
    먼저 나와도 「강구」가 목록에서 앞이면 「강구」에서 가른다) 그 낱말 뒤 첫 공백에서
    가른다. 하나도 못 찾으면 첫말이 되풀이되는 자리에서 가르고, 그마저 없으면(50자
    안에서) 줄 전체를 제목으로 삼고 본문은 빈 채로 둔다."""
    head = s[:50]
    for pat in _TITLE_END_PATTERNS:
        m = re.search(pat + r'\s', head)
        if m:
            cut = m.end()
            return s[:cut].strip(), s[cut:].strip()
    first = s.split(' ', 1)[0] if s.strip() else ''
    if first:
        idx = s.find(first, len(first))
        if 0 < idx <= 50:
            return s[:idx].strip(), s[idx:].strip()
    return s, ''
ITEM = re.compile(r'^(\d{1,3})\.(?:\s+|(?=「))(.*)$')
# 「번호.」 뒤에 공백 없이 바로 낫표(「)가 오는 항목이 있다(T10 전량 실행에서 발견,
# 2018 총무경제·2019 총무경제 실물, 예: 「14.「체납자 실태조사반」…」). 공백을
# 요구하면 이 항목이 통째로 앞 항목 본문에 흡수된다. 숫자만 이어지는 날짜 조각
# (예: 「1.(목)」)은 다음 글자가 낫표가 아니라 괄호라 여전히 안 받는다.
# 2018·2019 도시건설·보사환경 실물 꼴(T10 전량 실행에서 발견): 항목 번호가 「1.」이
# 아니라 「- 1)」(대시+숫자+닫는 괄호)로 온다. 같은 문서 안에서도 쪽 넘김 등으로
# 대시가 빠진 「1)」 단독 꼴이 섞여 나온다(2019 도시건설 나래구 그룹 13·14번,
# 도시공사 그룹 전체에서 확인) — 둘 다 받는다.
ITEM_DASH = re.compile(r'^-?\s*(\d{1,3})\)\s+(.*)$')
# 2018 보사환경 실물 꼴: 항목 번호가 원문자(①~⑳)이고 그룹마다 1부터 다시 돈다.
_CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
ITEM_CIRCLED = re.compile(r'^-\s*([' + _CIRCLED + r'])\s+(.*)$')
TAG = re.compile(r'\s*[<〈《]\s*([^<>〈〉《》]{2,40}?)\s*[>〉》]\s*$')
# 옛 연도는 부서 꼬리표가 소괄호로 온다: 「(문화관광과)」, 「(공통)」.
PTAG = re.compile(r'\s*\(\s*([^()]{2,40}?)\s*\)\s*$')
BULLET = re.compile(r'^[○◦ㅇ·\-▸]\s*')

# 헤딩 표시 없는 맨 줄 묶음 머리(「도로교통환경국」류)를 거르는 규칙.
BARE_GROUP_ENDING = re.compile(r'(바랍니다|바람|다\.|함|음)\.?\s*$')
BARE_GROUP_NGAEDONG = re.compile(r'\d+\s*개\s*동')
BARE_GROUP_SUFFIX = ('국', '실', '관', '사업소', '보건소', '학습원', '기관', '공사', '재단', '센터', '동', '구청', '업체')
# 「가람구 및 14개동」류는 「, 나래구 및 17개동」처럼 이어 붙어 20자를 넘기도 한다
# (2023 보사환경 304행, 22자) — 길이 상한과 무관하게 통째로 받는다.
# 구 이름은 config/region.json. region.json 을 바꾸면 프로세스를 다시 시작하거나 region.refresh() 를 부른다.
@region.on_refresh
def _build_region():
    global _DONG_UNIT, BARE_GROUP_DONG_LIST
    _DONG_UNIT = rf'(?:{region.gu_alt()})구\s*및\s*\d+\s*개\s*동'
    BARE_GROUP_DONG_LIST = re.compile(rf'^{_DONG_UNIT}(?:[,·및\s]+{_DONG_UNIT})*$')


_build_region()

# 소괄호 꼬리표는 <…>와 달리 남용된다. 부서로 보이는 꼴일 때만 받는다.
DEPT_SUFFIXES = ('과', '관', '실', '국', '단', '원', '소', '센터', '공사', '재단', '사업소', '도서관', '보건소', '축구단', '동')
COMMON_DEPT_TAGS = ('공통', '전 부서', '전부서', '각 부서', '각 동', '전 동', '해당 부서', '소관 부서', '관련 부서')
DEPT_LIKE_ENDINGS = DEPT_SUFFIXES + COMMON_DEPT_TAGS


def _clean_group(name):
    """묶음 이름에 남은 겹꺾쇠·홑꺾쇠(《》〈〉)를 떼고 공백을 고른다."""
    return re.sub(r'\s+', ' ', re.sub(r'[《》〈〉]', '', name)).strip()


def _group_name(s):
    """묶음 머리 줄이면 부서(묶음) 이름을, 아니면 None 을 돌려준다."""
    b = GROUP_BRACKET.match(s)
    if b:
        return b.group(1).strip()
    h = GROUP_HEADING.match(s)
    if not h:
        return None
    inner = h.group(1).strip()
    if not inner or SECTION_LABEL.match(inner) or _item_match(inner) or '≪' in inner or '≫' in inner:
        return None
    return inner


def _bare_group_name(s):
    """헤딩 표시 없는 맨 줄이 묶음 머리로 보이면 그 이름을, 아니면 None 을 돌려준다."""
    if not s:
        return None
    # 「OO구 및 N개동」이 쉼표 등으로 이어 붙은 꼴은 길이 상한 없이 통째로 받는다.
    if BARE_GROUP_DONG_LIST.match(s):
        return s
    if len(s) > 20:
        return None
    if _item_match(s) or BULLET.match(s) or TAG.fullmatch(s) or PTAG.fullmatch(s):
        return None
    if BARE_GROUP_ENDING.search(s):
        return None
    if re.search(r'\d', BARE_GROUP_NGAEDONG.sub('', s)):
        return None
    if s.endswith(BARE_GROUP_SUFFIX):
        return s
    return None


def _dept_like(s):
    s = s.strip()
    return bool(s) and s.endswith(DEPT_LIKE_ENDINGS)


def _looks_like_dept(s):
    """소괄호 꼬리표 속 글이 부서(묶음)로 보이는지 본다. 통짜로 접미가 맞으면 받고,
    아니면 쉼표·가운뎃점으로 나눈 각 조각이 다 부서꼴일 때만 받는다(「(2020년 기준)」
    같은 비-부서 괄호를 걸러낸다)."""
    s = s.strip()
    if _dept_like(s):
        return True
    parts = [p for p in re.split(r'[,·]\s*', s) if p.strip()]
    return len(parts) > 1 and all(_dept_like(p) for p in parts)


def _hangul_tag(t):
    """꺾쇠 꼬리표 속에 한글이 있어야 부서다. 「<table>」「<br>」 같은 HTML 태그 이름을
    부서로 받던 것(2025 의회운영 dept 가 table 로 나왔다)을 막는다."""
    return t if t and re.search(r'[가-힣]', t.group(1)) else None


def _tag_match(s):
    """줄 끝의 <부서>/(부서) 꼬리표를 찾는다."""
    t = _hangul_tag(TAG.search(s))
    if t:
        return t
    p = PTAG.search(s)
    return p if p and _looks_like_dept(p.group(1)) else None


def _tag_fullmatch(s):
    """줄 전체가 <부서>/(부서) 꼬리표뿐인지 본다(제목이 앞줄에서 이미 닫힌 꼴)."""
    t = _hangul_tag(TAG.fullmatch(s))
    if t:
        return t
    p = PTAG.fullmatch(s)
    return p if p and _looks_like_dept(p.group(1)) else None


# 2018~2022 총무경제 실물 꼴(T10 전량 실행에서 발견): 총괄 표가 마크다운 파이프
# 표가 아니라 HTML <table> 로 온다. 원문 표에서 「계」 행이 다음 부서 행과 세로로
# 붙어 있어 kordoc 이 rowspan="2" 로 묶어 「계<br>OO관…」처럼 부서 이름까지 첫 칸에
# 섞는다 — 그래도 첫 칸이 「계」로 시작하면 그 행의 숫자 칸을 총계로 읽는다.
HTML_TOTAL_ROW = re.compile(r'<tr>\s*<td[^>]*>\s*계(?:<br\s*/?>.*?)?</td>\s*<td>(\d+)</td>')


def declared_total(md):
    """「가. 총괄」 표의 「계」 줄 두 번째 칸을 읽는다. 「계」 행 자체가 없고(의회운영처럼
    부서가 하나뿐이라 부서 행이 곧 합계다) 부서 행이 정확히 하나면 그 행의 두 번째
    칸(「계」 열)을 선언 수로 쓴다(2026-09-25 후속, 전 연도 의회운영 포함)."""
    for ln in md.split('\n'):
        c = [x.strip() for x in ln.strip().strip('|').split('|')]
        if len(c) >= 2 and c[0].replace(' ', '') == '계' and c[1].isdigit():
            return int(c[1])
    m = HTML_TOTAL_ROW.search(md)
    if m:
        return int(m.group(1))
    rows = _total_table_before_start(md)
    return rows[0][1] if len(rows) == 1 else None


# ── 총괄 표에서 기본 부서 찾기 (사용자 결정 2026-09-25) ─────────────────────
# 「가. 총괄」 표의 부서 행이 하나뿐이면(예: 의회운영 「|의회사무처|7|7|-||」, 계 행
# 없이 부서 행이 곧 합계다) 그 이름을 꼬리표 없는 지적의 기본 부서로 쓴다. 부서
# 행이 여럿이면(보통 위원회) 기본값을 만들지 않는다 — 어느 부서인지 알 길이 없다.
def _total_table_rows(md):
    """「부서별」/「구분」 머리 파이프 표의 부서 행 이름만 낸다(구분선·「계」 행 제외)."""
    block = []
    for ln in md.split('\n'):
        s = ln.strip()
        if s.startswith('|'):
            block.append(s)
            continue
        if block:
            if _total_table_head(block):
                return _total_table_body(block)
            block = []
    return _total_table_body(block) if _total_table_head(block) else []


def _total_table_head(block):
    if not block:
        return False
    head = [c.strip() for c in block[0].strip('|').split('|')]
    return bool(head) and head[0].replace(' ', '') in ('부서별', '구분')


def _total_table_body(block):
    """(부서 이름, 「계」 열 값) 을 낸다 — 이름은 default_dept 가, 값은 declared_total
    의 「계」 행 없음 대체 경로가 쓴다."""
    out = []
    for ln in block[1:]:
        cells = [c.strip() for c in ln.strip('|').split('|')]
        if not cells or not cells[0]:
            continue
        name = cells[0]
        if set(name.replace(' ', '')) <= {'-'} or name.replace(' ', '') == '계':
            continue
        if len(cells) > 1 and re.fullmatch(r'-?\d+', cells[1]):
            out.append((name, int(cells[1])))
    return out


def _total_table_before_start(md):
    """「나. 시정 및 처리 요구사항」(START) 앞부분에서만 총괄 표를 찾는다(뒤쪽 다른
    파이프 표가 「구분」 머리를 우연히 써도 안 걸리게)."""
    lines = md.split('\n')
    idx = next((i for i, ln in enumerate(lines)
                if not ln.strip().startswith('|') and len(ln.strip()) < 40 and START.search(ln.strip())),
               len(lines))
    return _total_table_rows('\n'.join(lines[:idx]))


def default_dept(md):
    """「가. 총괄」 표에 부서 행이 정확히 하나면 그 이름을, 아니면 None 을 돌려준다."""
    rows = _total_table_before_start(md)
    return rows[0][0] if len(rows) == 1 else None


def _join(parts):
    return re.sub(r'\s+', ' ', ' '.join(p.strip() for p in parts if p.strip())).strip()


def _item_match(s):
    """줄이 항목 시작(「1.」/「- 1)」/「- ①」)이면 (번호, 나머지 글) 을, 아니면 None."""
    m = ITEM.match(s)
    if m:
        return int(m.group(1)), m.group(2)
    m = ITEM_DASH.match(s)
    if m:
        return int(m.group(1)), m.group(2)
    m = ITEM_CIRCLED.match(s)
    if m:
        return _CIRCLED.index(m.group(1)) + 1, m.group(2)
    return None


def parse_report(md, year, com, uid):
    lines = md.split('\n')
    out, mode = _parse(lines, year, com, uid, table_start=False)
    if out is None:
        # 2018 도시건설(20556) 꼴: 「시정 및 처리요구사항」이 총괄 표 머리칸에만 있고 따로 된
        # 절 제목이 없다(선언 60 · 파싱 0 의 원인). 그때만 총괄 표 머리 줄을 시작 신호로
        # 삼아 한 번 더 읽는다. 이 꼴에는 묶음 머리도 없어 group 은 빈 채로 남는다.
        out, mode = _parse(lines, year, com, uid, table_start=True)
        out = out or []
    if mode == 'numbered':
        _groups_from_restarts(out, md)
    dd = default_dept(md)
    if dd:
        for f in out:
            if not f['dept_raw']:
                f['dept_raw'] = dd
    # Task 0: 번호 매기기 항목이 없어 ○ 글머리 모드(circle)로 읽었는지 밝힌다. 의회운영
    # 위원회는 원래 이 꼴이라 정상이지만, 다른 위원회면 run.py 가 「확인할 것」에 적는다.
    return {"declared": declared_total(md), "findings": out, "default_dept": dd, "mode": mode}


# ── 묶음 머리가 없는 문서: 번호가 다시 1로 도는 자리로 묶음을 가른다 (Task 4f) ─────────
# 2018 도시건설(20556)은 묶음 머리가 하나도 없어 가람구청·나래구청 지적이 어느 구인지 알 길이
# 없었다. 그런데 「가. 총괄」 표가 묶음 차례(도시주택국 10, …, 가람구청 및 동 14, 나래구청 및
# 동 13, …)를 적고 있고 본문 번호는 묶음마다 다시 돈다. 번호가 앞 번호보다 작아지는 자리로
# 토막을 내어 토막 수가 총괄 표의 부서 행 수와 같고, 토막마다 건수가 그 행의 수를 넘지
# 않을 때만 총괄 표 차례대로 묶음 이름을 붙인다. 하나라도 어긋나면 손대지 않는다.
def _groups_from_restarts(out, md):
    if not out or any(f['group'] for f in out):
        return
    rows = _total_table_before_start(md)
    segs, prev = [], None
    for f in out:
        if prev is None or f['no'] <= prev:
            segs.append([])
        segs[-1].append(f)
        prev = f['no']
    if len(rows) < 2 or len(segs) != len(rows) or any(len(sg) > n for sg, (_, n) in zip(segs, rows)):
        return
    for sg, (name, _) in zip(segs, rows):
        for f in sg:
            f['group'] = name


def _has_numbered_items(lines, table_start):
    """START 뒤 STOP 전에 번호 매기기 항목(1./①/- 1))이 하나라도 있으면 numbered
    모드, 없으면 (의회운영처럼) ○ 글머리 모드로 읽는다."""
    started = False
    for raw in lines:
        s = raw.strip()
        if not started:
            if table_start:
                started = s.startswith('|') and bool(START.search(s))
            elif START.search(s) and len(s) < 40 and not s.startswith('|'):
                started = True
            continue
        if STOP.search(s):
            break
        if _item_match(s):
            return True
    return False


def _parse(lines, year, com, uid, table_start):
    if _has_numbered_items(lines, table_start):
        return _parse_numbered(lines, year, com, uid, table_start), 'numbered'
    return _parse_circle(lines, year, com, uid, table_start), 'circle'


def _parse_circle(lines, year, com, uid, table_start):
    """번호 없이 「○」/「▶」/「▸」(대시·헤딩 기호 유무 상관) 글머리로만 지적이 오는
    꼴(의회운영, 2018~2025). 제목은 그 줄 나머지, 본문은 다음 글머리 줄이나 STOP 까지
    이어지는 맨 글(글머리 없이도 받는다). 딴 줄 본문을 하나도 못 찾으면(2022 실물처럼
    제목·본문이 한 줄에 붙는 꼴) `_split_title_body` 로 그 자리에서 갈라 본다."""
    started, cur, out, no = False, None, [], 0

    def flush():
        if not cur:
            return
        title = _join(cur['title'])
        body = _join(cur['body'])
        if not body:
            title, body = _split_title_body(title)
        body = PAGE_MARK.sub('', body).strip()
        out.append({"year": year, "com": com, "group": '', "no": cur['no'],
                    "title": title, "body": body, "dept_raw": '', "uid": uid})

    for raw in lines:
        s = raw.strip()
        if not started:
            if table_start:
                started = s.startswith('|') and bool(START.search(s))
            elif START.search(s) and len(s) < 40 and not s.startswith('|'):
                started = True
            continue
        if STOP.search(s):
            break
        if HTML_LINE.match(s) or (table_start and s.startswith('|')):
            continue
        m = CIRCLE_MARK.match(s)
        if m:
            flush()
            no += 1
            cur = {'no': no, 'title': [m.group(1)], 'body': []}
            continue
        if cur is None or not s:
            continue
        clean = PAGE_MARK.sub('', s).strip()
        if clean:
            cur['body'].append(clean)
    flush()
    return out if started else None


def _parse_numbered(lines, year, com, uid, table_start):
    """시작 신호를 끝내 못 만나면 None 을 돌려준다(0건과 구별하려고)."""
    started, group, cur, out = False, '', None, []
    group_open = False   # 「《…,」처럼 닫히지 않은 채 다음 헤딩 줄로 넘어간 묶음 머리

    def flush():
        if cur:
            out.append({"year": year, "com": com, "group": _clean_group(group), "no": cur['no'],
                        "title": _join(cur['title']), "body": _join(cur['body']),
                        "dept_raw": cur['dept'], "uid": uid})

    for raw in lines:
        s = raw.strip()
        if not started:
            # 총괄 표 머리칸(|구분|계|시정및처리요구사항|)에도 같은 말이 있다. 표 줄은 건너뛴다.
            if table_start:
                started = s.startswith('|') and bool(START.search(s))
            elif START.search(s) and len(s) < 40 and not s.startswith('|'):
                started = True
            continue
        if STOP.search(s):
            break
        if HTML_LINE.match(s) or (table_start and s.startswith('|')):
            continue
        gname = _group_name(s)
        if gname is not None:
            flush()
            # 묶음 머리가 두 헤딩 줄에 걸친 꼴(「### 《○○도시공사, …,」 + 「### …축구단》」)
            group = f'{group} {gname}' if group_open and cur is None else gname
            cur = None
            group_open = '《' in group and '》' not in group
            continue
        m = _item_match(s)
        if m:
            flush()
            group_open = False
            cur = {'no': m[0], 'title': [], 'body': [], 'dept': '', 'open': True}
            s = m[1]
        elif s and (cur is None or not cur['open']):
            # 제목이 아직 열려 있을 때(여러 줄에 걸친 제목 도중)는 검사하지 않는다 —
            # 그 사이에 진짜 묶음 머리가 끼어들 일은 없다.
            bgname = _bare_group_name(s)
            if bgname is not None:
                flush(); cur = None
                group, group_open = bgname, False
                continue
        if cur is None or not s:
            continue
        # 제목이 「바랍니다.」로 끝나 닫힌 뒤 꼬리표만 다음 줄에 오는 꼴(「<전 부서>」/「(공통)」)
        fm = _tag_fullmatch(s)
        if fm and not cur['dept'] and not cur['body']:
            cur['dept'] = fm.group(1).strip()
            cur['open'] = False
            continue
        if cur['open'] and not BULLET.match(s):
            t = _tag_match(s)
            if t:
                cur['dept'] = t.group(1).strip()
                s = s[:t.start()]
                cur['open'] = False
            cur['title'].append(s)
            # 꼬리표 없이 문장이 끝나면 제목을 닫는다(꼬리표가 빠진 지적)
            if cur['open'] and re.search(r'(바랍니다|바람)\.?$', s) and not cur['dept']:
                cur['open'] = False
            continue
        cur['open'] = False
        cur['body'].append(BULLET.sub('', s))
    flush()
    return out if started else None


# ── 이름 거두기(누출 검사용, 최종 검토 뒤 고침 R4) ───────────────────────────
# 감사반 편성 표(감사위원장·감사위원·보조직원)와 출석요구인·출석공무원·증인 표의 「성 명」
# 칸에서 사람 이름을 거둔다. 이 목록은 run.py 를 한 번 실행하는 사이에만 메모리에 두고
# snapshot.write 의 누출 검사에 넘긴다. 파일로 남기지 않는다.
_ROLE = re.compile(r'(수석전문위원|전문위원|입법조사관|사무직원|속기사|주무관|감사위원장|감사위원|'
                   r'보조직원|감사보조|위원장|위원)')
_ROW = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
_CELL = re.compile(r'<t[dh]([^>]*)>(.*?)</t[dh]>', re.S)
_NAME_HEAD = re.compile(r'성\s*명')


def _name_tokens(cell):
    out = set()
    for part in re.split(r'<br\s*/?>|[,，·]', cell):
        part = _ROLE.sub(' ', re.sub(r'<[^>]+>', ' ', part))
        for tok in part.split():
            tok = re.sub(r'[^가-힣]', '', tok)
            if 2 <= len(tok) <= 4:
                out.add(tok)
            elif len(tok) > 4 and len(tok) % 3 == 0:
                # 표 칸 안에서 이름이 붙어 나온다(「가나다라마바」). 세 글자씩 끊는다.
                out |= {tok[i:i + 3] for i in range(0, len(tok), 3)}
    return out


def _html_rows(md):
    """HTML 표 줄마다 (열 위치, 칸 글) 목록을 낸다. colspan 만큼 열 위치를 민다."""
    for row in _ROW.findall(md):
        cells, col = [], 0
        for attrs, text in _CELL.findall(row):
            span = re.search(r'colspan="?(\d+)', attrs)
            cells.append((col, text))
            col += int(span.group(1)) if span else 1
        yield cells


def harvest_names(md):
    names = set()
    # 감사반 편성: 머리 줄에 「감사위원장」이 든 파이프 표
    lines = md.split('\n')
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith('|') and '감사위원장' in ln.replace(' ', ''):
            for row in lines[i + 1:]:
                if not row.lstrip().startswith('|'):
                    break
                for cell in row.strip().strip('|').split('|'):
                    if '---' not in cell:
                        names |= _name_tokens(cell)
    # 출석요구인·출석공무원·증인 HTML 표: 「성 명」 머리칸 아래 같은 열
    name_col = None
    for cells in _html_rows(md):
        heads = [c for c, t in cells if _NAME_HEAD.fullmatch(re.sub(r'<[^>]+>', '', t).strip())]
        if heads:
            name_col = heads[0]
            continue
        if name_col is None:
            continue
        for c, t in cells:
            if c == name_col:
                names |= _name_tokens(t)
    return names
