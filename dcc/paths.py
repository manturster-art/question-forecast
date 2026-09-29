# 역할: 저장소 안 경로를 한곳에 둔다. 다른 모듈은 여기서만 경로를 얻는다.
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / 'work'        # 받은 원본·kordoc 마크다운 캐시. git 에 넣지 않는다
OUT = ROOT / 'out'          # 산출 JSON·HTML. git 에 넣지 않는다
CONFIG = ROOT / 'config'  # 지역 설정(region·행정기구·별칭·상임위). 템플릿 기본값은 가상 지자체 예시
DATA = ROOT / 'data'      # 선택: 세출_지방재정365.json(지출액 보충용 공개자료). 없어도 돈다 — docs/표준화.md
SAMPLE = ROOT / 'examples' / 'sample' / 'site_data.json'   # 합성 견본 자료(python run.py --site-only --sample)


def ensure():
    for p in (WORK, OUT, WORK / 'pdf', WORK / 'md', WORK / '세출'):
        p.mkdir(parents=True, exist_ok=True)
