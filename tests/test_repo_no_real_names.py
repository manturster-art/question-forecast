# 역할: 저장소(추적 파일) 어디에도 실명이 남지 않았는지 지키는 안전망(1차 고침, 컨트롤러
# 지시 b). 실제로 3548a59 커밋에서 dcc/qna.py·dcc/privacy.py 주석과 그 시험 파일에
# 실명이 그대로 들어간 것과, tests/fixtures/result_report.md·docs/plans/...md 에 있던
# 예전 실명이 이번에 드러났다 — 앞으로 같은 실수를 커밋 전에 잡는다.
#
# 점검 목록은 run.py 가 쓰는 것과 같은 재료로 쌓는다: work/names_public.json(공개
# 명단 캐시) ∪ 결과보고서 캐시(work/md/*.md)의 감사반 편성·출석 표에서 findings.harvest_names
# 로 거둔 이름. 캐시가 없으면(온라인 수집을 한 번도 안 한 새 클론 등) 건너뛴다 — 이 시험은
# 실명 캐시가 있어야만 의미가 있다.
import json
import re
import subprocess

import pytest

from dcc import findings, paths

CACHE = paths.WORK / 'names_public.json'

# harvest_names 는 감사반·출석 표를 통째로 훑다 보니 표 머리말 같은 일반 낱말도 이름처럼
# 걸린다(질문의원·질문방식·답변자·일문일답·기획행정 등 — 실제 61개 캐시 문서로 확인한
# 잡음). 사람 이름이 아니라 표 구조 낱말이라 이 저장소 훑기에서는 뺀다(진짜 이름인지
# 아닌지는 dcc/privacy.py 의 실제 누출 검사가 따로 맡는다 — 여기는 저장소 위생 안전망).
NOISE = {'답변자', '일문일답', '질문의원', '질문방식', '기획행정', '소 속', '시 장',
         # Task 4f: 한글 이름 파일까지 훑게 되자 드러난 표 머리·위원회 낱말 조각(사람 이름 아님).
         # 행정기구.json 상임위 이름, 공개 세출 사업명, 검산 기록의 사업명에서 걸렸다.
         '복지환경', '도시교통', '건축물', '공공복', '업지역', '타당성', '합시설'}

SKIP_FILES = {'vendor/kordoc/kordoc.browser.js'}


def _checklist():
    names = set(json.loads(CACHE.read_text(encoding='utf-8')))
    md_dir = paths.WORK / 'md'
    if md_dir.exists():
        for p in md_dir.glob('*.md'):
            try:
                md = p.read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            names |= findings.harvest_names(md)
    return sorted(n for n in names if len(n) >= 3 and n not in NOISE)


def _spaced_pattern(name):
    # 이름 글자 사이에 공백이 낀 채(「김 신」) 있어도 잡는다(privacy.py 와 같은 방식).
    return re.compile(r'\s*'.join(re.escape(c) for c in name))


def _tracked_files():
    # -z: 한글 파일 이름을 따옴표·8진 이스케이프 없이 그대로 받는다(Task 4f 고침 — 예전엔
    # 「"docs/ì ..."」 꼴로 와서 p.exists() 가 거짓이라 한글 이름 파일을 통째로 건너뛰었다).
    if (paths.ROOT / '.git').exists():
        out = subprocess.run(['git', 'ls-files', '-z'], capture_output=True, text=True,
                              encoding='utf-8', cwd=paths.ROOT).stdout
        rels = filter(None, out.split('\0'))
    else:   # git 없이 푼 전달 패키지: 폴더 전체를 훑는다(작업·산출·캐시 폴더는 뺌)
        skip = {'.git', 'work', 'out', '__pycache__', '.pytest_cache', 'node_modules'}
        rels = [p.relative_to(paths.ROOT).as_posix() for p in sorted(paths.ROOT.rglob('*'))
                if p.is_file() and not skip & set(p.relative_to(paths.ROOT).parts)]
    for rel in rels:
        if rel in SKIP_FILES:
            continue
        p = paths.ROOT / rel
        if not p.exists():
            continue
        try:
            data = p.read_bytes()
        except OSError:
            continue
        if b'\x00' in data[:2000]:  # 이진 파일은 건너뛴다
            continue
        yield rel, p


def test_tracked_files_include_korean_names():
    rels = {rel for rel, _ in _tracked_files()}
    assert any(re.search(r'[가-힣]', r) for r in rels), rels


@pytest.mark.skipif(not CACHE.exists(), reason='work/names_public.json 캐시가 없다(온라인 수집을 한 번도 안 함)')
def test_no_real_names_in_tracked_files():
    names = _checklist()
    patterns = [(n, _spaced_pattern(n)) for n in names]
    hits = []
    for rel, p in _tracked_files():
        try:
            text = p.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if any(pat.search(line) for _, pat in patterns):
                hits.append(f'{rel}:{i}')
    assert not hits, ('이름 사전에 든 실명이 저장소 파일에 있습니다(자리만 적음, 이름 자체는 '
                       '싣지 않습니다): ' + ', '.join(hits[:30]))
