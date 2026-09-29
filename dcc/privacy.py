# 역할: 공개 산출물에 사람 이름이 새지 않게 한다(최종 검토 뒤 고침 R3·R4, 2026-09-25).
#
# mask_names    — 직함 앞 이름(「홍길동 시장」「홍길동의원」)을 ○○○ 로 가린다.
# assert_no_leak — 파일로 쓰기 직전에 HTML 표 찌꺼기, 「성 명」, 가리지 않은 이름+직함,
#                  실행 중 거둔 이름 목록(감사반·출석·증인 표)을 훑어 하나라도 있으면 멈춘다.
#
# 브리프의 꼴 [가-힣]{2,4}\s*(?=직함) 을 그대로 쓰면 「○○시장」(지자체장)「농수산물도매시장」
# 「예산법무과장」「의회사무처장」이 다 가려진다. 그래서 다음처럼 좁혔다.
#   - 이름은 한글 낱말의 첫머리에서 시작하는 세 글자(앞 글자가 한글이면 안 받는다)
#   - 첫 글자가 흔한 성씨여야 한다
#   - 끝 글자가 조사·어미(의·는·을·한…)면 이름이 아니다(「이러한 시장」)
#   - 이름+직함 첫 글자가 알려진 기관·동 이름이면 이름이 아니다(「은하수동장」)
# 두 글자·네 글자 이름은 놓친다. 그 몫은 거둔 이름 목록 대조가 받는다.
import re
from functools import lru_cache

from dcc import region

TITLES = '사무국장|부시장|구청장|위원장|시장|의원|국장|과장|동장'
NAME_TITLE = re.compile(r'(?<![가-힣])([가-힣]{3})(\s*)(' + TITLES + ')')
SURNAMES = set('김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민'
               '진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편'
               '용예경봉사부가복태목형계피두감음빈')
# 최종 검토 뒤 고침(Task 0): 「인하여」처럼 「하여」로 끝나는 말이 이름으로 잘못
# 가려졌다(F2018-의회운영-001, 원문 「인하여 의원들이」). 끝 글자 「여」를 더한다.
NOT_NAME_END = set('의는을를에와로며데면된할던께한여')
NOT_NAME = {'지역구', '이러한', '그러한', '이번에', '관계자', '담당자', '책임자', '대표인', '비례대'}
MASK = '○○○'

HTML_LEAK = re.compile(r'<t[dhr]\b|<table', re.I)
NAME_HEAD = re.compile(r'성\s*명')


class LeakError(RuntimeError):
    pass


# Task 2(공개 명단으로 이름 사전을 넓힘) 뒤 실제 산출물 검사로 드러난 오탐: 사전에 든
# 실존 인명 하나가 「~보다 많은」을 뜻하는 흔한 한자어 서술꼴 끝(아래 QUANTITY_SUFFIXES)과
# 우연히 겹쳤다(예: 「2명 …다 경우」「응답자의 절반 …다 50.9%」, 실제 이름·낱말은 여기
# 적지 않는다).
#
# 1차 고침(컨트롤러 지시 d, 리뷰에서 지적): 처음엔 「숫자·절반 등이 바로 앞에 있으면
# 무조건 관용구」로 봐줘서, 「제9대 가나다 발언」처럼 앞에 숫자가 있을 뿐인 진짜 인명
# 언급까지 놓치는 구멍이 있었다. 이제는 다음 셋을 다 만족해야만 봐준다.
#   1) 이름이 QUANTITY_SUFFIXES 의 서술꼴 끝으로 끝난다
#   2) 바로 앞에 수량어(숫자·절반·과반)가 있다
#   3) 바로 뒤에도 관용구 꼬리(경우·것·자·때·숫자)가 있다
# 1)이 없으면 「제9대 가나다 발언」・「3차 가나다」처럼 숫자 뒤에 온 진짜 인명도 여전히 걸린다.
QUANTITY_SUFFIXES = ('상인', '하인', '만인', '과인', '일인')
QUANTITY_BEFORE = re.compile(r'(?:\d[가-힣]{0,2}|절반|과반)\s*$')
QUANTITY_AFTER = re.compile(r'^\s*(경우|것|자|때|\d)')


def _is_quantity_idiom(name, s, start):
    if not name.endswith(QUANTITY_SUFFIXES):
        return False
    if not QUANTITY_BEFORE.search(s[:start]):
        return False
    return bool(QUANTITY_AFTER.match(s[start + len(name):]))


@lru_cache(maxsize=1)
def _known_places():
    from dcc import depts
    org = depts._org()
    return set(org) | set(org.values()) | {g + '구' for g in region.gu_names()}


def _is_name(name, title):
    if name[0] not in SURNAMES or name[-1] in NOT_NAME_END or name in NOT_NAME:
        return False
    places = _known_places()
    return not (name + title[0] in places or name + title in places)


def mask_names(text):
    if not text:
        return text

    def sub(m):
        name, gap, title = m.groups()
        return MASK + gap + title if _is_name(name, title) else m.group(0)
    return NAME_TITLE.sub(sub, text)


def _strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _strings(k)
            yield from _strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _strings(v)


# 컨트롤러 지시: 자료 원문에서 이름이 「김 신」처럼 글자 사이에 공백이 낀 채 나올 수 있다
# (공개 명단 쪽 사전엔 names_public.parse_members 가 공백을 지운 「김신」꼴로만 들어간다).
# 사전 이름 글자 사이사이에 공백이 끼어 나와도 걸리도록 글자마다 \s* 를 끼워 찾는다.
def _spaced_pattern(name):
    return re.compile(r'\s*'.join(re.escape(c) for c in name))


def assert_no_leak(obj, names=()):
    """obj 속 글자열을 다 훑어 새는 것이 있으면 LeakError. 무엇이 걸렸는지는 알리되
    이름 자체는 메시지에 싣지 않는다(오류 문구가 기록에 남을 수 있어서)."""
    patterns = [(n, _spaced_pattern(n)) for n in names if len(n) >= 3]
    for s in _strings(obj):
        if HTML_LEAK.search(s):
            raise LeakError(f'HTML 표 찌꺼기: {s[:60]!r}')
        if NAME_HEAD.search(s):
            raise LeakError(f'「성 명」 글자: {s[:60]!r}')
        if mask_names(s) != s:
            raise LeakError('가리지 않은 이름+직함이 있습니다')
        for n, pat in patterns:
            for m in pat.finditer(s):
                if not _is_quantity_idiom(n, s, m.start()):
                    raise LeakError('거둔 이름 목록에 있는 글자가 나왔습니다')


# 구 이름(region.json)·조직도로 만든 _known_places 캐시를 region.refresh() 때 비운다.
region.on_refresh(_known_places.cache_clear)
