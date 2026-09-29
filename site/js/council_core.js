// 역할: 의원용 페이지의 「물을 거리」 계산. 가중치 없이 건수만 센다. 브라우저·Node 양쪽.
// 첨부 전(처리결과 없음) 지적은 pending 으로만 세고 합계(total)에 넣지 않는다(spec §4.2).
(function (root) {
  const core = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.DCC.core;
  const UNFIXED = ['미조치', '장기검토'];

  function _execFlag(rate, cfg) {
    if (rate === null || rate === undefined) return 0;
    return rate < cfg.exec_low || rate > cfg.exec_high ? 1 : 0;
  }

  function counts(ix, name, actions, cfg) {
    const s = core.summarize(ix, { kind: 'dept', name });
    let unfixed = 0, pending = 0;
    for (const f of s.findings) {
      const a = actions[f.id];
      if (!a) pending++;
      else if (UNFIXED.includes(a.status)) unfixed++;
    }
    const recurring = s.counts.recurring, promises = s.counts.guessedPromises;
    const exec = _execFlag(s.counts.execRate, cfg);
    return { unfixed, recurring, promises, exec, total: unfixed + recurring + promises + exec, pending };
  }

  const ko = (a, b) => a.localeCompare(b, 'ko');

  // 상임위 + 상임위 밖 묶음(groups, 예: 구청·동 행정복지센터). 묶음은 상임위 뒤에, group: true 로 표시한다.
  function units(data) {
    return [...(data.committees || []), ...(data.groups || []).map(g => Object.assign({}, g, { group: true }))];
  }

  function rows(ix, committeeName, actions, cfg) {
    const c = units(ix.data).find(x => x.name === committeeName);
    if (!c) return [];
    return c.depts.map(name => Object.assign({ name, current: !!(ix.depts.get(name) || {}).current },
      counts(ix, name, actions, cfg))).sort((a, b) => (b.total - a.total) || ko(a.name, b.name));
  }

  function sortRows(list, key, dir) {
    const k = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => (key === 'name' ? ko(a.name, b.name) : (a[key] - b[key])) * k || ko(a.name, b.name));
  }

  // 상임위마다 소관 부서 표(rows)를 더한 네 칸·합계·첨부 전. 두 구 공통 지적은 구마다의 부서에서 한 번씩 센 그대로 더한다(spec §7).
  const SUM_KEYS = ['unfixed', 'recurring', 'promises', 'exec', 'total', 'pending'];
  function committeeTotals(ix, actions, cfg) {
    return units(ix.data).map(c => {
      const r = rows(ix, c.name, actions, cfg);
      const s = { name: c.name, group: !!c.group, depts: r.length };
      for (const k of SUM_KEYS) s[k] = r.reduce((n, x) => n + x[k], 0);
      return s;
    });
  }

  function candidates(ix, name, actions, cfg) {
    const s = core.summarize(ix, { kind: 'dept', name });
    const out = [];
    for (const f of s.findings) {
      const a = actions[f.id];
      if (a && UNFIXED.includes(a.status)) {
        out.push({ kind: 'unfixed', id: f.id, title: f.title, year: f.year,
          evidence: `${f.year} ${f.com}위원회 지적 · 처리결과 ${a.status}` + (a.text ? ` — ${a.text}` : '') });
      }
    }
    // 되풀이 줄기의 제목은 가장 최근 지적의 제목(겹친 낱말만으로는 질문이 안 된다). 겹친 낱말은 근거에 적는다.
    if (!ix.fById) ix.fById = new Map(ix.data.findings.map(f => [f.id, f]));
    for (const r of s.recurring) {
      const last = r.finding_ids.map(id => ix.fById.get(id)).filter(Boolean).sort((a, b) => a.year - b.year).slice(-1)[0];
      const common = (r.common || []).join('·');
      out.push({ kind: 'recurring', id: r.id, title: last ? last.title : common, year: r.years[r.years.length - 1],
        evidence: `${r.years.join('·')}년 되풀이 · 지적 ${r.finding_ids.length}건` + (common ? ` · 겹친 낱말 ${common}` : '') });
    }
    for (const p of s.promises.guessed) {
      out.push({ kind: 'promise', id: p.id, title: p.topic, year: Number(String(p.date).slice(0, 4)),
        evidence: `제${p.session}회 시정질문(${p.date}) 답변 약속(부서 추정): ${p.commitments.join(' ')}` });
    }
    const rate = s.counts.execRate;
    if (_execFlag(rate, cfg)) {
      const last = s.expenditure.filter(e => e.year < s.now && e.budget > 0).slice(-1)[0];
      out.push({ kind: 'exec', id: 'EXEC-' + last.year, title: `${last.year}년 집행률 ${rate}%`, year: last.year,
        evidence: `${name} 예산 ${last.budget}원 · 집행 ${last.spent}원` + (last.mended ? ' · 지방재정365 보충' : '') });
    }
    return out;
  }

  // ---------- 내보내기(Task 6): 질의서 초안 프롬프트 · 질문 목록 CSV ----------
  const prompts = () => ((typeof module !== 'undefined' && module.exports) ? require('./prompts.js') : root.DCC.prompts);
  const KIND_LABEL = { unfixed: '조치 안 됨', recurring: '되풀이', promise: '약속(추정)', exec: '집행 이상' };
  const qLine = (c, i) => `Q${i + 1} [${KIND_LABEL[c.kind] || c.kind}] ${c.title || ''}` + (c.year ? ` (${c.year})` : '') +
    (c.evidence ? ` — ${c.evidence}` : '');

  // {{대상}} ← 「{상임위} 소관 {부서}」(상임위 밖 묶음·소관 미확인은 부서 이름만), {{자료}} ← 고른 후보(고른 순서).
  // 이름 가림을 건 뒤 LIMIT 를 넘으면 뒤에서부터 빼고 「외 N건 생략」.
  function promptText(template, ctx) {
    const P = prompts();
    const picked = ctx.picked || [];
    const target = ctx.committee && !ctx.group ? `${ctx.committee} 소관 ${ctx.dept || ''}` : (ctx.dept || '');
    const fill = (list, cut) => {
      const lines = list.map(qLine);
      if (cut) lines.push(`외 ${cut}건 생략`);
      const data = lines.length ? lines.join('\n') : '(고른 후보 없음)';
      return P.maskNames(String(template || '').split('{{대상}}').join(target).split('{{자료}}').join(data));
    };
    let n = picked.length, text = fill(picked, 0);
    while (text.length > P.LIMIT && n > 1) {
      // 한 줄씩 빼면 느리므로 넘친 만큼 어림해 줄인 뒤 한 줄씩 맞춘다.
      const over = text.length - P.LIMIT;
      const avg = Math.max(1, Math.floor(text.length / (n + 1)));
      n = Math.max(1, Math.min(n - 1, n - Math.floor(over / avg)));
      text = fill(picked.slice(0, n), picked.length - n);
    }
    while (text.length > P.LIMIT && n > 1) { n--; text = fill(picked.slice(0, n), picked.length - n); }
    return text;
  }

  // 머리 「번호,종류,제목,연도,근거」. 쉼표·따옴표·줄바꿈이 있는 칸만 큰따옴표로 감싼다(안의 " 는 "").
  // 표계산 프로그램이 식으로 읽지 않게 = + - @ 탭 CR 로 시작하는 칸 앞에 ' 를 붙인다. UTF-8 BOM 은 내려받을 때 붙인다.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvText(ctx) {
    const rows = (ctx.picked || []).map((c, i) => [i + 1, csvCell(KIND_LABEL[c.kind] || c.kind), csvCell(c.title),
      c.year || '', csvCell(c.evidence)].join(','));
    return ['번호,종류,제목,연도,근거', ...rows].join('\n') + '\n';
  }

  // ---------- 날씨(2026-09-29 사용자 판정): 부서의 물을 거리 합계(total)만으로 고른다 — 평가가 아니라 건수 구간 ----------
  // 구간은 config/council.json 「weather」: [{max, icon}, …, {icon}] (max 이하이면 그 날씨, 마지막은 그보다 많은 것 모두).
  // 없거나 비었으면 DEFAULT_WEATHER. key 는 그림 모양(sun·partly·cloud·rain)이다.
  const DEFAULT_WEATHER = [{ max: 0, icon: '맑음' }, { max: 4, icon: '구름 조금' }, { max: 9, icon: '흐림' }, { icon: '비' }];
  const WX_KEYS = { '맑음': 'sun', '구름 조금': 'partly', '흐림': 'cloud', '비': 'rain' };
  const WX_ORDER = ['sun', 'partly', 'cloud', 'rain'];
  function weatherScale(cfg) {
    const list = cfg && Array.isArray(cfg.weather) && cfg.weather.length ? cfg.weather : DEFAULT_WEATHER;
    let min = 0;
    return list.map((w, i) => {
      const last = i === list.length - 1;
      const max = last ? null : Number(w.max);
      const range = max === null ? min + '건 이상' : min === max ? max + '건' : min + '~' + max + '건';
      const out = { level: i, icon: String(w.icon), key: WX_KEYS[w.icon] || WX_ORDER[Math.min(i, WX_ORDER.length - 1)],
        min, max, range, label: w.icon + ' — 물을 거리 ' + range };
      if (max !== null) min = max + 1;
      return out;
    });
  }
  function weather(total, cfg) {
    const s = weatherScale(cfg);
    return s.find(w => w.max === null || total <= w.max) || s[s.length - 1];
  }

  const api = { UNFIXED, KIND_LABEL, DEFAULT_WEATHER, _execFlag, counts, units, rows, sortRows, committeeTotals, candidates, promptText, csvText,
    weatherScale, weather };
  root.DCC = root.DCC || {};
  root.DCC.councilCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
