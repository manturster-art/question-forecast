// 역할: 부서 요약(core.summarize)과 사용자가 확인한 조치(attach.js 의 actions)를 묶어
// AI 비서에게 붙여넣을 프롬프트를 조립한다. 근거는 [F](행감 지적)·[P](답변 속 약속)·[B](예산)
// 세 묶음에 번호를 붙여, 프롬프트 속 모든 문장이 번호를 달 수 있게 한다(spec §5).
// 부서 순위표·TOP N 은 만들지 않는다(spec §4).
// 2026-09-29 사용자 판정: 지적·약속을 모두 쏟아 넣지 않고, 화면의 후보 목록에서 고른 id(findingIds·promiseIds)만 싣는다.
// 종류마다 처음 체크해 둘 후보는 defaults(kind, …)가 정한다(행감 대비·업무보고 대비·답변서 초안).
(function (root) {
  const LIMIT = 6000;
  // [P] 줄(「외 N건 생략」 포함) 상한. 1/3 에서 묶음 머리글·[B] 줄 몫(300자)을 미리 떼어 두어
  // [P]+[B]+머리글이 자료 칸의 1/3 을 넘지 않게 한다 — 곧 [F] 가 늘 2/3 이상을 쓴다.
  const P_CAP = Math.floor(LIMIT / 3) - 300;

  // --- 이름 가리기: dcc/privacy.py 와 같은 규칙. 한쪽을 고치면 다른 쪽도 고친다 ---
  const TITLES = '사무국장|부시장|구청장|위원장|시장|의원|국장|과장|동장';
  const NAME_TITLE = new RegExp('(?<![가-힣])([가-힣]{3})(\\s*)(' + TITLES + ')', 'g');
  // Fix round 1(2026-09-26, Critical): '하'가 빠져 있어 「하영수 의원이 발언」이 안 가려졌다.
  // dcc/privacy.py 의 SURNAMES 문자열을 한 글자씩 다시 대조해 옮겼다.
  const SURNAMES = new Set(('김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민' +
    '진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편' +
    '용예경봉사부가복태목형계피두감음빈').split(''));
  // 최종 검토 뒤 고침(Task 0): 「인하여」처럼 「하여」로 끝나는 말이 이름으로 잘못
  // 가려졌다(F2018-의회운영-001, 원문 「인하여 의원들이」). 끝 글자 「여」를 더한다.
  const NOT_NAME_END = new Set('의는을를에와로며데면된할던께한여'.split(''));
  const NOT_NAME = new Set(['지역구', '이러한', '그러한', '이번에', '관계자', '담당자', '책임자', '대표인', '비례대']);
  const MASK = '○○○';

  function isName(name) {
    if (!SURNAMES.has(name[0]) || NOT_NAME_END.has(name[name.length - 1]) || NOT_NAME.has(name)) return false;
    return true;
    // dcc/privacy.py 의 _is_name 은 여기서 「알려진 기관·동 이름」(_known_places)도 걸러낸다.
    // prompts.js 는 depts 원본 조직도에 접근하지 않으므로 그 검사는 옮기지 않는다 — 대신
    // maskNames 를 건 뒤에도 dcc.privacy.assert_no_leak 를 굽기 전 파이썬 쪽에서 한 번 더 건다.
  }

  function maskNames(text) {
    if (!text) return text;
    return text.replace(NAME_TITLE, (m, name, gap, title) => (isName(name) ? MASK + gap + title : m));
  }

  // --- 프롬프트 조립 ---
  const BODY_MAX = 200;
  function truncBody(s) {
    s = (s || '').trim();
    return s.length > BODY_MAX ? s.slice(0, BODY_MAX) + '…' : s;
  }

  function findingLine(n, f, summary, actions) {
    let line = `[F${n}] ${f.year} ${f.com}위원회 · ${f.dept} · 「${f.title}」 ${truncBody(f.body)}`;
    if (f.recurring) {
      const rec = (summary.recurring || []).find(r => r.id === f.recurring);
      if (rec) line += ` · 되풀이 ${rec.id} (${rec.years.join('·')})`;
    }
    const a = actions && actions[f.id];
    // 총괄 처리결과처럼 조치 문구 칸이 없는 문서도 있어, 문구가 비면 상태만 적는다(끝에 「—」만 남지 않게).
    if (a) line += ` · 조치: ${a.status}` + (a.text ? ` — ${a.text}` : '');
    return line;
  }

  function promiseLine(n, p) {
    let line = `[P${n}] ${p.date} 제${p.session}회 · 「${p.question}」 → ${p.commitments.join(' / ')}`;
    if (p.dept_guess) line += ' (부서 추정)';
    return line;
  }

  function budgetLine(n, e) {
    const rate = Math.round((e.spent / e.budget) * 1000) / 10;
    let line = `[B${n}] ${e.year} 예산 ${(e.budget / 1e8).toFixed(1)}억 · 집행 ${rate.toFixed(1)}%`;
    if (e.mended) line += ' · 지방재정365 보충';
    return line;
  }

  const toSet = v => (v instanceof Set ? v : new Set(v || []));

  // 고른 지적만, summary 순서(되풀이·최근 먼저)로. 답변서 초안에서 ctx.findingId(상세 패널에서 고른 건)가 있으면 맨 앞에.
  // 지정하지 않으면(findingIds 없음) 아무것도 싣지 않는다 — 모두 쏟아 넣지 않는다.
  function orderedFindings(kind, summary, ctx) {
    const ids = toSet(ctx.findingIds);
    const list = summary.findings.filter(f => ids.has(f.id));
    if (kind !== '답변서초안' || !ctx.findingId) return list;
    const chosen = list.find(f => f.id === ctx.findingId);
    return chosen ? [chosen, ...list.filter(f => f !== chosen)] : list;
  }

  // ---------- 후보 기본 고르기(2026-09-29 사용자 판정) ----------
  // 이행 상태: 첨부(사람이 확인해 반영한 조치)가 없으면 「미첨부」(화면의 「첨부 전」).
  function statusOf(f, actions) {
    const a = actions && actions[f.id];
    return a && a.status ? a.status : '미첨부';
  }
  // 최근 n 개 「자료 연도」: 자료 전체의 지적 연도(dataYears — 행감이 없던 해는 건너뛴다) 가운데 큰 것부터 n 개.
  // dataYears 를 안 주면 이 대상 지적의 연도로 대신한다.
  function recentYears(summary, dataYears, n) {
    const ys = [...new Set((dataYears && dataYears.length ? dataYears : summary.findings.map(f => f.year)).map(Number))];
    return new Set(ys.sort((a, b) => b - a).slice(0, n));
  }
  // 행감 대비: 완료가 아닌 지적 가운데 최근 3개 자료 연도의 것(미조치·장기검토·첨부 전, 그리고 추진중·계속추진도) +
  //            되풀이 줄기에 든 지적(완료는 뺀다). 약속은 고르지 않는다.
  // 업무보고 대비: 최근 2개 자료 연도의 지적(완료 포함 — 조치 결과를 보고한다) + 되풀이 줄기 지적 전부 + 답변 속 약속 전부.
  // 답변서 초안: 아무것도 고르지 않는다(사용자가 한 건씩 고른다).
  function defaults(kind, summary, actions, dataYears) {
    const findings = new Set(), promises = new Set();
    if (kind === '행감대비') {
      const ys = recentYears(summary, dataYears, 3);
      for (const f of summary.findings) {
        if (statusOf(f, actions) === '완료') continue;
        if (ys.has(Number(f.year)) || f.recurring) findings.add(f.id);
      }
    } else if (kind === '업무보고대비') {
      const ys = recentYears(summary, dataYears, 2);
      for (const f of summary.findings) if (ys.has(Number(f.year)) || f.recurring) findings.add(f.id);
      for (const p of summary.promises.guessed || []) promises.add(p.id);
    }
    return { findings, promises };
  }
  // 상세 패널의 「이 건 답변서 초안」: 그 지적과 같은 되풀이 줄기의 지적(대상 안의 것)을 고른다.
  function draftPick(summary, findingId) {
    const f = summary.findings.find(x => x.id === findingId);
    if (!f) return new Set();
    return new Set(f.recurring ? summary.findings.filter(x => x.id === f.id || x.recurring === f.recurring).map(x => x.id) : [f.id]);
  }

  // 최근 3개 「마감」 연도만 [B] 로 보인다. Fix round 1(2026-09-26): 「목록의 가장 최근
  // 연도를 뺀다」는 근사치 대신, core.summarize 가 이제 내놓는 summary.now(=ix.now)로
  // 마감 여부를 그대로 판정한다(year < now && budget > 0), 최근 해부터 최대 3개.
  function closedExpenditures(summary) {
    const list = (summary.expenditure || []).filter(e => e.year < summary.now && e.budget > 0);
    return list.slice().sort((a, b) => b.year - a.year).slice(0, 3);
  }

  function build(kind, ctx) {
    const summary = ctx.summary;
    const actions = ctx.actions || {};
    const promiseIds = toSet(ctx.promiseIds);

    let fCandidates = orderedFindings(kind, summary, ctx);
    let pList = (summary.promises.guessed || []).filter(p => promiseIds.has(p.id));
    const picked = { F: fCandidates.length, P: pList.length };
    const bList = closedExpenditures(summary);
    const tg = ctx.target || {};
    const bScope = tg.kind === 'silguk' ? `${tg.name || ''} 합산` : (tg.name || '');

    // 최종 검토 수정 4: 약속을 많이 체크하면 [P] 가 자료 칸을 차지해 [F] 가 밀려났다. [P] 는
    // 자료 칸의 약 1/3(P_CAP)까지만 싣고, 넘는 것은 끝에서부터 빼 「외 N건 생략」으로 적는다.
    let omittedP = 0;
    const pLen = (list, cut) => list.reduce((n, p, i) => n + promiseLine(i + 1, p).length + 1, 0) +
      (cut ? `외 ${cut}건 생략`.length + 1 : 0);
    while (pList.length > 1 && pLen(pList, omittedP) > P_CAP) {
      pList = pList.slice(0, -1);
      omittedP++;
    }

    let omittedF = 0;
    let actionsIncluded = 0;
    function render(fList) {
      actionsIncluded = fList.filter(f => actions[f.id]).length;
      const fLines = fList.map((f, i) => findingLine(i + 1, f, summary, actions));
      if (omittedF > 0) fLines.push(`외 ${omittedF}건 생략`);
      const pLines = pList.map((p, i) => promiseLine(i + 1, p));
      if (omittedP > 0) pLines.push(`외 ${omittedP}건 생략`);
      const bLines = bList.map((e, i) => budgetLine(i + 1, e));
      return '[F] 행감 지적\n' + (fLines.length ? fLines.join('\n') : '(없음)') + '\n\n' +
        '[P] 답변 속 약속(추정 부서, 고른 것만)\n' + (pLines.length ? pLines.join('\n') : '(없음)') + '\n\n' +
        `[B] 예산(${bScope})\n` + (bLines.length ? bLines.join('\n') : '(없음)');
    }

    let data = render(fCandidates);
    while (data.length > LIMIT && fCandidates.length > 0) {
      fCandidates = fCandidates.slice(0, -1);
      omittedF++;
      data = render(fCandidates);
    }

    const name = (ctx.target && ctx.target.name) || '';
    let text = ctx.template.replace('{{대상}}', name).replace('{{자료}}', data);
    text = maskNames(text);

    // actionsIncluded: 잘라낸 뒤 남은 [F] 줄 가운데 첨부 조치가 붙은 줄 수(화면 경고 띠 판단용).
    return { text, chars: text.length, omitted: { F: omittedF, P: omittedP, B: 0 }, actionsIncluded, picked };
  }

  // 파이썬과 규칙표가 구조적으로 같은지 시험(tests/test_mask_parity.py)에서 대조할 수
  // 있게 원본 표를 그대로 내놓는다(Fix round 1: 값 비교만으로는 표 하나가 통째로 비어도
  // 표본이 우연히 통과하는 사고를 못 잡는다는 지적).
  const _rules = { TITLES, SURNAMES: [...SURNAMES], NOT_NAME_END: [...NOT_NAME_END], NOT_NAME: [...NOT_NAME] };

  const api = { LIMIT, maskNames, build, statusOf, defaults, draftPick, _rules };
  root.DCC = root.DCC || {};
  root.DCC.prompts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
