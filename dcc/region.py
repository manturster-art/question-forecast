# 역할: 지자체별 값(지자체·의회 이름, 누리집 주소, 구·동 앞말)을 config/region.json 한 곳에서 읽는다.
# 다른 의회·지자체가 이 도구를 쓸 때는 region.json 만 고치면 수집 주소·화면·프롬프트가 따라 바뀐다
# (누리집 게시판 짜임이 다르면 dcc/council_site.py 어댑터도 고친다 — docs/표준화.md).
# 부르는 쪽이 매번 새로 읽는다(시험에서 가짜 지자체로 바꿔 끼울 수 있게 캐시하지 않는다).
# 단 부서 규칙(depts·findings·qna)의 정규식·낱말 집합과 privacy·depts 의 lru_cache 는 import 때
# 한 번 만든다. region.json(또는 paths.CONFIG)을 바꾸면 프로세스를 다시 시작하거나 refresh() 를 부른다.
import json
import re
from dcc import paths


_LISTENERS = []


def on_refresh(fn):
    """refresh() 때 다시 불릴 함수(지역 값으로 만든 상수를 다시 만들고 캐시를 비움)를 건다."""
    _LISTENERS.append(fn)
    return fn


def refresh():
    """region.json 을 다시 읽어 각 모듈의 지역 상수·캐시를 새로 만든다."""
    for fn in list(_LISTENERS):
        fn()


def load():
    return json.loads((paths.CONFIG / 'region.json').read_text(encoding='utf-8'))


def council_url(key, **kw):
    """의회 누리집 주소: base + 경로(자리표시 {uid} 등은 kw 로 채운다)."""
    c = load()['의회']
    return c['base'] + c[key].format(**kw)


def gu_names():
    """자치구가 아닌 일반구 이름 앞말(「가람」 등). 구가 없는 시·군이면 빈 목록."""
    return list((load().get('구') or {}).keys())


def gu_alt():
    """정규식 고르기 꼴(「가람|나래」). 구가 없으면 아무것에도 안 맞는 꼴을 준다."""
    names = gu_names()
    return '|'.join(re.escape(g) for g in names) if names else '(?!)'


def dong_prefixes():
    """{구 앞말: [동 이름 앞말…]} — 숫자 붙은 동(「○○2동」)까지 앞말로 가른다."""
    return {g: list(v) for g, v in (load().get('구') or {}).items()}


def city_prefix_pattern():
    """기관 이름 앞의 지자체 이름(「○○시」「○○」)을 떼는 정규식 꼴."""
    r = load()
    full, short = r['지자체명'], r.get('약칭') or r['지자체명']
    rest = full[len(short):] if full.startswith(short) else ''
    return '^' + re.escape(short) + (f'(?:{re.escape(rest)})?' if rest else '')
