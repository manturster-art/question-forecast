from dcc import committees

TABLE = {"의회운영위원회": ["의회사무처"],
         "기획행정위원회": ["기획경제실", "가나도시공사"],
         "복지환경위원회": ["기후대기에너지과", "환경국"],
         "도시교통위원회": ["도시주택국", "가나도시공사", "공원관리과", "환경국"]}
HIST = {"총무경제": "기획행정위원회", "기획행정": "기획행정위원회", "도시건설": "도시교통위원회", "보사환경": "복지환경위원회"}
DEPTS = [{"name": "예산법무과", "silguk": "기획경제실", "current": True},
         {"name": "주택과", "silguk": "도시주택국", "current": True},
         {"name": "가나도시공사", "silguk": "출자출연기관", "current": True},
         {"name": "공원관리과", "silguk": "환경국", "current": True},
         {"name": "기후대기에너지과", "silguk": "환경국", "current": True},
         {"name": "환경보건과", "silguk": "환경국", "current": True},
         {"name": "가람구 건설과", "silguk": "가람구", "current": True},
         {"name": "나래구 건설과", "silguk": "나래구", "current": True},
         {"name": "나래구 복지문화과", "silguk": "나래구", "current": True},
         {"name": "어디에도없는과", "silguk": "기타", "current": True}]
FINDINGS = [
    # 가람구 건설과: 두 구 공통(기획행정) 2건은 빼고 세므로, 단독 도시건설 1건(더 옛날)이 이긴다.
    {"year": 2025, "com": "기획행정", "dept": "건설과", "depts": ["가람구 건설과", "나래구 건설과"]},
    {"year": 2024, "com": "총무경제", "dept": "건설과", "depts": ["가람구 건설과", "나래구 건설과"]},
    {"year": 2022, "com": "도시건설", "dept": "가람구 건설과"},
    # 나래구 복지문화과: 복지환경 2건 > 기획행정 1건(최근이어도 적으면 짐)
    {"year": 2022, "com": "보사환경", "dept": "나래구 복지문화과"},
    {"year": 2023, "com": "보사환경", "dept": "나래구 복지문화과"},
    {"year": 2025, "com": "총무경제", "dept": "나래구 복지문화과"},
]


def sets(out):
    s = {}
    for c in out["committees"]:
        for n in c["depts"]:
            s.setdefault(n, set()).add(c["name"])
    return s


# a. 소관표에 부서 이름 자체가 있으면 그 상임위만(실·국으로 두 곳에 겹치지 않게). 2026-09-29 사용자 판정.
def test_table_by_dept_name_beats_silguk():
    s = sets(committees.assign(DEPTS, FINDINGS, TABLE, HIST))
    assert s["공원관리과"] == {"도시교통위원회"}
    assert s["기후대기에너지과"] == {"복지환경위원회"}
    assert s["가나도시공사"] == {"기획행정위원회", "도시교통위원회"}     # 이름이 두 곳에 있으면 두 곳


# b. 이름이 없으면 실·국으로(여럿이면 모두).
def test_table_by_silguk():
    s = sets(committees.assign(DEPTS, FINDINGS, TABLE, HIST))
    assert s["예산법무과"] == {"기획행정위원회"}
    assert s["주택과"] == {"도시교통위원회"}
    assert s["환경보건과"] == {"복지환경위원회", "도시교통위원회"}       # 환경국은 두 곳, 이름은 표에 없음


# c. 표에 없으면 지적 수가 가장 많은 상임위(두 구 공통 지적은 빼고 셈), 같으면 가장 최근 연도.
def test_findings_majority_excluding_joint():
    s = sets(committees.assign(DEPTS, FINDINGS, TABLE, HIST))
    assert s["가람구 건설과"] == {"도시교통위원회"}          # 공통 기획행정 2건보다 단독 도시건설 1건
    assert s["나래구 복지문화과"] == {"복지환경위원회"}        # 2건 > 최근 1건


def test_findings_only_joint_are_used():
    s = sets(committees.assign(DEPTS, FINDINGS, TABLE, HIST))
    assert s["나래구 건설과"] == {"기획행정위원회"}          # 공통 지적뿐이면 그것으로(기획행정 2건)


def test_findings_tie_goes_to_latest_year():
    depts = [{"name": "가과", "silguk": "기타", "current": True}]
    fs = [{"year": 2022, "com": "보사환경", "dept": "가과"}, {"year": 2024, "com": "도시건설", "dept": "가과"}]
    assert sets(committees.assign(depts, fs, TABLE, HIST))["가과"] == {"도시교통위원회"}
    fs2 = [{"year": 2024, "com": "보사환경", "dept": "가과"}, {"year": 2024, "com": "도시건설", "dept": "가과"}]
    assert sets(committees.assign(depts, fs2, TABLE, HIST))["가과"] == {"복지환경위원회", "도시교통위원회"}  # 해도 같으면 둘 다
    fs3 = [{"year": 2020, "com": "총무경제", "dept": "가과"}, {"year": 2021, "com": "기획행정", "dept": "가과"},
           {"year": 2025, "com": "도시건설", "dept": "가과"}]
    assert sets(committees.assign(depts, fs3, TABLE, HIST))["가과"] == {"기획행정위원회"}   # 약칭은 현 이름으로 합쳐 셈


def test_unassigned_and_order():
    out = committees.assign(DEPTS, FINDINGS, TABLE, HIST)
    assert out["unassigned"] == ["어디에도없는과"]
    names = [c["name"] for c in out["committees"]]
    assert names == ["의회운영위원회", "기획행정위원회", "복지환경위원회", "도시교통위원회"]  # 표 순서
    for c in out["committees"]:
        assert c["depts"] == sorted(c["depts"])
    t2 = {"기획행정위원회": ["기획경제실"]}
    names2 = [c["name"] for c in committees.assign(DEPTS, FINDINGS, t2, HIST)["committees"]]
    assert names2[0] == "기획행정위원회" and "복지환경위원회" in names2[1:]   # 변천으로 생긴 것은 뒤


# d. config/council.json 「overrides」는 모든 규칙보다 먼저(사용자 판정: 구청 민원봉사과는 두 상임위).
def test_overrides_win():
    depts = DEPTS + [{"name": "가람구 민원봉사과", "silguk": "가람구", "current": True}]
    fs = FINDINGS + [{"year": 2025, "com": "보사환경", "dept": "가람구 민원봉사과"}]
    ov = {"가람구 민원봉사과": ["기획행정위원회", "도시교통위원회"], "공원관리과": ["복지환경위원회"]}
    s = sets(committees.assign(depts, fs, TABLE, HIST, overrides=ov))
    assert s["가람구 민원봉사과"] == {"기획행정위원회", "도시교통위원회"}
    assert s["공원관리과"] == {"복지환경위원회"}


# e. 현행 동·구 동행정복지센터·구청 본체는 상임위가 아니라 따로 묶음(group)에 둔다 — 지적이 있어도.
DONG = {"가람": ["가나", "새솔"], "나래": ["하람", "마루"]}
DEPTS2 = DEPTS + [{"name": "가나2동", "silguk": "가람구", "current": True},
                  {"name": "하람1동", "silguk": "나래구", "current": True},
                  {"name": "마루동", "silguk": "나래구", "current": True},
                  {"name": "마루1동", "silguk": "나래구", "current": False},
                  {"name": "가람구", "silguk": "가람구", "current": True},
                  {"name": "나래구", "silguk": "나래구", "current": True},
                  {"name": "가람구 동행정복지센터", "silguk": "가람구", "current": True},
                  {"name": "나래구 동행정복지센터", "silguk": "나래구", "current": True},
                  {"name": "새솔동", "silguk": "가람구", "current": True}]
FINDINGS2 = FINDINGS + [{"year": 2024, "com": "보사환경", "dept": "새솔동"},
                        {"year": 2024, "com": "총무경제", "dept": "가람구"},
                        {"year": 2023, "com": "보사환경", "dept": "마루1동"}]
GROUP = "구청·동 행정복지센터"


def test_dong_gu_body_go_to_group_not_committee():
    out = committees.assign(DEPTS2, FINDINGS2, TABLE, HIST, dong=DONG, group=GROUP)
    assert out["groups"] == [{"name": GROUP, "depts": sorted(["가나2동", "하람1동", "마루동", "가람구", "나래구",
                                                               "가람구 동행정복지센터", "나래구 동행정복지센터", "새솔동"])}]
    s = sets(out)
    for n in out["groups"][0]["depts"]:
        assert n not in s, n                                # 지적이 있어도(새솔동·가람구) 상임위에 안 든다
    assert s["마루1동"] == {"복지환경위원회"}              # 옛 동은 묶음 밖, 지적 규칙대로
    assert "나래구 복지문화과" not in out["groups"][0]["depts"]   # 구 부서 전체를 끌어오지 않는다
    assert out["unassigned"] == ["어디에도없는과"]


def test_group_off_without_setting():
    out = committees.assign(DEPTS2, FINDINGS2, TABLE, HIST, dong=DONG)
    assert out["groups"] == []
    assert "가나2동" in out["unassigned"] and "가람구 동행정복지센터" in out["unassigned"]
    assert sets(out)["새솔동"] == {"복지환경위원회"}


def test_override_beats_group():
    ov = {"가람구": ["기획행정위원회"]}
    out = committees.assign(DEPTS2, FINDINGS2, TABLE, HIST, dong=DONG, group=GROUP, overrides=ov)
    assert "가람구" not in out["groups"][0]["depts"]
    assert sets(out)["가람구"] == {"기획행정위원회"}
