# 질문 예보

표준 템플릿 · **질문 예보**(우리 부서 의회대응 점검표)는 지방의회의 행정사무감사 지적·되풀이 지적·시정질문 답변 속 약속·예산 집행 추이를
부서별로 한 장에 모아 보여 주는 **오프라인 HTML** 과, 그것을 공개자료로 만드는 파이썬 프로그램입니다.

- `부서점검표.html` — 집행부 부서 직원용. 부서를 고르면 지적·되풀이·약속·예산이 한 장에 뜨고,
  행감 대비·업무보고 대비·답변서 초안 프롬프트를 조립해 기관 AI 업무비서에 붙여 넣을 수 있습니다.
- `의원점검표.html` — 의원·의회 직원용. 상임위를 고르면 소관 부서의 「물을 거리」가 나오고,
  질문 후보를 골라 질의서 초안 프롬프트·질문 목록(CSV)·1쪽 브리핑을 냅니다.

두 HTML 은 파일 하나로 열립니다. 설치·인터넷 연결이 필요 없고, 첨부한 파일은 브라우저 밖으로 나가지 않습니다.

이 저장소는 **템플릿**입니다. `config/` 에는 가상 지자체 **「가나시」**의 예시 설정이, `examples/sample/` 에는
그 지자체의 **지어낸** 견본 자료가 들어 있습니다. 실제 지자체·사람의 자료는 들어 있지 않습니다.

## 원칙 — 공개자료만

- 의회 누리집에 공개된 **행정사무감사 결과보고서**·**시정질문 답변요지서**와 시 누리집의 **세출(사업 및 예산정보)** 만 씁니다.
- **사람 이름을 담지 않습니다.** 직함 앞 이름은 ○○○ 로 가리고, HTML 을 굽기 전과 프롬프트를 복사하기 직전에
  이름 누출 검사(이름+직함 꼴, 공개 의원 명단·결과보고서 표에서 거둔 이름 목록)를 겁니다. 걸리면 파일을 쓰지 않습니다.
- **부서끼리 순위를 매기지 않습니다.** TOP N·순위표를 만들지 않습니다.
- 기계가 묶거나 추정한 것(되풀이 줄기, 약속의 담당 부서)은 「확인 필요」로 표시하고, 모든 줄에 원문 링크를 답니다.
- 첨부한 처리결과 파일은 브라우저 안에서만 읽고 저장하지 않습니다(새로고침하면 사라짐).

## 빠른 시작 — 견본 자료로 두 화면 굽기

필요한 것: Python 3.10 이상(표준 라이브러리만 씀). 시험에는 `pytest`, JS 시험에는 Node.js 18 이상.

```bash
python run.py --site-only --sample
```

`out/` 에 네 파일이 생깁니다.

| 파일 | 뜻 |
|---|---|
| `out/부서점검표.html` | 집행부용 화면(배포용) |
| `out/의원점검표.html` | 의원용 화면 |
| `out/부서점검표_selftest.html` · `out/의원점검표_selftest.html` | 자체 시험판(주소 끝에 `?selftest` 를 붙여 열면 화면 안에서 스스로 점검). 배포하지 않습니다 |

더블클릭해 Edge·Chrome 으로 엽니다. 견본에서 「주택과」「청년정책관」을 찾아보거나, 의원용에서 상임위 카드를 눌러 보십시오.
견본 자료는 `tools/make_sample.py` 가 만듭니다(지적 33건·되풀이 4줄기·약속 7건·2021~2026 세출, 모두 지어낸 것).

### 시험

```bash
python -m pytest -q
node --test "tests/js/*.test.js"
```

`tests/test_site_selftest.py`·`tests/test_council_selftest.py` 는 Edge 헤드리스로 자체 시험판을 돌립니다
(먼저 위 굽기 명령을 실행. Windows 에서는 Git Bash 가 아니라 PowerShell 에서 실행합니다). Edge 가 없으면 건너뜁니다.

## 자기 의회·지자체에 적용하기

지자체마다 다른 값은 설정 파일에만 있습니다. 코드는 대개 고치지 않습니다.

| 파일 | 바꿀 것 |
|---|---|
| `config/region.json` | 지자체·의회 이름, 의회 누리집 주소와 게시판 경로, 시 세출 주소, 구·동 이름 앞말 |
| `config/행정기구.json` | 실·국·부서, 부시장 직속, 소속기관, 구·동, 출자출연기관, **상임위 소관 표** |
| `config/별칭.json` | 옛 부서 이름·줄여 쓴 이름 → 현재 이름(`config/별칭_출처.md` 에 근거와 함께) |
| `config/상임위_변천.json` · `config/council.json` | 위원회 옛 이름 → 현 상임위, 의원용 기준값(집행률 구간 등) |
| `config/brand.json` | 화면에 보이는 도구 이름·한 줄 소개 |

의회 누리집 게시판 짜임이 다르면 `dcc/council_site.py` 한 파일(목록 읽기·원본 PDF 주소 찾기)을 고칩니다.
순서·배정 규칙·한계와 **AI 코딩 에이전트(예: Claude Code)에게 붙여 넣을 요청 글**, **적용 뒤 확인표**는
[docs/표준화.md](docs/표준화.md) 에 있습니다.

설정을 바꾼 뒤 실제 공개자료로 만들기:

```bash
python run.py              # 받을 것만 받아 파싱·조립하고 두 화면을 굽는다
python run.py --offline    # 받지 않고 캐시(work/)만 쓴다
python run.py --site-only  # out/site_data.json 으로 화면만 다시 굽는다
```

받은 원본·캐시는 `work/`, 산출은 `out/` 에 두며 둘 다 git 에 넣지 않습니다(`.gitignore`).

## 그 밖의 도구 (선택)

- `tools/sync.py` · `tools/register_task.ps1` — 주 1회 자동 갱신(Windows 작업 스케줄러). 무엇을 하는지 먼저 보여 주고 확인을 받습니다.
- `deploy/` — `python -m deploy.build_public` 로 공개용 한 장(`deploy/public/index.html`, 검색엔진 차단)을 만들고
  Cloudflare 정적 자산으로 올릴 수 있습니다. 공개자료만 담긴 것을 확인한 뒤, 책임자 승인을 받고 올리십시오.
- `tools/video/` · `tools/motion/` — 구동 동영상·30초 모션그래픽. 견본으로 돌리려면
  `python run.py --sample` 뒤 `python tools/video/make_video.py`, 또는 `python tools/motion/make_motion.py --sample`.
  Node.js·Edge·`imageio-ffmpeg` 가 필요합니다.
- `tools/kordoc-bundle/` — 문서 읽기 번들(`vendor/kordoc/`)을 다시 묶는 법.

## 라이선스·만든 사람

- 코드: MIT License — [LICENSE](LICENSE) (Copyright (c) 2026 JJ)
- 함께 든 구성요소(kordoc 번들, Geist 글꼴 등): [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

made by JJ. 개인이 만든 도구이며 **어느 정부·지자체·의회의 공식 제품이나 배포물이 아닙니다.** 어느 기관도 내용을
보증하지 않습니다. 화면에 나오는 자료의 정본은 각 의회·시 누리집의 원문입니다.
