# 역할: 의회 누리집에서 공개 원문 목록을 읽고 PDF 를 받는다(의회 게시판 어댑터).
#
# 주소는 config/region.json 의 「의회」에서 읽는다(dcc/region.py). 다른 의회가 게시판 짜임
# (목록 표 칸, 뷰어·파일 조회 방식)이 다르면 이 파일의 parse_*·resolve_file 을 고친다.
#
# 링크는 뷰어 주소(/viewer/pdf.do?group=bbs&uid=N)라 그대로 받으면 HTML 이 온다.
# 뷰어는 CSRF 토큰을 실어 loadFile.do 에 물어 진짜 파일 주소를 얻는다.
# 토큰은 뷰어 HTML 의 <meta name="_csrf"> 에 있고 세션 쿠키와 짝이 맞아야 한다.
# 2026-09-24 에 curl 로 이 순서를 확인했다. 토큰만 있고 쿠키가 없으면 403 이다.
import html as _html
import json
import re
import tempfile
from pathlib import Path

from dcc import http as _http
from dcc import region

TR = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
TD = re.compile(r'<td[^>]*>(.*?)</td>', re.S)
UID = re.compile(r'uid=(\d+)')
TAG = re.compile(r'<[^>]+>')


def _text(s):
    return re.sub(r'\s+', ' ', _html.unescape(TAG.sub(' ', s))).strip()


def base():
    return region.load()['의회']['base']


def viewer_url(uid):
    return region.council_url('뷰어', uid=uid)


def parse_inspection_list(page):
    """행정사무감사 표에서 (연도, 위원회, 계획서/결과보고서, uid) 를 뽑는다.

    연도 칸은 rowspan 으로 위원회 넷을 덮는다. 연도가 없는 줄은 앞 연도를 물려받는다.
    """
    out, year = [], None
    for tr in TR.findall(page):
        tds = TD.findall(tr)
        for td in tds:
            m = re.fullmatch(r'(20\d\d)년', _text(td))
            if m:
                year = int(m.group(1))
        com = next((_text(td) for td in tds if _text(td).endswith('위원회')), None)
        if not com or year is None:
            continue
        com = com[:-3]
        for td in tds:
            m = UID.search(td)
            if not m:
                continue
            label = _text(td)
            kind = '결과보고서' if '결과' in label else '계획서' if '계획' in label else None
            if kind:
                out.append({"year": year, "com": com, "kind": kind, "uid": int(m.group(1))})
    return out


def parse_qna_list(page):
    """시정질문 답변요지서 목록 한 쪽을 읽는다."""
    out = []
    for tr in TR.findall(page):
        tds = [_text(td) for td in TD.findall(tr)]
        raw = TD.findall(tr)
        if len(tds) < 3:
            continue
        d = re.match(r'(20\d\d)\.\s*(\d\d)\.\s*(\d\d)', tds[0])
        s = re.search(r'제(\d+)회', tds[1])
        u = UID.search(raw[2])
        if d and s and u:
            out.append({"date": f'{d.group(1)}-{d.group(2)}-{d.group(3)}',
                        "session": int(s.group(1)), "title": tds[1], "uid": int(u.group(1))})
    return out


def resolve_file(uid, cookies=None):
    """뷰어 uid 를 진짜 파일 주소(/attach/…pdf)와 원래 파일명으로 바꾼다.

    뷰어 GET 과 loadFile POST 는 같은 세션 쿠키를 써야 한다. `cookies` 를 주면
    그 쿠키 jar 파일을 그대로 쓰고, 안 주면 임시 파일을 만들었다가 지운다.
    """
    if cookies is not None:
        return _resolve_file(uid, cookies)
    with tempfile.TemporaryDirectory() as d:
        return _resolve_file(uid, Path(d) / 'cookies.txt')


def _resolve_file(uid, cookies):
    page = _http.get(viewer_url(uid), cookies=cookies).decode('utf-8', 'replace')
    tok = re.search(r'name="_csrf"\s+content="([^"]+)"', page)
    if not tok:
        raise RuntimeError(f'uid {uid}: 뷰어에 CSRF 토큰이 없습니다')
    body = _http.post(region.council_url('파일조회'), {'group': 'bbs', 'uid': uid},
                       cookies=cookies, headers={
                           'X-CSRF-TOKEN': tok.group(1), 'X-Requested-With': 'XMLHttpRequest',
                           'Referer': viewer_url(uid)})
    j = json.loads(body.decode('utf-8'))
    if not j.get('result'):
        raise RuntimeError(f'uid {uid}: {j.get("message")}')
    return j['file'], j.get('message', '')


def download_pdf(uid, dest):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    with tempfile.TemporaryDirectory() as d:
        cookies = Path(d) / 'cookies.txt'
        path, _ = _resolve_file(uid, cookies)
        data = _http.get(base() + path, cookies=cookies)
    if not data.startswith(b'%PDF'):
        raise RuntimeError(f'uid {uid}: PDF 가 아닌 것이 왔습니다')
    dest.write_bytes(data)
    return dest


def fetch_lists():
    insp = parse_inspection_list(_http.get(region.council_url('행감목록')).decode('utf-8', 'replace'))
    qna, page, qna_url = [], 1, region.council_url('답변요지서목록')
    while True:
        rows = parse_qna_list(_http.get(f'{qna_url}?page={page}').decode('utf-8', 'replace'))
        new = [r for r in rows if r['uid'] not in {q['uid'] for q in qna}]
        if not new:
            break
        qna += new
        page += 1
    return insp, qna
