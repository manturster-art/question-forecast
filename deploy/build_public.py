# 역할: 공개 배포용 정적 자산 한 벌(index.html + robots.txt)을 deploy/public/ 에 만든다.
#
# 실제 배포(wrangler deploy, 로그인·publish)는 여기서 하지 않는다 — plan 의 하드 룰:
# `--dry-run` 없이 배포하지 않고, 실배포는 사용자가 채팅에서 다시 승인한 뒤 사람이 한다.
#
# out/부서점검표.html(자체 시험판이 아닌 출하판, python run.py --site-only 로 만든다)을
# 그대로 복사하기 전에 세 관문을 다시 본다. 하나라도 어기면 아무것도 쓰지 않고 멈춘다.
#   ① 파일 글자 어디에도 「selftest」가 없다 — 있으면 자체 시험판이 섞였다는 뜻
#   ② 파일 속 window.DCC_DATA 를 다시 꺼내 privacy.assert_no_leak 을 다시 건다
#      (site_build.build 가 구울 때도 걸었지만, 배포 직전에 다시 보는 것 — 그 사이
#      out/ 파일이 바뀌었을 수 있다)
#   ③ deploy/public/ 에 이 두 파일 말고 낯선 파일이 없다
#
# 이름 사전은 work/names_public.json 캐시(names_public.fetch_names(offline=True))만
# 쓴다. run.py 가 결과보고서에서 그때그때 거두는 이름(findings.harvest_names)은 굽는
# 순간에만 메모리에 있다가 버려지고 파일로 남지 않으므로(snapshot.write 참조) 여기서는
# 다시 모을 수 없다 — site_build.build 가 구울 때 이미 그 이름들로 한 번 걸렀으므로
# out/부서점검표.html 자체에는 안 남아 있어야 한다(위 ②가 다시 확인한다).
import json
import shutil
from pathlib import Path

from dcc import names_public, paths, privacy

PUBLIC = Path(__file__).resolve().parent / 'public'
ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'
ALLOWED_FILES = {'index.html', 'robots.txt'}
DCC_DATA_MARKER = 'window.DCC_DATA='


class BuildRefusal(RuntimeError):
    pass


def extract_dcc_data(html):
    """out/부서점검표.html 안 window.DCC_DATA={...}; 에서 자료(JSON)를 꺼낸다.

    빌더(dcc.site_build.inline_json)는 구분자 없이 바로 뒤에 window.DCC_PROMPTS=... 를
    이어 붙인다. 「다음 ';' 까지」를 정규식으로 잘라내면 자료 속 문자열에 낀 ';' 에서
    잘못 잘릴 수 있으므로, json.JSONDecoder().raw_decode 로 자료가 실제로 끝나는 자리를
    직접 찾는다.
    """
    i = html.find(DCC_DATA_MARKER)
    if i < 0:
        raise BuildRefusal('window.DCC_DATA 를 찾지 못했습니다')
    start = i + len(DCC_DATA_MARKER)
    try:
        data, _end = json.JSONDecoder().raw_decode(html, start)
    except ValueError as e:
        raise BuildRefusal(f'window.DCC_DATA 의 JSON 을 못 읽었습니다: {e}') from e
    return data


def _check_no_selftest_trace(html):
    if 'selftest' in html:
        raise BuildRefusal('출하판(out/부서점검표.html)에 자체 시험판(selftest) 흔적이 섞여 있습니다 — '
                            '부서점검표_selftest.html 을 배포하려 한 것은 아닌지 확인하세요')


def _check_no_leak(html):
    data = extract_dcc_data(html)
    names = set(names_public.fetch_names(offline=True))
    try:
        privacy.assert_no_leak(data, names)
    except privacy.LeakError as e:
        raise BuildRefusal(f'배포 직전 누출 검사에 걸렸습니다: {e}') from e


def _check_public_dir_is_clean():
    if not PUBLIC.exists():
        return
    extra = sorted(p.name for p in PUBLIC.iterdir() if p.name not in ALLOWED_FILES)
    if extra:
        raise BuildRefusal(f'deploy/public/ 에 낯선 파일이 있습니다(치우고 다시 하세요): {extra}')


def build(src=None):
    """out/부서점검표.html 을 deploy/public/index.html 로 복사하고 robots.txt 를 쓴다.

    세 관문(selftest 흔적·누출 검사·deploy/public/ 정갈함)을 모두 통과해야 한다.
    돌려주는 값은 deploy/public/ 경로.
    """
    src = Path(src) if src else paths.OUT / '부서점검표.html'
    if not src.exists():
        raise BuildRefusal(f'{src} 가 없습니다 — 먼저 python run.py --site-only 로 출하판을 굽습니다')
    html = src.read_text(encoding='utf-8')

    _check_no_selftest_trace(html)
    _check_no_leak(html)
    _check_public_dir_is_clean()

    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, PUBLIC / 'index.html')
    (PUBLIC / 'robots.txt').write_text(ROBOTS_TXT, encoding='utf-8')

    made = sorted(p.name for p in PUBLIC.iterdir())
    if made != sorted(ALLOWED_FILES):
        raise BuildRefusal(f'deploy/public/ 에 두 파일 외의 것이 생겼습니다: {made}')
    return PUBLIC


if __name__ == '__main__':
    try:
        import sys
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass
    out = build()
    print(f'{out} 준비됨 (index.html, robots.txt). 실제 배포는 여기서 하지 않습니다 — '
          f'wrangler deploy --dry-run 으로 설정만 확인하세요.')
