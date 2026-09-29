# 역할: 이 저장소의 모든 웹 요청은 이 모듈을 거친다.
#
# 의회·시 누리집 서버가 전방 비밀성(forward secrecy) 없는 RSA 키 교환만 받아
# 파이썬 기본 TLS(ssl 모듈)로는 악수(handshake)가 깨진다. 파이썬 쪽 암호 수준을
# 낮추는 대신, OS 가 이미 처리할 줄 아는 방식대로 Windows 기본 curl.exe
# (Schannel)로 접속한다 — 인증서 검증은 켠 채로 둔다. -k/--insecure 는 쓰지
# 않는다. (2026-09-24 사용자 결정. 두 서버 모두 curl 로 200·검증 통과 확인)
import shutil
import subprocess
import time
import urllib.parse
from pathlib import Path

UA = 'Mozilla/5.0 (question-forecast; public-data collector)'


def _find_curl():
    system32 = Path('C:/Windows/System32/curl.exe')
    if system32.exists():
        return str(system32)
    found = shutil.which('curl')
    if found:
        return found
    raise RuntimeError('curl 을 찾을 수 없습니다. Windows 기본 curl.exe 가 없으면 이 모듈을 쓸 수 없습니다')


CURL = _find_curl()


def _base_argv(timeout, headers):
    # 청사 보안 장비가 HTTPS 를 다시 서명하는데 그 인증서에 폐기 확인 주소가 없어 Schannel 의
    # 폐기 확인이 실패한다(CRYPT_E_NO_REVOCATION_CHECK). 확인 주소가 없거나 닿지 않을 때만
    # 건너뛰고, 폐기가 확인되면 여전히 거부한다. 체인·도메인 검증은 그대로. 2026-09-25 사용자 승인.
    argv = [CURL, '-sS', '--fail', '-L', '--ssl-revoke-best-effort',
            '--max-time', str(timeout), '-A', UA]
    for k, v in (headers or {}).items():
        argv += ['-H', f'{k}: {v}']
    return argv


def _run(argv):
    time.sleep(0.5)  # 남의 서버다. 몰아치지 않는다
    r = subprocess.run(argv, capture_output=True)
    if r.returncode != 0:
        err = r.stderr.decode('utf-8', 'replace')
        raise RuntimeError(f'curl 실패(exit {r.returncode}): {err}')
    return r.stdout


def get(url, *, cookies=None, headers=None, timeout=60):
    argv = _base_argv(timeout, headers)
    if cookies is not None:
        argv += ['-b', str(cookies), '-c', str(cookies)]
    argv.append(url)
    return _run(argv)


def post(url, data, *, cookies=None, headers=None, timeout=60):
    argv = _base_argv(timeout, headers)
    if cookies is not None:
        argv += ['-b', str(cookies), '-c', str(cookies)]
    for k, v in data.items():
        argv += ['--data-urlencode', f'{k}={v}']
    argv.append(url)
    return _run(argv)
