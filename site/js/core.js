// 역할: 화면이 쓰는 자료 색인과 부서·실국 요약. 브라우저와 Node 양쪽에서 돈다.
// 순위·TOP N 은 만들지 않는다(spec §4). 약속의 부서는 추정이므로 요약에 guessed 로만 담는다.
(function (root) {
  const LAST = new Set(['기타', '여러 부서 공통', '미상']);

  // 최종 검토 수정 1: 「마감 연도」 판정 기준은 보는 PC 의 시계가 아니라 자료 생성일(generated)이다.
  // 2027 년에 2026-09 자료를 열어도 2026 은 진행 중인 해로 본다. generated 가 없을 때만 시계를 쓴다.
  function dataYear(data, clockYear) {
    const y = Number(String((data && data.generated) || '').slice(0, 4));
    return y > 2000 ? y : (clockYear || new Date().getFullYear());
  }

  function index(data, nowYear) {
    const now = nowYear || dataYear(data);
    const depts = new Map(data.depts.map(d => [d.name, d]));
    // Task 4f: 부서 이름과 같은 표기, 두 부서 이상에 걸린 표기는 별칭으로 쓰지 않는다
    // (나중 것이 이기면 「건설과」 지적이 말없이 한 구로 몰린다). 자료층도 걸러 주지만 여기서 한 번 더 막는다.
    const alias = new Map(), clash = new Set();
    for (const d of data.depts) for (const a of d.aliases || []) {
      if (depts.has(a)) continue;
      if (alias.has(a) && alias.get(a) !== d.name) clash.add(a);
      alias.set(a, d.name);
    }
    for (const a of clash) alias.delete(a);
    const byDept = new Map();
    for (const f of data.findings) {
      // 두 구 공통 지적(depts)은 구마다의 부서 밑에 같은 기록 하나로 든다.
      for (const n of f.depts && f.depts.length ? f.depts : [f.dept]) {
        const name = alias.get(n) || n;
        if (!byDept.has(name)) byDept.set(name, []);
        byDept.get(name).push(f);
      }
    }
    const src = new Map(data.sources.map(s => [s.uid, s]));
    return { data, now, depts, alias, byDept, src };
  }

  function searchDepts(ix, q) {
    const t = (q || '').replace(/\s+/g, '');
    const out = [];
    for (const d of ix.depts.values()) {
      let hit = null;
      if (!t || d.name.replace(/\s+/g, '').includes(t) || (d.silguk || '').includes(t)) hit = '';
      else for (const a of d.aliases || []) if (a.replace(/\s+/g, '').includes(t)) { hit = a; break; }
      if (hit === null) continue;
      // 순서(검색 맞춤 정도일 뿐 부서 순위 아님): 이름이 똑같음 → 이름이 검색어로 시작 → 이름에 들어 있음 → 실·국·옛 이름으로 맞음.
      const n = d.name.replace(/\s+/g, '');
      const rank = !t ? 0 : n === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : 3;
      out.push({ name: d.name, silguk: d.silguk, current: !!d.current, matchedAlias: hit || null, rank });
    }
    out.sort((a, b) => (a.rank - b.rank) || (b.current - a.current) || (a.rank === 1 ? a.name.length - b.name.length : 0) ||
      a.name.localeCompare(b.name, 'ko'));
    return out.slice(0, 30);
  }

  // 동 이름인지(region.json 「구」의 동 앞말 + 숫자? + 「동」). 구 실·국 목록에서 구청 부서 뒤로 보낸다(2026-09-28 사용자 요청).
  function isDong(ix, name) {
    if (!ix.dongRe) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ps = Object.values(ix.data.dong || {}).flat().map(esc);
      ix.dongRe = ps.length ? new RegExp('^(' + ps.join('|') + ')[0-9]*동$') : /(?!)/;
    }
    return ix.dongRe.test(name);
  }

  function silguks(ix) {
    const g = new Map();
    for (const d of ix.depts.values()) {
      const k = d.silguk || '기타';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(d.name);
    }
    // 부서 이름은 가나다순, 다만 동(행정복지센터 동)은 그 실·국의 다른 부서 뒤에 가나다순으로 둔다.
    const order = (a, b) => (isDong(ix, a) - isDong(ix, b)) || a.localeCompare(b, 'ko');
    return [...g.entries()].map(([name, depts]) => ({ name, depts: depts.sort(order) }))
      .sort((a, b) => (LAST.has(a.name) - LAST.has(b.name)) || a.name.localeCompare(b.name, 'ko'));
  }

  function members(ix, target) {
    if (target.kind === 'dept') return [target.name];
    return [...ix.depts.values()].filter(d => (d.silguk || '기타') === target.name).map(d => d.name);
  }

  function summarize(ix, target) {
    const names = members(ix, target);
    const set = new Set(names);
    const findings = [...new Set(names.flatMap(n => ix.byDept.get(n) || []))];
    findings.sort((a, b) => ((b.recurring ? 1 : 0) - (a.recurring ? 1 : 0)) || (b.year - a.year) || (a.no - b.no));
    const byYear = {};
    for (const f of findings) (byYear[f.year] = byYear[f.year] || []).push(f);
    const recurring = ix.data.recurring.filter(r => (r.depts && r.depts.length ? r.depts : [r.dept])
      .some(n => set.has(ix.alias.get(n) || n)));
    const guessed = ix.data.promises.filter(p => p.dept !== '미상' && set.has(ix.alias.get(p.dept) || p.dept));
    const ex = new Map();
    for (const n of names) for (const e of ix.data.expenditure[n] || []) {
      const v = ex.get(e.year) || { year: e.year, budget: 0, spent: 0, mended: false };
      v.budget += e.budget; v.spent += e.spent; v.mended = v.mended || e.mended;
      ex.set(e.year, v);
    }
    const expenditure = [...ex.values()].sort((a, b) => a.year - b.year);
    const closed = expenditure.filter(e => e.year < ix.now && e.budget > 0);
    const last = closed[closed.length - 1];
    const execRate = last ? Math.round(last.spent / last.budget * 1000) / 10 : null;
    // 예산현액을 넘는 집행(집행률 100% 초과)이 있는 해 — 화면에 「이월·보충 자료 차이일 수 있음」 한 줄을 단다.
    const overYears = expenditure.filter(e => e.budget > 0 && e.spent > e.budget).map(e => e.year);
    // 실·국 화면에만: 묶음 머리(group)가 이 실·국 이름인 「여러 부서 공통」 지적. 본 지적 목록·건수에는 섞지 않는다.
    // 구 실·국(「가람구」)이면 묶음 머리에 구 이름이 딱 하나 나오는 것(「가람구 및 14개동」「가람구청 및 동」)도 받는다.
    // 구 이름은 자료의 gu(region.json 「구」 앞말)에서 온다.
    // 최종 검토 Minor 2: 낱말 단위로 본다 — 「가람구보건소」는 「가람구」가 아니라 「가람구보건소」 실·국 몫이다.
    const guOf = g => {
      const hit = new Set();
      for (const n of ix.data.gu || []) {
        for (let i = g.indexOf(n); i >= 0; i = g.indexOf(n, i + 1)) hit.add(g.startsWith('구보건소', i + n.length) ? n + '구보건소' : n + '구');
      }
      return hit.size === 1 ? [...hit][0] : null;
    };
    const common = target.kind === 'silguk'
      ? (ix.byDept.get('여러 부서 공통') || []).filter(f => { const g = (f.group || '').trim(); return g === target.name || guOf(g) === target.name; })
        .sort((a, b) => (b.year - a.year) || (a.no - b.no))
      : [];
    const coverage = [...new Set(findings.map(f => f.uid))].map(u => ix.src.get(u)).filter(Boolean)
      .sort((a, b) => b.year - a.year);
    return { findings, byYear, recurring, promises: { guessed }, expenditure, overYears, common, coverage, now: ix.now,
      counts: { findings: findings.length, recurring: recurring.length, guessedPromises: guessed.length, execRate } };
  }

  // 시작 화면 「전체 예보」 띠: 자료 전체의 건수(부서별이 아님 — 순위·비교 없음). 약속은 답변 질문 단위(promises 줄 수).
  function overview(data) {
    const ys = (data.findings || []).map(f => Number(f.year)).filter(y => y > 0);
    return { findings: (data.findings || []).length, recurring: (data.recurring || []).length, promises: (data.promises || []).length,
      from: ys.length ? Math.min(...ys) : null, to: ys.length ? Math.max(...ys) : null,
      committees: (data.committees || []).length };
  }

  const api = { dataYear, index, isDong, searchDepts, silguks, summarize, overview };
  root.DCC = root.DCC || {};
  root.DCC.core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
