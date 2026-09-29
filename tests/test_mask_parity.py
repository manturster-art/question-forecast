import json, subprocess
from dcc import privacy, paths

SAMPLES = ['김철수 시장님께서', '농수산물도매시장 운영', '가나시장은', '이영희 의원이 질의', '박정호 국장과 협의',
           '담당자 과장은', '하영수 의원이 발언']


def _run_js(expr):
    js = paths.ROOT / 'site' / 'js' / 'prompts.js'
    code = f"const P=require({json.dumps(str(js))});console.log(JSON.stringify({expr}))"
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    return json.loads(out)


def test_js_and_python_mask_the_same():
    got = _run_js(f"{json.dumps(SAMPLES, ensure_ascii=False)}.map(P.maskNames)")
    assert got == [privacy.mask_names(s) for s in SAMPLES]


def test_js_and_python_rule_tables_are_identical():
    # 값 비교(SAMPLES)만으로는 규칙표 하나가 통째로 비어도 표본이 우연히 다 통과하는
    # 사고를 못 잡는다. 규칙표 자체를 구조적으로 대조한다(Fix round 1 지적사항 1).
    assert _run_js('P._rules.TITLES') == privacy.TITLES
    assert set(_run_js('P._rules.SURNAMES')) == privacy.SURNAMES
    assert set(_run_js('P._rules.NOT_NAME_END')) == privacy.NOT_NAME_END
    assert set(_run_js('P._rules.NOT_NAME')) == privacy.NOT_NAME
