# 역할: 도구 이름을 한 곳(config/brand.json)에서 읽는다. 이름을 바꿀 때는 이 파일이 읽는
# config/brand.json 만 고치면 <title>·화면 머리·README 가 모두 따라 바뀐다.
import json
from dcc import paths


def load():
    return json.loads((paths.CONFIG / 'brand.json').read_text(encoding='utf-8'))
