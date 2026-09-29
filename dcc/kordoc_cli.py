# 역할: kordoc CLI 로 hwp·hwpx·pdf 를 마크다운으로 바꾼다. 한 번 바꾼 것은 다시 바꾸지 않는다.
#
# Windows 에서 kordoc 은 npm 전역 설치의 .cmd 라 shell=True 가 있어야 불린다.
# 콘솔 기본 인코딩이 cp949 라 출력은 파일로 받는다(-o). 앞선 점검 도구(비공개)과 같은 방식이다.
#
# 최종 검토 뒤 고침(I6): refresh=True 면 캐시된 md 를 지우고 다시 바꾼다(--refresh 로 PDF 를
# 새로 받았는데 옛 md 를 읽던 것). kordoc 이 0 아닌 값으로 끝나면 반쯤 쓴 md 를 지우고 실패로 본다.
import subprocess
from dcc import paths


def to_markdown(src, refresh=False):
    out = paths.WORK / 'md' / (src.stem + '.md')
    out.parent.mkdir(parents=True, exist_ok=True)
    if refresh and out.exists():
        out.unlink()
    if out.exists() and out.stat().st_size > 200:
        return out.read_text(encoding='utf-8')
    try:
        r = subprocess.run(f'kordoc "{src}" -o "{out}"', shell=True, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=900)
    except subprocess.TimeoutExpired as e:
        out.unlink(missing_ok=True)
        raise RuntimeError(f'kordoc 이 {src.name} 을 900초 안에 못 읽었습니다') from e
    if r.returncode != 0:
        out.unlink(missing_ok=True)
        raise RuntimeError(f'kordoc 이 {src.name} 에서 {r.returncode} 로 끝났습니다: {(r.stderr or "")[:200]}')
    if not out.exists():
        raise RuntimeError(f'kordoc 이 {src.name} 을 못 읽었습니다: {(r.stderr or "")[:200]}')
    return out.read_text(encoding='utf-8')
