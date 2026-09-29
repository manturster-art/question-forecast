// 역할: 두 페이지(집행부 부서점검표·의원점검표)가 함께 쓰는 겉모양 도구 → root.DCC.kit.
// 집행부 화면(ui.js)에서 꺼낸 것이다(4차 Task 3). ui.js 의 겉동작은 바뀌지 않아야 한다.
//  - 요소 만들기: el·append·svg·clear·$·badge·icon·statusIcon·statusCls·comName
//  - prefs: 글자 크기(&fs=)·테마(&theme=) 읽기·적용·단추 묶음. 저장소에 쓰지 않고 주소에만 남긴다.
//  - attachFlow: 처리결과 첨부 칸(파일 고르기 → kordoc/CSV 읽기 → attach.match → 확인 표 → 「확인한 것 반영」).
//    첨부 내용은 메모리(store)에만 두고 localStorage·IndexedDB 에 쓰지 않는다. 반영은 onApply 로 돌려준다.
//  - copyText·downloadText: 클립보드 복사, 이 컴퓨터 안에서 Blob 을 파일로 저장(네트워크 아님).
//  - candList·candSync·previewBox·fillPreview: 후보 목록(체크·묶음·전부 고르기)과 프롬프트 미리 보기(2026-09-29, 두 페이지 공용).
// 자료 문자열은 모두 textContent(텍스트 노드)로만 넣는다 — innerHTML 에 자료를 넣지 않는다(XSS 방지).
(function (root) {
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- 작은 DOM 도우미 ----------
  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    return append(n, children);
  }
  function append(n, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return n;
  }
  function svg(tag, attrs, ...children) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  const $ = id => document.getElementById(id);
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const comName = c => (c && !c.endsWith('위원회') ? c + '위원회' : c || '');
  const badge = (text, cls) => el('span', { class: 'badge ' + (cls || ''), text });

  // ---------- 작은 그림(모두 svg 요소로 만든다 — 글자 자료는 넣지 않음) ----------
  function icon(name) {
    const g = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: 'ic ic-' + name, focusable: 'false' });
    const P = {
      search: [svg('circle', { cx: 7, cy: 7, r: 4.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
        svg('path', { d: 'M10.5 10.5 L14 14', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' })],
      menu: [svg('path', { d: 'M2.5 4h11M2.5 8h11M2.5 12h11', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' })],
      chev: [svg('path', { d: 'M6 4l4 4-4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })],
      close: [svg('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' })],
      home: [svg('path', { d: 'M2.5 7.5L8 3l5.5 4.5M4 6.5V13h3v-3.5h2V13h3V6.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })],
      auto: [svg('circle', { cx: 8, cy: 8, r: 5.75, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
        svg('path', { d: 'M8 2.25 A5.75 5.75 0 0 1 8 13.75 Z', fill: 'currentColor' })],
      sun: [svg('circle', { cx: 8, cy: 8, r: 2.75, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
        svg('path', { d: 'M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round' })],
      moon: [svg('path', { d: 'M13 9.6A5.5 5.5 0 1 1 6.4 3a4.5 4.5 0 0 0 6.6 6.6Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' })],
      // 작은 레이더(직원용 시작 화면 검색창): 두 고리 + 쓸고 가는 선 + 점 하나
      radar: [svg('circle', { cx: 8, cy: 8, r: 6.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
        svg('circle', { cx: 8, cy: 8, r: 3.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, opacity: 0.6 }),
        svg('path', { d: 'M8 8L12.4 3.6', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
        svg('circle', { cx: 10.3, cy: 10.6, r: 1, fill: 'currentColor' })],
    }[name] || [];
    P.forEach(p => g.appendChild(p));
    return g;
  }
  const statusCls = st => (st === '완료' ? 's-ok' : st === '미조치' || st === '장기검토' ? 's-warn' : st === '추진중' || st === '계속추진' ? 's-go' : 's-etc');
  // 이행 상태 아이콘(Plane 의 상태 원 꼴): 미첨부 점선 원, 추진 반원, 완료 체크 원, 미조치 빨간 원.
  function statusIcon(st) {
    const g = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false', class: 'si ' + statusCls(st) });
    if (st === '미첨부') g.appendChild(svg('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-dasharray': '2.2 2.2' }));
    else if (st === '완료') {
      g.appendChild(svg('circle', { cx: 8, cy: 8, r: 6.75, fill: 'currentColor' }));
      g.appendChild(svg('path', { d: 'M5.2 8.2l1.9 1.9 3.8-4', fill: 'none', stroke: 'var(--card)', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (st === '추진중' || st === '계속추진') {
      g.appendChild(svg('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
      g.appendChild(svg('path', { d: 'M8 4.5 A3.5 3.5 0 0 1 8 11.5 Z', fill: 'currentColor' }));
    } else if (st === '미조치' || st === '장기검토') {
      g.appendChild(svg('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
      g.appendChild(svg('path', { d: 'M8 5v3.5', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
      g.appendChild(svg('circle', { cx: 8, cy: 10.9, r: 0.95, fill: 'currentColor' }));
    } else g.appendChild(svg('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    return g;
  }

  // ---------- 글자 크기·테마(저장하지 않음 — 주소 &fs= &theme= 에만) ----------
  // st 는 부르는 쪽 화면 상태({ fs, theme, ... }). 글자 크기 5단계(%)와 테마 3단계. 기본은 100%·자동(시스템 설정).
  const FS_STEPS = [90, 100, 112, 125, 140];
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '자동(시스템)', light: '라이트', dark: '다크' };
  const prefs = {
    FS_STEPS, THEMES, THEME_LABEL,
    // 홈 링크 주소: 글자 크기·테마만 남긴다(가운데 클릭·새 탭으로 열어도 같은 설정).
    homeHref(st) {
      const q = [];
      if (st.fs !== 100) q.push('fs=' + st.fs);
      if (st.theme !== 'auto') q.push('theme=' + st.theme);
      return '?' + q.join('&');
    },
    read(st) {
      const q = new URLSearchParams(location.search);
      const fs = Number(q.get('fs'));
      if (FS_STEPS.includes(fs)) st.fs = fs;
      if (THEMES.includes(q.get('theme'))) st.theme = q.get('theme');
    },
    apply(st) {
      const h = document.documentElement;
      h.style.setProperty('--fs', String(st.fs / 100));
      if (st.theme === 'auto') delete h.dataset.theme; else h.dataset.theme = st.theme;
      const tb = $('theme-btn');
      if (tb) {
        const next = THEMES[(THEMES.indexOf(st.theme) + 1) % THEMES.length];
        clear(tb).appendChild(icon(st.theme === 'dark' ? 'moon' : st.theme === 'light' ? 'sun' : 'auto'));
        tb.setAttribute('aria-label', '화면 테마: ' + THEME_LABEL[st.theme] + ' — 누르면 ' + THEME_LABEL[next]);
        tb.title = tb.getAttribute('aria-label');
        tb.dataset.theme = st.theme;
      }
      const r = $('fs-reset');
      if (r) { r.setAttribute('aria-pressed', st.fs === 100 ? 'true' : 'false'); r.title = '글자 크기 기본 100% (Alt+0) · 지금 ' + st.fs + '%'; }
    },
    // 화면 낭독기용 알림(#live, 보이지 않는 칸). 없으면 아무것도 안 한다.
    announce(text) {
      const n = $('live');
      if (!n) return;
      n.textContent = '';
      setTimeout(() => { n.textContent = text; }, 30);
    },
    // onChange(kind) — 값이 바뀌었을 때만 부른다(kind = 'fs' | 'theme'). 주소 고치기·다시 그리기는 부르는 쪽 몫.
    setFs(st, v, onChange) {
      if (!FS_STEPS.includes(v)) return;
      if (v !== st.fs) { st.fs = v; prefs.apply(st); if (onChange) onChange('fs'); }
      prefs.announce('글자 크기 ' + v + '%');
    },
    stepFs(st, d, onChange) {
      const i = FS_STEPS.indexOf(st.fs) + d;
      if (i < 0 || i >= FS_STEPS.length) { prefs.announce('글자 크기 ' + st.fs + '% — ' + (d > 0 ? '가장 큰' : '가장 작은') + ' 단계입니다'); return; }
      prefs.setFs(st, FS_STEPS[i], onChange);
    },
    cycleTheme(st, onChange) {
      st.theme = THEMES[(THEMES.indexOf(st.theme) + 1) % THEMES.length];
      prefs.apply(st);
      if (onChange) onChange('theme');
      prefs.announce('화면 테마 ' + THEME_LABEL[st.theme]);
    },
    // 머리 줄의 글자 크기 묶음(#fs-down·#fs-reset·#fs-up)과 테마 단추(#theme-btn). 배열로 돌려준다.
    controls(st, onChange) {
      const fsBtn = (id, cls, text, label, fn) => el('button', { type: 'button', id, class: ('fs-b ' + cls).trim(), 'aria-label': label, title: label, onclick: fn, text });
      return [
        el('div', { class: 'fs-group', role: 'group', 'aria-label': '글자 크기 (Alt + 더하기·빼기·0)' },
          fsBtn('fs-down', 'sm', '가−', '글자 작게 (Alt+-)', () => prefs.stepFs(st, -1, onChange)),
          fsBtn('fs-reset', '', '가', '글자 크기 기본 100% (Alt+0)', () => prefs.setFs(st, 100, onChange)),
          fsBtn('fs-up', 'lg', '가+', '글자 크게 (Alt++)', () => prefs.stepFs(st, 1, onChange))),
        el('button', { type: 'button', id: 'theme-btn', class: 'icon-btn theme-btn', onclick: () => prefs.cycleTheme(st, onChange) })];
    },
  };

  // ---------- 복사·내려받기 ----------
  // 권한 창 등으로 약속(Promise)이 끝나지 않는 경우가 있어 1.5초 안에 안 끝나면 옛 방식(execCommand)으로 넘어간다.
  // ta(글 상자)를 주면 그것을 골라 복사하고, 없으면 잠깐 숨은 글 상자를 만들어 쓴다. → Promise<boolean>
  async function copyText(text, ta) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        ok = await Promise.race([navigator.clipboard.writeText(text).then(() => true),
          new Promise(r => setTimeout(() => r(false), 1500))]);
      }
    } catch (e) { ok = false; }
    if (!ok) {
      const tmp = ta ? null : el('textarea', { class: 'vh', 'aria-hidden': 'true', tabindex: '-1', readonly: true });
      const box = ta || tmp;
      if (tmp) { tmp.value = text; document.body.appendChild(tmp); }
      box.focus(); box.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (tmp) tmp.remove();
    }
    return ok;
  }
  function downloadText(name, text, mime) {
    // 내려받기는 이 컴퓨터 안에서 Blob 을 파일로 저장할 뿐이다(네트워크 아님).
    const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: name, hidden: true });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- 처리결과 첨부 흐름 ----------
  // 흐름: 파일 → (csv 는 fromCsv / 나머지는 kordoc.parse → tableRows → extractActions) → match 로 짝 제안
  // → 확인 표에서 사람이 고르고 「반영」 체크 → 「확인한 것 반영」 때만 onApply(actions) 로 돌려준다.
  const ACCEPT = '.hwp,.hwpx,.pdf,.xlsx,.xls,.csv';
  const BIG_FILE = 20 * 1024 * 1024;
  const extOf = name => { const m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  function decodeText(bytes) {
    // 엑셀에서 CSV 로 저장하면 CP949(euc-kr)인 경우가 많다. UTF-8 로 안 읽히면 euc-kr 로 다시 읽는다.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* 아래로 */ }
    try { return new TextDecoder('euc-kr').decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }
  function fLabel(f) {
    const t = f.title.length > 42 ? f.title.slice(0, 42) + '…' : f.title;
    return f.year + ' ' + comName(f.com) + ' ' + f.no + '번 · ' + t;
  }

  // opts(값 자리는 값이나 값을 돌려주는 함수 둘 다 된다):
  //   findings   짝 후보 지적 배열(필수)
  //   onApply(actions, info)  actions = {[지적 id]: {status, text, source}}, info = {files, n, dup}
  //   multiple   파일 여러 개를 한 번에 고를 수 있게(기본 false)
  //   merge      여러 파일을 한 확인 표·한 반영 단추로 모은다(기본 = multiple). 집행부 화면은 false(파일마다 표).
  //   store      {pending, log, busy} 를 둘 곳(다시 그려도 남게). 없으면 안에서 만든다.
  //   id         칸 id(기본 'attach-panel')
  //   dept       match 에 넘길 부서 이름(없으면 부서 가림 없이)
  //   deptKeys   「이 대상」으로 볼 부서 이름·별칭들(줄의 부서 칸과 대조)
  //   actions    지금 반영된 조치 {id: …}(「반영 결과 CSV」 단추를 켤지)
  //   label      내려받는 CSV 파일 이름에 붙일 대상 이름
  //   parse      bytes → Promise<kordoc 결과>(기본 root.kordoc.parse)
  //   beforeRead 파일 읽기 전에 부른다(던지면 첨부 중단)
  //   focusOpts  포커스 옮길 때 넘길 선택지 / focusFallback  포커스 돌려놓을 곳이 없을 때의 요소
  // 돌려주는 것: { node(처음 읽을 때 그림), render(), refresh(), attachBytes(name, bytes), apply(p), rematch(p), stats(p), store }
  function attachFlow(opts) {
    const o = Object.assign({ id: 'attach-panel', multiple: false }, opts || {});
    const merge = o.merge === undefined ? !!o.multiple : !!o.merge;
    const S = o.store || {};
    if (!S.pending) S.pending = [];
    if (!S.log) S.log = [];
    if (S.busy === undefined) S.busy = null;
    const val = x => (typeof x === 'function' ? x() : x);
    const findings = () => val(o.findings) || [];
    const fo = () => (o.focusOpts ? o.focusOpts() : { preventScroll: true });
    const parse = b => (o.parse ? o.parse(b) : root.kordoc.parse(b));
    let node = null;

    function rematch(p) {
      const keys = (val(o.deptKeys) || []).map(x => String(x).replace(/\s/g, '')).filter(Boolean);
      const res = root.DCC.attach.match(p.actions, findings(), { year: p.year || undefined, dept: val(o.dept) || undefined });
      const taken = new Set();
      p.rows = res.map(r => {
        // 미리 체크: 기계가 한 짝을 자신 있게 고른 줄(best 있음 = 점수 ≥ 0.45 이고 애매하지 않음)만.
        // 다만 ① 줄에 다른 부서 이름이 적혀 있으면(실물 확인: 위생정책과 줄이 0.45 로 청년정책관 지적에
        // 붙음) 짝만 제안하고 체크하지 않는다. ② 총괄 문서는 요약표·상세표에 같은 조치가 두 번 나오므로
        // 한 지적에는 첫 줄만 체크한다(나머지는 사람이 고를 수 있게 짝만 채워 둔다).
        const d = (r.action.dept || '').replace(/\s/g, '');
        const hit = !!d && keys.some(k => d.includes(k));
        const other = !!d && !hit;
        const firm = !!r.best && !r.ambiguous;
        const on = firm && !other && !taken.has(r.best.id);
        if (on) taken.add(r.best.id);
        // 보이는 줄: 부서 칸이 이 대상(별칭·소속 부서 포함)인 줄, 또는 부서 칸이 비었고(상세표) 짝이 확실한 줄.
        // 그 밖(다른 부서·관련 낮은 줄)은 접어 둔다. 미리 체크되는 줄은 늘 보이는 줄이다.
        return { r, sel: firm ? r.best.id : '', on, other, again: firm && !other && !on, vis: hit || (firm && !other) };
      });
    }
    // 머리 수치는 보이는 줄 기준(전체 줄 수는 따로).
    function stats(p) {
      const vis = p.rows.filter(x => x.vis);
      // matched = 미리 체크된(사람 확인을 기다리는) 줄 수, suggested = 기계가 짝을 자신 있게 고른 줄 수.
      return { rows: p.rows.length, visible: vis.length, folded: p.rows.length - vis.length, matched: vis.filter(x => x.on).length,
        suggested: p.rows.filter(x => x.r.best && !x.r.ambiguous).length, ambiguous: vis.filter(x => x.r.ambiguous).length,
        ambiguousAll: p.rows.filter(x => x.r.ambiguous).length, duplicates: p.duplicates };
    }

    // 확인 표를 만들 뿐 반영은 하지 않는다(자체 시험도 부른다).
    async function attachBytes(fileName, bytes) {
      if (o.beforeRead) o.beforeRead();
      const ext = extOf(fileName);
      let actions, md = '';
      S.busy = fileName;
      // 아주 큰 파일은 먼저 알린다(그래도 읽어 본다).
      const size = bytes ? bytes.byteLength || 0 : 0;
      if (size > BIG_FILE) S.log.push({ kind: 'warn', text: '「' + fileName + '」은(는) 20MB 가 넘습니다(' + (size / 1048576).toFixed(1) +
        'MB). 읽는 데 오래 걸리거나 화면이 잠시 멈춘 듯 보일 수 있습니다. 그래도 읽어 봅니다.' });
      refresh();
      try {
        if (ext === 'csv') {
          actions = root.DCC.attach.fromCsv(decodeText(bytes));
        } else {
          let res;
          // 「읽는 중…」이 먼저 그려지도록 한 번 양보한 뒤 kordoc 을 부른다(parse 는 잠시 화면을 붙잡는다).
          await new Promise(r => setTimeout(r, 0));
          try { res = await parse(bytes); } catch (e) { res = { success: false, error: String((e && e.message) || e) }; }
          if (!res || !res.success) {
            S.log.push({ kind: 'err', text: '「' + fileName + '」 이 파일을 읽지 못했습니다(형식: ' + ((res && res.fileType) || ext || '알 수 없음') +
              '). hwp 라면 한글에서 hwpx 나 pdf 로 다시 저장해 첨부하시거나, 견본 CSV 에 옮겨 적어 첨부해 주십시오.' });
            return { rows: 0, matched: 0, ambiguous: 0, duplicates: 0, error: true };
          }
          md = res.markdown || '';
          actions = root.DCC.attach.extractActions(root.DCC.attach.tableRows(md));
        }
      } finally { S.busy = null; refresh(); }
      const p = { fileName, csv: ext === 'csv', year: root.DCC.attach.guessYear(fileName, md), actions, duplicates: actions.duplicates || 0 };
      if (!actions.length) {
        S.log.push({ kind: 'err', text: '「' + fileName + '」에서 조치 줄(제목과 완료·추진중 같은 상태가 한 줄에 있는 표)을 찾지 못했습니다. 견본 CSV 로 옮겨 주십시오.' });
        refresh();
        return { rows: 0, matched: 0, ambiguous: 0, duplicates: p.duplicates };
      }
      rematch(p);
      S.pending.push(p);
      refresh();
      return stats(p);
    }

    // p 한 파일만(merge 면 모인 파일 전부) 반영한다. 반영한 줄 수를 돌려준다.
    function apply(p) {
      p = p || S.pending[0];
      if (!p) return 0;
      const group = merge ? [...S.pending] : [p];
      let n = 0, dup = 0;
      const seen = new Set(), actions = {};
      for (const q of group) {
        // 보이는 줄이 접힌 줄보다 먼저, 그 안에서는 위 줄이 먼저 반영된다(화면 안내와 같은 순서).
        for (const row of [...q.rows.filter(x => x.vis), ...q.rows.filter(x => !x.vis)]) {
          if (!row.on || !row.sel) continue;
          if (seen.has(row.sel)) { dup++; continue; }
          seen.add(row.sel);
          const a = row.r.action;
          actions[row.sel] = { status: a.status, text: a.text || '', source: q.fileName };
          n++;
        }
      }
      S.pending = S.pending.filter(x => !group.includes(x));
      S.log.push({ kind: 'ok', text: group.map(q => '「' + q.fileName + '」').join('·') + '에서 ' + n + '건을 반영했습니다.' +
        (dup ? ' 같은 지적을 가리킨 줄 ' + dup + '개는 첫 줄만 반영했습니다.' : '') });
      const hadFocus = !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('#' + o.id);
      const before = $(o.id);
      if (o.onApply) o.onApply(actions, { files: group.map(q => q.fileName), n, dup });
      // 부르는 쪽이 칸을 다시 그리지 않았으면 여기서 다시 그린다.
      if (before && $(o.id) === before) refresh();
      // 반영 단추는 사라지므로 포커스를 결과 알림(첨부 칸의 기록)으로 옮긴다.
      if (hadFocus) { const lg = document.querySelector('#' + o.id + ' .att-log'); if (lg) lg.focus(fo()); }
      return n;
    }

    // 첨부 칸만 다시 그린다. 칸 안에 포커스가 있었으면 같은 파일의 연도 고르기나 첨부 단추로 돌려놓는다.
    function refresh() {
      const old = $(o.id);
      if (!old) return;
      const a = document.activeElement, inside = !!a && old.contains(a);
      const fileBox = inside && a.closest('[data-file]');
      const file = fileBox ? fileBox.dataset.file : null;
      const wasYear = inside && a.classList.contains('ysel');
      const n = render();
      old.replaceWith(n);
      if (!inside) return;
      const pend = file ? [...n.querySelectorAll('[data-file]')].find(x => x.dataset.file === file) : null;
      const t = (wasYear && pend && pend.querySelector('.ysel')) || (n.querySelector('#attach-btn:not([disabled])')) || n.querySelector('.att-log') ||
        (o.focusFallback ? o.focusFallback() : null);
      if (t) t.focus(fo());
    }

    function render() {
      const fs = findings();
      const input = el('input', { type: 'file', id: 'attach-input', accept: ACCEPT, multiple: !!o.multiple, class: 'vh', tabindex: '-1',
        'aria-hidden': 'true', onchange: async e => {
          const files = [...e.target.files];
          e.target.value = '';
          for (const f of files) {
            try { await attachBytes(f.name, await f.arrayBuffer()); }
            catch (err) { S.log.push({ kind: 'err', text: '「' + f.name + '」 ' + ((err && err.message) || err) }); refresh(); }
          }
        } });
      const acts = val(o.actions) || {};
      const has = fs.some(f => acts[f.id]);
      const safe = String(val(o.label) || '').replace(/[\\/:*?"<>|]/g, '_');
      // 주 행동(첨부)은 검은 알약, 내려받기는 6px 흰 단추 — 서로 다른 줄에 두어 한 묶음 안에서 섞지 않는다.
      node = el('section', { id: o.id, class: 'panel attach card' },
        el('div', { class: 'att-h' },
          el('div', {}, el('p', { class: 'eyebrow', text: 'ATTACH — 처리결과' }),
            el('h4', { text: '처리결과를 첨부하면 이행 칸이 채워집니다' })),
          el('button', { type: 'button', class: 'btn pill primary', id: 'attach-btn', disabled: !!S.busy,
            onclick: () => input.click(), text: '처리결과 첨부' }), input),
        el('p', { class: 'att-note' }, el('span', { class: 'lock', 'aria-hidden': 'true', text: '●' }),
          '파일은 이 브라우저 안에서만 읽습니다. 어디로도 보내지 않고 저장하지 않습니다. 새로고침하면 사라집니다.'),
        el('div', { class: 'btns att-tools' },
          el('button', { type: 'button', class: 'btn', id: 'csv-template',
            onclick: () => downloadText('처리결과_견본_' + safe + '.csv', root.DCC.attach.templateCsv(findings())), text: '견본 CSV 내려받기' }),
          el('button', { type: 'button', class: 'btn', id: 'csv-export', disabled: !has,
            onclick: () => downloadText('처리결과_반영_' + safe + '.csv', root.DCC.attach.exportCsv(findings(), val(o.actions) || {})), text: '반영 결과 CSV 내려받기' })),
        el('p', { class: 'muted small', text: '행정사무감사 지적사항 처리결과(hwp·hwpx·pdf·xlsx·xls) 또는 견본 CSV 를 고르십시오. ' +
          (o.multiple ? '여러 개를 한꺼번에 골라도 됩니다. ' : '') +
          '짝은 기계가 제안할 뿐이며, 확인 표에서 「반영」을 체크한 줄만 이행 칸에 들어갑니다. 결과를 남기려면 「반영 결과 CSV 내려받기」를 쓰십시오.' }),
        S.busy ? el('p', { class: 'att-busy', role: 'status', text: '「' + S.busy + '」 읽는 중… (큰 pdf 는 몇 초 걸립니다)' }) : null,
        S.log.length ? el('ul', { class: 'att-log', role: 'status', tabindex: '-1' },
          S.log.map(m => el('li', { class: m.kind, text: m.text }))) : null,
        merge ? (S.pending.length ? renderGroup(S.pending) : null) : S.pending.map(p => renderGroup([p])));
      return node;
    }

    // 한 파일의 머리·확인 표(·접힌 줄). upd 는 반영 단추 글자를 고친다.
    function renderFile(p, upd) {
      const years = [...new Set(findings().map(f => f.year).concat(p.year ? [p.year] : []))].sort((a, b) => b - a);
      const ysel = el('select', { class: 'ysel', 'aria-label': '지적 연도',
        onchange: () => { p.year = ysel.value ? Number(ysel.value) : null; rematch(p); refresh(); } },
        el('option', { value: '', text: '모든 연도' }), years.map(y => el('option', { value: String(y), text: y + '년' })));
      ysel.value = p.year ? String(p.year) : '';
      const st = stats(p);
      const head = () => el('thead', {}, el('tr', {}, ['처리결과의 조치 줄', '제안된 짝', '짝 고르기', ''].map(h => el('th', { text: h }))));
      const rel = p.rows.filter(x => x.vis), rest = p.rows.filter(x => !x.vis);
      const table = el('div', { class: 'table-scroll' }, el('table', { class: 'confirm' }, head(),
        el('tbody', {}, rel.map(row => renderConfirmRow(row, upd)))));
      let restBox = null;
      if (rest.length) {
        const tb = el('tbody', {});
        restBox = el('details', { class: 'rest' },
          el('summary', { text: '다른 부서·관련 낮은 줄 ' + rest.length + '개 보기 (부서 칸이 다른 부서이거나, 부서 칸이 비었는데 확실한 짝이 없는 줄)' }),
          el('div', { class: 'table-scroll' }, el('table', { class: 'confirm' }, head(), tb)));
        restBox.addEventListener('toggle', () => { if (restBox.open && !tb.firstChild) append(tb, rest.map(row => renderConfirmRow(row, upd))); });
      }
      return [
        el('div', { class: 'pend-h' },
          el('strong', { class: 'fname', text: p.fileName }),
          el('span', { class: 'muted small', text: '전체 ' + st.rows + '줄 중 이 대상 조치 줄 ' + st.visible + '줄 · 미리 체크 ' + st.matched + '줄 · 후보가 비슷한 줄 ' + st.ambiguous + '줄' }),
          st.duplicates ? badge('중복 ' + st.duplicates + '줄 제외', 'dup') : null,
          el('label', { class: 'ylbl' }, '지적 연도 ', ysel),
          p.csv ? el('span', { class: 'hint', text: 'CSV 의 연도 칸이 있으면 그것이 먼저입니다' }) : null),
        rel.length ? table : el('p', { class: 'empty', text: '이 대상과 관련 있어 보이는 줄이 없습니다. 다른 부서의 처리결과이거나 연도가 다를 수 있습니다(연도를 「모든 연도」로 바꿔 보십시오).' }),
        restBox];
    }

    // 파일 하나(집행부) 또는 모인 파일 전부(merge)를 한 반영 단추로 묶는다.
    function renderGroup(group) {
      const applyBtn = el('button', { type: 'button', class: 'btn pill primary apply', onclick: () => apply(group[0]) });
      const upd = () => {
        const n = group.reduce((k, p) => k + p.rows.filter(x => x.on && x.sel).length, 0);
        applyBtn.textContent = '확인한 것 반영 (' + n + '줄)';
        applyBtn.disabled = n === 0;
      };
      upd();
      const foot = el('div', { class: 'pend-f' }, applyBtn,
        el('span', { class: 'muted small', text: '체크한 줄만 반영됩니다. 같은 지적에 두 줄을 고르면 위 표의 위쪽 줄이 먼저이고, 접힌 줄은 그 뒤입니다.' }),
        el('button', { type: 'button', class: 'btn close-f', onclick: () => { S.pending = S.pending.filter(x => !group.includes(x)); refresh(); },
          text: group.length > 1 ? '모두 닫기' : '이 파일 닫기' }));
      if (!merge) return el('div', { class: 'pending', dataset: { file: group[0].fileName } }, renderFile(group[0], upd), foot);
      return el('div', { class: 'pending merged' },
        group.map(p => el('div', { class: 'pend-file', dataset: { file: p.fileName } }, renderFile(p, upd))), foot);
    }

    function renderConfirmRow(row, upd) {
      const r = row.r, a = r.action;
      const name = (a.no ? a.no + '. ' : '') + (a.title.length > 40 ? a.title.slice(0, 40) + '…' : a.title);
      const cb = el('input', { type: 'checkbox', 'aria-label': '반영: ' + name });
      const tr = el('tr', { class: row.on && row.sel ? 'on' : null });
      const sync = () => { cb.checked = row.on; cb.disabled = !row.sel; tr.classList.toggle('on', row.on && !!row.sel); upd(); };
      cb.addEventListener('change', () => { row.on = cb.checked; sync(); });
      const sel = el('select', { 'aria-label': '짝 고르기: ' + name },
        el('option', { value: '', text: '짝 없음' }),
        r.candidates.map(c => el('option', { value: c.finding.id, text: fLabel(c.finding) + ' (' + c.score.toFixed(2) + ')' })));
      sel.value = row.sel;
      sel.addEventListener('change', () => { row.sel = sel.value; row.on = !!row.sel; sync(); });
      let sug;
      if (r.best && !r.ambiguous) sug = [el('span', { class: 'sug-t', text: fLabel(r.best) }), ' ', el('span', { class: 'score', text: r.score.toFixed(2) }),
        row.other ? el('span', { class: 'amb blk', text: '다른 부서의 줄 — 맞는지 확인하십시오' }) : null,
        row.again ? el('span', { class: 'muted blk', text: '위 줄과 같은 지적(요약표·상세표 반복으로 보임)' }) : null];
      else if (r.ambiguous && r.score > 0) sug = el('span', { class: 'amb', text: '후보가 비슷함 — 직접 고르십시오' });
      else sug = el('span', { class: 'muted', text: r.score > 0 ? '알맞은 짝 없음 (가장 가까운 점수 ' + r.score.toFixed(2) + ')' : '알맞은 짝 없음' });
      cb.checked = row.on; cb.disabled = !row.sel;
      return append(tr, [
        // 상세표 줄은 조치 문단 전체가 제목 칸으로 잡히기도 해 90자로 줄여 보이고, 전체는 마우스를 올리면 보인다.
        el('td', { class: 'act' }, el('span', { class: 'a-t', title: a.title.length > 90 ? a.title : null,
          text: (a.no ? a.no + '. ' : '') + (a.title.length > 90 ? a.title.slice(0, 90) + '…' : a.title) }),
          el('span', { class: 'a-m' }, el('span', { class: 'st ' + statusCls(a.status), text: a.status }),
            a.dept ? el('span', { class: 'muted', text: a.dept }) : null, a.year ? el('span', { class: 'muted', text: a.year + '년' }) : null)),
        el('td', { class: 'sug' }, sug),
        el('td', { class: 'pick' }, sel),
        el('td', { class: 'ok-c' }, el('label', { class: 'inc' }, cb, '반영'))]);
    }

    return {
      get node() { return node || render(); },
      render, refresh, attachBytes, apply, rematch, stats, store: S,
    };
  }

  // ---------- 예보 꾸밈(2026-09-29 사용자 승인): 두 페이지 시작 화면의 레이더·등압선 배경, 발표 줄, 「전체 예보」 띠 ----------
  // 배경은 글자 뒤 장식일 뿐이다(aria-hidden, 누를 수 없음). 움직임은 CSS transform 회전 하나이고
  // prefers-reduced-motion: reduce 이면 멈춘다(style.css .fc-sweep). 그림은 모두 인라인 SVG — 바깥 파일 없음.
  // 등압선: 두 중심 둘레의 물결진 닫힌 곡선(모양은 고정 — 자료와 무관).
  function isobar(cx, cy, r, ph) {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const t = i / 48 * Math.PI * 2;
      const k = r * (1 + 0.09 * Math.sin(3 * t + ph) + 0.05 * Math.sin(5 * t + ph * 2));
      pts.push((cx + k * Math.cos(t) * 1.6).toFixed(1) + ' ' + (cy + k * Math.sin(t)).toFixed(1));
    }
    return 'M' + pts.join('L') + 'Z';
  }
  function radarBg() {
    const iso = svg('svg', { class: 'fc-iso', viewBox: '0 0 1200 420', preserveAspectRatio: 'xMidYMid slice', focusable: 'false' });
    for (let i = 1; i <= 6; i++) iso.appendChild(svg('path', { d: isobar(150, 360, 42 * i, 0.6), fill: 'none' }));
    for (let i = 1; i <= 5; i++) iso.appendChild(svg('path', { d: isobar(1070, 40, 46 * i, 2.1), fill: 'none' }));
    const rings = svg('svg', { class: 'fc-rings', viewBox: '0 0 200 200', focusable: 'false' },
      [30, 55, 80, 99].map(r => svg('circle', { cx: 100, cy: 100, r, fill: 'none' })),
      svg('path', { d: 'M100 1V199M1 100H199', fill: 'none' }));
    return el('div', { class: 'fc-bg', 'aria-hidden': 'true' }, iso,
      el('div', { class: 'fc-radar' }, rings, el('div', { class: 'fc-sweep' })));
  }
  // 발표 줄: 「의회 예보 · {자료 기준일} 발표 · 공개자료 기준」 — 날짜는 머리 「갱신」과 같은 DCC_DATA.generated.
  function forecastHead(data) {
    return el('p', { id: 'fc-head', class: 'fc-head' }, el('span', { class: 'fc-live', 'aria-hidden': 'true' }),
      '의회 예보 · ', el('span', { class: 'mono', text: (data && data.generated) || '(날짜 없음)' }), ' 발표 · 공개자료 기준');
  }
  // 「전체 예보」 띠: 자료 전체의 수(core.overview). 부서별 수가 아니다. opts.committees 이면 상임위 수를 덧붙인다(의원용).
  function forecastStrip(ov, opts) {
    const item = (k, cls, label, n, unit) => el('li', { class: 'fc-i ' + cls, dataset: { k, n: String(n) } },
      el('i', { class: 'kdot', 'aria-hidden': 'true' }), el('span', { class: 'fc-l', text: label }), ' ',
      el('span', { class: 'fc-v' }, el('b', { class: 'mono', text: Number(n).toLocaleString('ko-KR') }), unit));
    const period = ov.from && ov.to ? (ov.from === ov.to ? String(ov.from) : ov.from + '~' + ov.to) : '—';
    return el('section', { id: 'fc-strip', class: 'fc-strip', 'aria-label': '전체 예보 — 자료 전체의 건수(부서별 아님)' },
      el('p', { class: 'fc-tag', text: '전체 예보' }),
      el('ul', { class: 'fc-list' },
        item('findings', 'cat-find', '행감 지적', ov.findings, '건'),
        item('recurring', 'cat-rec', '되풀이', ov.recurring, '줄기'),
        item('promises', 'cat-prom', '답변 속 약속', ov.promises, '건'),
        opts && opts.committees ? item('committees', 'cat-exec', '상임위', ov.committees, '곳') : null,
        el('li', { class: 'fc-i fc-period', dataset: { k: 'period', n: period } }, el('span', { class: 'fc-l', text: '기간' }), ' ',
          el('span', { class: 'fc-v' }, el('b', { class: 'mono', text: period }), '년'))));
  }

  // ---------- 날씨 그림(의원용에만 — 직원용 화면은 부르지 않는다) ----------
  // w 는 councilCore.weather() 의 값. 모양이 날씨마다 달라 색만으로 가르지 않고, role=img + aria-label(「흐림 — 물을 거리 5~9건」)을 단다.
  const CLOUD = 'M4.5 12.5H11.5A2.5 2.5 0 0 0 11.5 7.5A3.5 3.5 0 0 0 4.8 7.2A2.65 2.65 0 0 0 4.5 12.5Z';
  function sunParts(cx, cy, r, ray) {
    const out = [svg('circle', { class: 'wx-s', cx, cy, r, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 })];
    let d = '';
    for (let i = 0; i < 8; i++) {
      const t = i / 8 * Math.PI * 2, a = r + 1.3, b = r + 1.3 + ray;
      d += 'M' + (cx + a * Math.cos(t)).toFixed(2) + ' ' + (cy + a * Math.sin(t)).toFixed(2) + 'L' + (cx + b * Math.cos(t)).toFixed(2) + ' ' + (cy + b * Math.sin(t)).toFixed(2);
    }
    out.push(svg('path', { class: 'wx-s', d, stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round' }));
    return out;
  }
  function wxIcon(w, label) {
    const g = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, focusable: 'false', role: 'img', 'aria-label': label === false ? null : (label || w.label),
      'aria-hidden': label === false ? 'true' : null, class: 'wx wx-' + w.key, 'data-wx': w.icon });
    const cloud = tf => svg('path', { class: 'wx-c', d: CLOUD, transform: tf || null, fill: 'var(--card)', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
    let parts;
    if (w.key === 'sun') parts = sunParts(8, 8, 3, 1.6);
    else if (w.key === 'partly') parts = [...sunParts(10.6, 5.2, 2.1, 1.1), cloud('translate(-1.6 1.4)')];
    else if (w.key === 'rain') parts = [cloud('translate(0 -3)'),
      svg('path', { class: 'wx-d', d: 'M5.6 11.6l-.9 2.3M8.6 11.6l-.9 2.3M11.6 11.6l-.9 2.3', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round' })];
    else parts = [cloud('translate(-1.2 -1.2)'), svg('path', { class: 'wx-c2', d: 'M6.4 14.2H13.4A2 2 0 0 0 13.9 10.3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round' })];
    parts.forEach(p => g.appendChild(p));
    return g;
  }
  // 범례: 날씨 = 물을 거리 건수 기준(평가 아님). 구간마다 그림 + 「맑음 0건」 글자(그림은 글자와 겹치므로 aria-hidden).
  function wxLegend(scale, id) {
    return el('div', { id: id || null, class: 'wx-legend' },
      el('p', { class: 'wx-lt', text: '날씨 = 물을 거리 건수 기준(평가 아님)' }),
      el('ul', { class: 'wx-ll' }, scale.map(w => el('li', {}, wxIcon(w, false), el('span', { text: w.icon }), ' ',
        el('span', { class: 'mono muted', text: w.range })))));
  }

  // ---------- 후보 목록 · 프롬프트 미리 보기(의원용 질문 후보와 집행부 프롬프트 탭이 함께 쓴다, 2026-09-29) ----------
  // candList(o): 묶음(분류색) · 체크 상자 · 한 줄 제목 · 근거 펼침 · 「전부 고르기/모두 풀기」 · 고른 수.
  //  o = { id?, eyebrow, title, lead, countLabel?, selected: Set(호출 쪽 state 의 것 — 여기서 add/delete 한다),
  //        groups: [{ cls, kind, title, items: [{ id, title, year?, tags?: [노드], sub?: 소제목, evidence, more?: () => 노드 }], empty?, foot?, count? }],
  //        onChange(how) — 'one'·'all'·'none' }
  // 고름은 메모리(selected)에만 둔다 — 저장하지 않고 주소에도 넣지 않는다.
  const cssId = id => String(id).replace(/[^A-Za-z0-9_-]/g, c => '_' + c.charCodeAt(0).toString(16));
  function candList(o) {
    const sel = o.selected;
    const all = o.groups.flatMap(g => g.items.map(x => x.id));
    const allOn = all.length > 0 && all.every(id => sel.has(id));
    const node = el('section', { id: o.id || 'cand-list', class: 'sec cand-list' });
    const pickAll = el('button', { type: 'button', id: 'pick-all', class: 'btn', disabled: !all.length, 'aria-pressed': allOn ? 'true' : 'false',
      onclick: () => {
        const on = !all.every(id => sel.has(id));
        all.forEach(id => (on ? sel.add(id) : sel.delete(id)));
        node.querySelectorAll('input.cand').forEach(cb => { cb.checked = sel.has(cb.dataset.id); });
        candSync(node);
        if (o.onChange) o.onChange(on ? 'all' : 'none');
        prefs.announce(on ? '후보 ' + all.length + '개를 모두 골랐습니다' : '고른 후보를 모두 풀었습니다');
      }, text: allOn ? '모두 풀기' : '전부 고르기' });
    const row = x => {
      const cb = el('input', { type: 'checkbox', class: 'cand', dataset: { id: x.id }, 'aria-describedby': 'ev-' + cssId(x.id),
        onchange: e => { if (e.target.checked) sel.add(x.id); else sel.delete(x.id); candSync(node); if (o.onChange) o.onChange('one'); } });
      cb.checked = sel.has(x.id);
      return el('li', { class: 'cand-row', dataset: { id: x.id } },
        el('label', { class: 'cand-l' }, cb, el('span', { class: 'cand-t', text: x.title || '(제목 없음)' }), x.tags || null,
          x.year ? el('span', { class: 'yr mono', text: String(x.year) }) : null),
        el('details', { class: 'ev' }, el('summary', { text: '근거' }),
          el('p', { class: 'ev-t', id: 'ev-' + cssId(x.id), text: x.evidence }),
          x.more ? x.more() : null));
    };
    // 소제목(sub)이 바뀌는 곳마다 한 줄 머리(예: 되풀이 줄기 R001 · 2023→2025)를 끼운다.
    const rows = items => {
      const out = [];
      let last = null;
      for (const x of items) {
        if (x.sub && x.sub !== last) out.push(el('li', { class: 'cand-sub', text: x.sub }));
        last = x.sub || null;
        out.push(row(x));
      }
      return out;
    };
    return append(node, [
      el('div', { class: 'sec-h' },
        el('div', { class: 'sec-t' }, el('p', { class: 'eyebrow', text: o.eyebrow }), el('h3', { text: o.title }),
          el('p', { class: 'muted small' }, o.lead, ' ' + (o.countLabel || '고른 후보') + ' ',
            el('span', { id: 'picked-n', class: 'mono', text: String(all.filter(id => sel.has(id)).length) }), '개.')),
        el('div', { class: 'sec-tools' }, pickAll)),
      o.groups.map(g => el('section', { class: 'cand-group ' + (g.cls || ''), dataset: { kind: g.kind } },
        el('h4', { class: 'cg-h' }, el('i', { class: 'kdot', 'aria-hidden': 'true' }), el('span', { text: g.title }),
          el('span', { class: 'gc mono', text: String(g.count !== undefined ? g.count : g.items.length) })),
        g.items.length ? el('ul', { class: 'cands' }, rows(g.items)) : (g.empty ? el('p', { class: 'empty', text: g.empty }) : null),
        g.foot || null))]);
  }
  // 고른 수·「전부 고르기/모두 풀기」 글자를 체크 상자 상태에 맞춘다(list 를 안 주면 #cand-list).
  function candSync(list) {
    const node = list || $('cand-list');
    if (!node) return 0;
    const cs = [...node.querySelectorAll('input.cand')];
    const n = cs.filter(cb => cb.checked).length;
    const pn = node.querySelector('#picked-n'); if (pn) pn.textContent = String(n);
    const allOn = cs.length > 0 && cs.every(cb => cb.checked);
    const pa = node.querySelector('#pick-all');
    if (pa) { pa.textContent = allOn ? '모두 풀기' : '전부 고르기'; pa.setAttribute('aria-pressed', allOn ? 'true' : 'false'); }
    return n;
  }

  // previewBox(o): 복사될 글을 그대로 보이는 읽기 전용 칸(#prompt-preview-box). 글자 수 · 첨부 경고 · 생략 안내 · 빈 때 안내 · 복사 단추.
  //  o = { hidden?, hint, warn, onCopy, copyId?, extra?: [노드] }. 내용은 fillPreview 로 채운다.
  function previewBox(o) {
    return el('div', { id: 'prompt-preview-box', class: 'pp-box', role: 'region', 'aria-label': '프롬프트 미리 보기', hidden: !!o.hidden },
      el('div', { class: 'pp-h' },
        el('strong', { class: 'pp-t', text: '프롬프트 미리 보기' }),
        el('span', { id: 'pp-count', class: 'p-count small', 'aria-live': 'off' }),
        el('button', { type: 'button', id: o.copyId || 'pp-copy', class: 'btn ink pp-copy', onclick: o.onCopy, text: '복사' }),
        o.extra || null),
      el('p', { id: 'pp-attach-warn', class: 'att-warn', hidden: true, text: o.warn }),
      el('p', { id: 'pp-omit', class: 'note small', hidden: true }),
      el('p', { id: 'pp-hint', class: 'pp-hint small', text: o.hint }),
      el('pre', { id: 'prompt-preview', class: 'pp-text', tabindex: '0', 'aria-label': '프롬프트 원문(읽기 전용) — 복사되는 글과 같습니다' }));
  }
  // q(id) → 요소. v = { none, text, count, omit, warn, copyId? }. 아무것도 안 골랐으면(none) 글 대신 안내를 보이고 복사를 끈다.
  function fillPreview(q, v) {
    const pre = q('prompt-preview'), hint = q('pp-hint'), count = q('pp-count'), note = q('pp-omit'), w = q('pp-attach-warn');
    if (!pre) return;
    pre.textContent = v.none ? '' : v.text;
    pre.hidden = !!v.none; hint.hidden = !v.none;
    const cp = q(v.copyId || 'pp-copy'); if (cp) cp.disabled = !!v.none;
    count.textContent = v.none ? '' : v.count;
    note.hidden = !!v.none || !v.omit;
    note.textContent = v.none ? '' : (v.omit || '');
    if (w) w.hidden = !!v.none || !v.warn;
  }

  const kit = { el, append, svg, $, clear, comName, badge, icon, statusIcon, statusCls, prefs, copyText, downloadText, attachFlow,
    radarBg, forecastHead, forecastStrip, wxIcon, wxLegend, cssId, candList, candSync, previewBox, fillPreview };
  root.DCC = root.DCC || {};
  root.DCC.kit = kit;
  if (typeof module !== 'undefined' && module.exports) module.exports = kit;
})(typeof window !== 'undefined' ? window : globalThis);
