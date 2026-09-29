// 역할: 화면 그리기. 부서(또는 실·국)를 고르면 탭 화면(요약·지적·되풀이·약속·예산·자료 범위·프롬프트)을 그린다.
// 구조는 업무 도구 꼴(Task 4c): 왼쪽 실·국→부서 나무 목록, 위 탭(건수 뱃지), 번호 붙은 지적 목록(이행 상태별·
// 연도별 묶음), 오른쪽 상세 패널, Ctrl+K·「/」 빠른 검색. 겉모양 규칙은 docs/design/적용_원칙.md.
// 자료 문자열은 모두 textContent(텍스트 노드)로만 넣는다 — innerHTML 에 자료를 넣지 않는다(XSS 방지).
// 부서 순위표·TOP N 은 만들지 않는다. 약속의 부서는 추정이므로 「추정 — 확인 필요」로 따로 보인다.
// 첨부 칸(#attach-panel, 지적 탭 머리): 처리결과 파일을 이 브라우저 안에서만 읽어(kordoc·CSV) 조치 줄을 뽑고,
// 기계가 제안한 짝을 사람이 확인한 것만 이행 칸(.impl[data-fid])에 반영한다. 첨부 내용·조치 상태는
// 메모리(state)에만 두고 localStorage·IndexedDB 에 쓰지 않는다 — 새로고침하면 사라진다.
// 프롬프트 탭(#prompt-panel): 세 종류 단추 → 넣을 자료 후보 목록(종류별 기본 고르기) → 읽기 전용 미리 보기 → 복사(복사 직전 maskNames).
// 주소에 ?dept=이름 또는 ?silguk=이름 (그리고 &tab=findings 등)을 붙이면 미리 고른다.
// 글자 크기(&fs=90·112·125·140)와 테마(&theme=light·dark)도 주소에만 남긴다 — 저장소에 쓰지 않는다(Task 4e).
// 시작 화면은 가운데 큰 부서 검색창(#start-q)과 실·국 바로가기(가나다순, 순위 아님). 「처음으로」·도구 이름이 홈.
// 시작 화면은 일기 예보 꼴(2026-09-29): 레이더·등압선 배경, 발표 줄, 「전체 예보」 띠(자료 전체 수, kit.forecastStrip).
// 직원용에는 부서별 날씨 그림·등급을 두지 않는다(순위·낙인 없음 — 날씨 그림은 의원용에만).
// 시작 화면(아무것도 고르지 않음)에서는 사이드바를 감추고 본문이 온 폭을 쓴다(.shell.start) — 부서·실·국을
// 고르면(render) 사이드바가 나오고, 「처음으로」로 돌아가면 다시 감춘다(2026-09-29 사용자 요청).
(function (root) {
  // 겉모양 도구(요소 만들기·글자 크기·테마·첨부 흐름·복사·내려받기)는 kit.js 에서 가져다 쓴다(4차 Task 3).
  // 요약·지적·되풀이·약속·예산·자료 범위 탭, 탭 줄, 상세 패널은 deptview.js(의원용과 공용, 2026-09-29)에서 그린다.
  const kit = root.DCC.kit;
  const { el, append, $, clear, badge, icon, prefs } = kit;
  // 지자체별 값(지자체·의회 이름, 의회 누리집 주소)은 굽는 때 config/region.json 에서 넣는다(Task 4b).
  const region = () => root.DCC_REGION || {};
  const BUCKETS = new Set(['여러 부서 공통', '미상']);
  const SILGUK_LABEL = { '기타': '기타 (소속 미확인)' };

  const KINDS = [['행감대비', '행감 대비'], ['업무보고대비', '업무보고 대비'], ['답변서초안', '답변서 초안']];
  // [탭 id, 탭 이름, 칸 머리말(고정폭 대문자)]
  const TABS = [['summary', '요약', 'SUMMARY'], ['findings', '지적', 'FINDINGS'], ['recurring', '되풀이', 'RECURRING'],
    ['promises', '약속', 'PROMISES — ESTIMATED'], ['budget', '예산', 'BUDGET'], ['coverage', '자료 범위', 'SOURCES'],
    ['prompt', '프롬프트', 'PROMPT']];
  const TAB_IDS = new Set(TABS.map(t => t[0]));

  // actions: {지적 id: {status, text, source}} — 사람이 확인해 반영한 것만. pending: 확인 기다리는 첨부 파일.
  // 모두 메모리에만 있다(저장하지 않음).
  // include: 프롬프트에 넣을 지적·약속 id(후보 목록과 약속 탭 「프롬프트에 포함」이 함께 쓴다). pick: 고른 종류·손댐 여부.
  const state = { target: null, summary: null, actions: {}, include: new Set(), ix: null, fById: null,
    pending: [], log: [], busy: null, pick: { kind: null, touched: false, from: null }, dataYears: null, promiseShown: 0, reopened: new Set(),
    tab: 'summary', groupBy: 'status', detail: null, open: new Set(), fs: 100, theme: 'auto' };

  // ---------- 작은 DOM 도우미(el·svg·badge 등은 kit.js) ----------
  const ko = (a, b) => a.localeCompare(b, 'ko');
  const isSilguk = () => state.target.kind === 'silguk';
  const targetKey = t => (t ? t.kind + ':' + t.name : '');
  // 다시 그린 뒤 포커스를 옮길 때: 마우스로 누른 뒤라면 포커스 테두리를 새로 띄우지 않고, 키보드로 왔으면 띄운다.
  let byPointer = false;
  const focusOpts = () => ({ preventScroll: true, focusVisible: !byPointer });
  const isTyping = n => !!n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));

  // 탭 그리기(요약·지적·되풀이·약속·예산·자료 범위·탭 줄·상세 패널)는 deptview.js 공용 모듈 — 의원용 부서 화면도 같은 것을 쓴다.
  const view = root.DCC.deptview.create({
    state, tabs: TABS, promiseCheck: true,
    // 약속 탭의 「프롬프트에 포함」도 같은 고름(state.include)을 바꾼다 — 종류를 고른 뒤라면 손댄 것으로 친다.
    onInclude: () => { if (pickOf().kind) pickOf().touched = true; },
    setTab: (tab, focus) => setTab(tab, focus), rerender: () => render(), renderAttach: () => renderAttach(),
    focusOpts: () => focusOpts(),
    detailFoot: f => el('button', { type: 'button', id: 'detail-draft', class: 'btn pill primary', onclick: () => openPrompt('답변서초안', f.id), text: '이 건 답변서 초안' }),
  });
  const { renderTabs, renderSummary, renderFindings, renderRecurring, renderPromises, renderBudget, renderCoverage,
    renderDetail, openDetail, closeDetail, dropDetail, trapTab, drawCharts, reopenedIds, implText, eyebrow, phone } = view;

  // ---------- 시작: 틀(사이드바·머리·몸통·상세·빠른 검색) ----------
  function start() {
    document.body.dataset.ready = '0';
    // 최종 검토 수정 1: 마감 연도는 자료 생성일(generated)의 해로 판정한다(보는 PC 의 시계 아님).
    state.ix = root.DCC.core.index(root.DCC_DATA, root.DCC.core.dataYear(root.DCC_DATA, new Date().getFullYear()));
    state.fById = new Map(root.DCC_DATA.findings.map(f => [f.id, f]));
    readPrefs();
    applyPrefs();
    const app = clear($('app'));
    app.className = 'shell';
    app.appendChild(renderSide());
    app.appendChild(el('div', { class: 'main-col' }, renderHeader(),
      el('main', { id: 'body', class: 'body' }, renderWelcome()), renderFooter()));
    app.appendChild(el('div', { id: 'scrim', class: 'scrim', hidden: true, onclick: () => { closeDrawer(); closeDetail(); } }));
    app.appendChild(el('aside', { id: 'detail', class: 'detail', hidden: true, role: 'dialog', 'aria-labelledby': 'detail-title', onkeydown: trapTab }));
    app.appendChild(renderQuickSearch());
    setStartMode(true);   // 첫 그림 전에 정한다 — 주소에 dept·silguk 이 있으면 아래 select 가 바로 되돌린다
    // 화면 낭독기용 알림(글자 크기·테마 바뀜). 보이지 않는다.
    app.appendChild(el('p', { id: 'live', class: 'vh', role: 'status', 'aria-live': 'polite' }));
    applyPrefs();
    document.addEventListener('keydown', globalKeys);
    document.addEventListener('pointerdown', () => { byPointer = true; }, true);
    document.addEventListener('keydown', () => { byPointer = false; }, true);
    const q = new URLSearchParams(location.search);
    if (TAB_IDS.has(q.get('tab'))) state.tab = q.get('tab');
    if (q.get('dept')) select({ kind: 'dept', name: q.get('dept') });
    else if (q.get('silguk')) select({ kind: 'silguk', name: q.get('silguk') });
    else { const sq = $('start-q'); if (sq) sq.focus({ preventScroll: true }); }
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawCharts, 150); });
    // 자체 시험(Task 8)은 이 파일에 두지 않는다 — 시험 전용 산출물에만 별도 스크립트로 따로 붙는다
    // (오프라인 스캔이 이름 그대로의 브라우저 통신 API 글자를 못 찾게). 있으면 부른다.
    if (root.DCC.ui.onReady) root.DCC.ui.onReady();
  }

  // 머리 줄(본문 위): 폰 메뉴 단추 · 처음으로 · 위치 · 자료 기준일 · 글자 크기 · 테마 · 검색 단추.
  function renderHeader() {
    return el('header', { class: 'topbar' },
      el('button', { type: 'button', id: 'menu-btn', class: 'icon-btn menu-btn', 'aria-label': '부서 목록 열기', 'aria-controls': 'side',
        'aria-expanded': 'false', onclick: toggleDrawer }, icon('menu')),
      el('button', { type: 'button', id: 'home-btn', class: 'btn home-btn', onclick: goHome, 'aria-label': '처음으로 (시작 화면)', title: '처음으로 (시작 화면)' },
        icon('home'), el('span', { class: 'hb-t', text: '처음으로' })),
      el('p', { id: 'crumbs', class: 'crumbs', text: root.DCC_BRAND.name }),
      // 「갱신」은 자료 생성일이다. 화면을 굽은 날이 다르면 괄호로 따로 적는다.
      el('p', { class: 'meta' }, '공개자료 기준 · 갱신 ', el('span', { id: 'data-date', class: 'mono', text: root.DCC_DATA.generated || '(날짜 없음)' }),
        root.DCC_BUILT && root.DCC_BUILT !== root.DCC_DATA.generated ? ' (화면 생성 ' + root.DCC_BUILT + ')' : ''),
      el('div', { class: 'top-tools' },
        prefs.controls(state, onPrefChange),
        el('button', { type: 'button', class: 'btn kbd-btn', onclick: () => openQS(), 'aria-label': '부서 검색 (Ctrl+K)' },
          icon('search'), el('span', { class: 'kb-t', text: '검색' }), el('kbd', { text: 'Ctrl K' }))));
  }

  // ---------- 글자 크기·테마(저장하지 않음 — 주소 &fs= &theme= 에만) ----------
  // 읽기·적용·단추는 kit.prefs. 값이 바뀌면 주소를 고치고, 글자 크기면 그래프를 다시 그린다.
  const homeHref = () => prefs.homeHref(state);
  const readPrefs = () => prefs.read(state);
  const applyPrefs = () => prefs.apply(state);
  function onPrefChange(kind) { syncUrl(); if (kind === 'fs') drawCharts(); }
  const setFs = v => prefs.setFs(state, v, onPrefChange);
  const stepFs = d => prefs.stepFs(state, d, onPrefChange);
  const cycleTheme = () => prefs.cycleTheme(state, onPrefChange);

  // ---------- 홈: 시작 화면으로(주소의 dept·silguk·tab 을 지우고 fs·theme 는 남긴다) ----------
  function goHome() {
    // 확인 표에서 사람이 고친 짝은 대상별로 남겨 둔다(select 와 같은 규칙).
    const oldKey = targetKey(state.target);
    for (const p of state.pending) { p.saved = p.saved || {}; if (oldKey && p.rows) p.saved[oldKey] = { rows: p.rows, year: p.year }; }
    closeQS(false); closeDrawer();
    dropDetail();
    state.target = null; state.summary = null; state.tab = 'summary';
    resetPick(); state.promiseShown = 0;
    clear($('body')).appendChild(renderWelcome());
    setStartMode(true);
    const c = $('crumbs'); if (c) c.textContent = root.DCC_BRAND.name;
    updateTree();
    syncUrl();
    document.body.dataset.ready = '0';
    window.scrollTo(0, 0);
    const q = $('start-q'); if (q) q.focus(focusOpts());
  }

  // ---------- 왼쪽 사이드바: 브랜드 · 검색 단추 · 실·국 → 부서 나무 ----------
  function renderSide() {
    return el('aside', { id: 'side', class: 'side', 'aria-label': '부서 목록' },
      el('div', { class: 'side-brand' },
        el('p', { class: 'b-name' }, el('a', { class: 'b-home', id: 'brand-home', href: homeHref(), title: '처음으로 (시작 화면)',
          onclick: e => { e.preventDefault(); goHome(); } }, root.DCC_BRAND.name)),
        el('p', { class: 'b-sub', text: root.DCC_BRAND.subtitle })),
      el('button', { type: 'button', id: 'side-search', class: 'side-search', onclick: () => openQS() },
        icon('search'), el('span', { class: 'ss-t', text: '부서 검색' }), el('kbd', { text: 'Ctrl K' })),
      el('p', { class: 'eyebrow side-eb', text: 'OFFICES' }),
      el('nav', { id: 'tree', class: 'tree', 'aria-label': '실·국과 부서' }, renderTree()));
  }
  // 실·국마다 현행 부서만 두고, 지금 조직도에 없는 부서는 맨 아래 「옛 부서」 묶음으로 모은다.
  // 「여러 부서 공통」「미상」은 목록에 두지 않는다. 부서 이름은 가나다순(순위 아님).
  // 「기타」(소속 미확인) 실·국은 현행 부서가 없으면 「옛 부서」 묶음 안에 머리(누르면 실·국 합산)와 함께 둔다.
  function treeGroups() {
    const ix = state.ix, groups = [], old = [];
    let etc = null;
    for (const g of root.DCC.core.silguks(ix)) {
      if (BUCKETS.has(g.name)) continue;
      const cur = g.depts.filter(n => (ix.depts.get(n) || {}).current);
      const gone = g.depts.filter(n => !(ix.depts.get(n) || {}).current);
      if (g.name === '기타' && !cur.length) { etc = { silguk: g.name, label: SILGUK_LABEL[g.name], depts: gone }; continue; }
      gone.forEach(n => old.push(n));
      if (cur.length) groups.push({ key: 'sg:' + g.name, silguk: g.name, label: SILGUK_LABEL[g.name] || g.name, depts: cur });
    }
    if (old.length || etc) groups.push({ key: 'old', silguk: null, label: '옛 부서', depts: old.sort(ko), sub: etc,
      count: old.length + (etc ? etc.depts.length : 0) });
    return groups;
  }
  function renderTree() {
    const t = state.target;
    const selDept = t && t.kind === 'dept' ? t.name : null, selSg = t && t.kind === 'silguk' ? t.name : null;
    return treeGroups().map(g => {
      const open = state.open.has(g.key);
      const toggle = () => { if (state.open.has(g.key)) state.open.delete(g.key); else state.open.add(g.key); updateTree(); };
      return el('div', { class: 'tg' + (open ? ' open' : ''), dataset: { key: g.key } },
        el('div', { class: 'tg-h' + (g.silguk && g.silguk === selSg ? ' cur' : '') },
          el('button', { type: 'button', class: 'tg-tog', 'aria-expanded': open ? 'true' : 'false', 'aria-label': g.label + (open ? ' 접기' : ' 펼치기'), onclick: toggle }, icon('chev')),
          g.silguk
            ? el('button', { type: 'button', class: 'tg-name', dataset: { silguk: g.silguk }, 'aria-current': g.silguk === selSg ? 'page' : null,
              title: g.label + ' — 실·국 합산 보기', onclick: () => { state.open.add(g.key); select({ kind: 'silguk', name: g.silguk }); } }, g.label)
            : el('button', { type: 'button', class: 'tg-name plain', onclick: toggle }, g.label),
          el('span', { class: 'tg-n mono', text: String(g.count || g.depts.length) })),
        open ? el('ul', { class: 'tg-list' }, g.depts.map(item),
          g.sub ? [el('li', { class: 'ti-sub' }, el('button', { type: 'button', class: 'ti sub', dataset: { silguk: g.sub.silguk },
            'aria-current': g.sub.silguk === selSg ? 'page' : null, title: g.sub.label + ' — 실·국 합산 보기',
            onclick: () => select({ kind: 'silguk', name: g.sub.silguk }) }, g.sub.label)), g.sub.depts.map(item)] : null) : null);
    });
    function item(n) {
      return el('li', {}, el('button', { type: 'button', class: 'ti', dataset: { name: n }, 'aria-current': n === selDept ? 'page' : null,
        onclick: () => select({ kind: 'dept', name: n }) }, n));
    }
  }
  // 나무를 다시 그려도 키보드 포커스가 있던 단추(같은 묶음의 펼치기·이름, 같은 부서)로 돌려놓는다.
  function treeFocusSel(n) {
    if (!n || !n.closest || !n.closest('#tree')) return null;
    if (n.dataset.name) return '.ti[data-name="' + CSS.escape(n.dataset.name) + '"]';
    if (n.classList.contains('sub')) return '.ti.sub';
    const g = n.closest('.tg');
    if (!g) return null;
    return '.tg[data-key="' + CSS.escape(g.dataset.key) + '"] ' + (n.classList.contains('tg-tog') ? '.tg-tog' : '.tg-name');
  }
  function updateTree() {
    const tree = $('tree');
    if (!tree) return false;
    const sel = treeFocusSel(document.activeElement);
    append(clear(tree), renderTree());
    const n = sel && tree.querySelector(sel);
    if (n) { n.focus(focusOpts()); return true; }
    return false;
  }
  // 시작 화면 틀: 사이드바·폰 메뉴 단추를 감추고(열 서랍이 없음) 본문을 온 폭 가운데에 둔다.
  function setStartMode(on) {
    const app = $('app'), side = $('side'), mb = $('menu-btn');
    if (!app || !side) return;
    if (on) closeDrawer();
    app.classList.toggle('start', !!on);
    side.hidden = !!on;
    if (mb) mb.hidden = !!on;
  }
  function openDrawer() {
    if ($('side').hidden) return;
    $('side').classList.add('open'); $('scrim').hidden = false;
    $('menu-btn').setAttribute('aria-expanded', 'true');
    const cur = document.querySelector('#tree [aria-current=page]') || $('side-search');
    cur.focus();
  }
  function closeDrawer() {
    const s = $('side');
    if (!s || !s.classList.contains('open')) return;
    s.classList.remove('open'); $('menu-btn').setAttribute('aria-expanded', 'false');
    if (!state.detail) $('scrim').hidden = true;
  }
  function toggleDrawer() { if ($('side').classList.contains('open')) closeDrawer(); else openDrawer(); }

  // ---------- 부서 고르기 목록(빠른 검색 상자와 시작 화면 검색창이 함께 쓴다) ----------
  // 치는 대로 목록을 채우고 ↑↓ 로 고르며 Enter 로 연다(맨 윗줄). 옛 이름으로 맞으면 「옛 이름 「…」 일치」를 보인다.
  // 줄 순서: 부서(이름 같음 → 이름이 검색어로 시작 → 이름에 들어 있음 → 실·국·옛 이름, core.searchDepts) 다음 실·국 합산.
  function deptCombo(input, list, prefix, onPick, opts) {
    opts = opts || {};
    let active = -1;
    const items = () => [...list.querySelectorAll('li[role=option]')];
    function mark(i) {
      const xs = items(); if (!xs.length) return;
      active = (i + xs.length) % xs.length;
      xs.forEach((x, j) => x.setAttribute('aria-selected', j === active ? 'true' : 'false'));
      input.setAttribute('aria-activedescendant', xs[active].id);
      xs[active].scrollIntoView({ block: 'nearest' });
    }
    const pick = li => onPick(li.dataset.silguk ? { kind: 'silguk', name: li.dataset.silguk } : { kind: 'dept', name: li.dataset.name });
    function fill() {
      clear(list); active = -1; input.removeAttribute('aria-activedescendant');
      const q = input.value.replace(/\s+/g, '');
      if (opts.hideEmpty && !q) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      let k = 0;
      const opt = (attrs, ...kids) => el('li', Object.assign({ role: 'option', id: prefix + (k++), 'aria-selected': 'false',
        onmousedown: e => e.preventDefault(), onclick: e => pick(e.currentTarget) }, attrs), ...kids);
      const rs = root.DCC.core.searchDepts(state.ix, input.value).filter(r => !BUCKETS.has(r.name));
      for (const r of rs) {
        list.appendChild(opt({ dataset: { name: r.name } },
          el('span', { class: 'nm', text: r.name }),
          r.matchedAlias ? el('span', { class: 'alias', text: '옛 이름 「' + r.matchedAlias + '」 일치' }) : null,
          r.current ? null : badge('옛 부서', 'old'),
          el('span', { class: 'sg', text: !r.silguk || r.silguk === '기타' ? '' : r.silguk })));
      }
      if (q) {
        for (const g of root.DCC.core.silguks(state.ix)) {
          if (BUCKETS.has(g.name) || g.name === '기타' || !g.name.replace(/\s+/g, '').includes(q)) continue;
          list.appendChild(opt({ dataset: { silguk: g.name } }, el('span', { class: 'nm', text: g.name }), badge('실·국 합산', 'sg-b'),
            el('span', { class: 'sg', text: g.depts.length + '개 부서' })));
        }
      }
      if (!list.firstChild) list.appendChild(el('li', { class: 'none', text: '맞는 부서가 없습니다. 실·국 이름이나 옛 이름으로도 찾아 보십시오.' }));
    }
    input.addEventListener('input', fill);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { if (list.hidden) fill(); mark(active + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { mark(active - 1); e.preventDefault(); }
      else if (e.key === 'Enter') {
        const x = items()[active >= 0 ? active : 0];
        if (x) pick(x);
        e.preventDefault();
      } else if (e.key === 'Tab' && opts.trapTab) e.preventDefault();   // 상자 안에 머문다(Esc 로 닫기)
      else if (e.key === 'Escape' && opts.hideEmpty && !list.hidden) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); e.stopPropagation(); }
    });
    return fill;
  }

  // ---------- 빠른 검색(Ctrl+K · /): 가운데 뜨는 상자 ----------
  function renderQuickSearch() {
    const input = el('input', { id: 'dept-q', type: 'search', autocomplete: 'off', placeholder: '부서·실국 이름 (옛 이름도 됨)',
      'aria-label': '부서 검색', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'dept-list', 'aria-autocomplete': 'list' });
    const list = el('ul', { id: 'dept-list', class: 'dept-list', role: 'listbox', 'aria-label': '검색 결과' });
    const fill = deptCombo(input, list, 'qs-o', t => { closeQS(false); select(t); }, { trapTab: true });
    const box = el('div', { id: 'qs', class: 'qs', hidden: true, onmousedown: e => { if (e.target === box) closeQS(); } },
      el('div', { class: 'qs-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': '부서 빠른 검색' },
        el('div', { class: 'qs-in' }, icon('search'), input, el('kbd', { text: 'Esc' })),
        list,
        el('p', { class: 'qs-foot' }, el('kbd', { text: '↑' }), el('kbd', { text: '↓' }), ' 고르기 · ', el('kbd', { text: 'Enter' }), ' 열기 · ',
          el('kbd', { text: 'Esc' }), ' 닫기')));
    box.fill = fill;
    return box;
  }
  let qsReturn = null;
  function openQS() {
    const box = $('qs');
    if (!box.hidden) { $('dept-q').focus(); return; }
    qsReturn = document.activeElement;
    closeDrawer();
    box.hidden = false;
    const input = $('dept-q');
    input.value = '';
    box.fill();
    input.focus();
  }
  function closeQS(restore) {
    const box = $('qs');
    if (!box || box.hidden) return;
    box.hidden = true;
    if (restore !== false && qsReturn && qsReturn.focus && document.contains(qsReturn)) qsReturn.focus();
  }

  function globalKeys(e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key, c = e.code;
      if (k === '+' || k === '=' || c === 'NumpadAdd' || c === 'Equal') { e.preventDefault(); stepFs(1); return; }
      if (k === '-' || c === 'NumpadSubtract' || c === 'Minus') { e.preventDefault(); stepFs(-1); return; }
      if (k === '0' || c === 'Digit0' || c === 'Numpad0') { e.preventDefault(); setFs(100); return; }
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openQS(); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isTyping(e.target) && $('qs').hidden) { e.preventDefault(); openQS(); return; }
    if (e.key === 'Escape') {
      if (!$('qs').hidden) { closeQS(); e.preventDefault(); }
      else if (state.detail) { closeDetail(); e.preventDefault(); }
      else if ($('side').classList.contains('open')) { closeDrawer(); $('menu-btn').focus(); }
    }
  }

  // 시작 화면(가운데): 큰 제목 · 한 줄 소개 · 큰 부서 검색창 · 실·국 바로가기(가나다순, 순위 아님) · 세 단계 안내.
  function renderWelcome() {
    const input = el('input', { id: 'start-q', type: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: phone() ? '부서 이름 (예: 주택과)' : '우리 부서 예보 보기 — 부서 이름을 입력하세요 (예: 주택과)',
      'aria-label': '부서 검색 — 우리 부서 이름을 입력하세요 (예: 주택과, 옛 이름도 됩니다)', role: 'combobox', 'aria-expanded': 'false',
      'aria-controls': 'start-list', 'aria-autocomplete': 'list' });
    const list = el('ul', { id: 'start-list', class: 'dept-list start-list', role: 'listbox', 'aria-label': '부서 검색 결과', hidden: true });
    deptCombo(input, list, 'st-o', t => select(t), { hideEmpty: true });
    const box = el('div', { class: 'start-search' }, el('div', { class: 'ss-box' }, icon('radar'), input), list);
    box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); } });
    input.addEventListener('focus', () => { if (input.value.trim() && list.hidden) input.dispatchEvent(new Event('input')); });
    const sgs = root.DCC.core.silguks(state.ix).filter(g => !BUCKETS.has(g.name) && g.name !== '기타' &&
      g.depts.some(n => (state.ix.depts.get(n) || {}).current)).map(g => g.name).sort(ko);
    // 예보 꾸밈(2026-09-29): 레이더·등압선 배경, 발표 줄, 「전체 예보」 띠(자료 전체 수). 직원용에는 부서별 날씨·등급을 두지 않는다.
    return el('section', { class: 'welcome mesh fc' },
      kit.radarBg(),
      kit.forecastHead(root.DCC_DATA),
      el('h1', { class: 'tagline', text: root.DCC_BRAND.tagline }),
      el('h2', { text: '부서를 고르면 행감 지적·되풀이·약속·예산을 한 장으로 보여 줍니다' }),
      box,
      kit.forecastStrip(root.DCC.core.overview(root.DCC_DATA)),
      sgs.length ? el('nav', { class: 'sg-chips', 'aria-label': '실·국 바로가기 (가나다순)' },
        el('p', { class: 'eyebrow eb', text: '실·국 바로가기 · 가나다순' }),
        sgs.map(n => el('button', { type: 'button', class: 'sg-chip', dataset: { silguk: n }, title: n + ' — 실·국 합산 보기',
          onclick: () => select({ kind: 'silguk', name: n }) }, n))) : null,
      el('ol', { class: 'steps' },
        el('li', {}, el('span', { class: 'mono n', text: '01' }), el('span', { text: '부서 이름을 칩니다(옛 이름도 됨, Ctrl+K·/ 로도 찾기)' })),
        el('li', {}, el('span', { class: 'mono n', text: '02' }), el('span', { text: '탭에서 지적·되풀이·약속·예산을 봅니다' })),
        el('li', {}, el('span', { class: 'mono n', text: '03' }), el('span', { text: '처리결과를 첨부하고 프롬프트를 복사합니다' }))),
      el('p', { class: 'muted small start-foot', text: '공개자료만 · 인터넷 없이 열림 · 부서끼리 순위를 매기지 않습니다' }));
  }

  function renderFooter() {
    return el('footer', { class: 'foot' },
      el('p', { text: '출처: ' + region().의회명 + ' 행정사무감사 결과보고서 · 시정질문 답변요지서 · ' + region().지자체명 + ' 누리집 사업 및 예산정보(* 표시 해는 지방재정365 보충).' }),
      el('p', { text: '부서 배정·되풀이 묶음·약속의 부서는 기계가 만든 것이므로 원문으로 확인하십시오. 부서 간 순위는 만들지 않습니다.' }));
  }

  // ---------- 선택 ----------
  function select(target) {
    document.body.dataset.ready = '0';
    const ix = state.ix;
    if (target.kind === 'dept' && !ix.depts.has(target.name) && ix.alias.has(target.name)) {
      target = { kind: 'dept', name: ix.alias.get(target.name) };
    }
    const known = target.kind === 'dept' ? ix.depts.has(target.name) && !BUCKETS.has(target.name)
      : root.DCC.core.silguks(ix).some(g => g.name === target.name);
    // 포커스: 나무 목록에서 고르면(서랍이 아닐 때) 그 단추에 남고, 그 밖에는 본문 머리 제목으로 옮긴다.
    const fromTree = !!treeFocusSel(document.activeElement) && !$('side').classList.contains('open');
    closeQS(false); closeDrawer();
    dropDetail();
    const body = clear($('body'));
    if (!known) {
      document.body.dataset.ready = 'notfound';
      body.appendChild(el('section', { class: 'card warn-box' },
        el('p', { text: '「' + target.name + '」을(를) 찾지 못했습니다. 아래 검색창이나 검색(Ctrl+K)에서 다시 골라 주십시오.' })));
      body.appendChild(renderWelcome());
      setStartMode(true);
      return;
    }
    // 최종 검토 수정 7: 확인 표에서 사람이 고친 짝·체크는 대상별로 보관해 두었다가, 같은 대상으로
    // 돌아오면(같은 대상을 다시 골라도) 기계 제안으로 덮지 않고 되살린다.
    const oldKey = targetKey(state.target), newKey = targetKey(target);
    for (const p of state.pending) {
      p.saved = p.saved || {};
      if (oldKey && p.rows) p.saved[oldKey] = { rows: p.rows, year: p.year };
    }
    state.target = target;
    state.summary = root.DCC.core.summarize(ix, target);
    resetPick();
    state.promiseShown = 0;
    for (const p of state.pending) {
      const kept = p.saved[newKey];
      if (kept) { p.rows = kept.rows; p.year = kept.year; } else rematch(p);
    }
    // 나무 목록에서 고른 대상의 묶음을 편다.
    if (target.kind === 'silguk') { state.open.add('sg:' + target.name); if (target.name === '기타') state.open.add('old'); }
    else {
      const d = ix.depts.get(target.name);
      state.open.add(d.current ? 'sg:' + (d.silguk || '기타') : 'old');
    }
    render();
    window.scrollTo(0, 0);
    if (!(fromTree && $('tree').contains(document.activeElement))) focusHead();
  }
  function focusHead() { const h = document.querySelector('#body .page-head h2'); if (h) h.focus(focusOpts()); }

  function syncUrl() {
    try {
      const t = state.target;
      const u = new URL(location.href);
      const q = [];
      if (t) q.push((t.kind === 'dept' ? 'dept=' : 'silguk=') + encodeURIComponent(t.name));
      if (t && state.tab !== 'summary') q.push('tab=' + state.tab);
      if (state.fs !== 100) q.push('fs=' + state.fs);
      if (state.theme !== 'auto') q.push('theme=' + state.theme);
      u.search = q.length ? '?' + q.join('&') : '';
      history.replaceState(null, '', u.href);
      const bh = $('brand-home'); if (bh) bh.setAttribute('href', homeHref());
    } catch (e) { /* file:// 에서 막히면 그냥 둔다 */ }
  }

  // 첨부 반영(Task 7) 뒤에도 같은 함수로 다시 그린다. state.actions·state.include(고른 자료)는 유지된다.
  function render() {
    const s = state.summary;
    const body = clear($('body'));
    setStartMode(false);
    state.reopened = reopenedIds(s);
    append(body, [renderTitle(), renderTabs(s),
      el('div', { id: 'tabpanel', class: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-' + state.tab }, renderTab(s))]);
    drawCharts();
    renderDetail();
    updateTree();
    const c = $('crumbs');
    if (c) {
      const t = state.target, d = t.kind === 'dept' ? state.ix.depts.get(t.name) : null;
      c.textContent = t.kind === 'silguk' ? (SILGUK_LABEL[t.name] || t.name) + ' / 실·국 합산'
        : (d.current ? (!d.silguk || d.silguk === '기타' ? '' : d.silguk + ' / ') : '옛 부서 / ') + d.name;
    }
    syncUrl();
    document.body.dataset.ready = '1';
  }

  function setTab(tab, focus) {
    if (!TAB_IDS.has(tab) || !state.summary) return;
    state.tab = tab;
    render();
    const tabs = $('tabs');
    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    if (focus) $('tab-' + tab).focus(focusOpts());
  }

  function renderTab(s) {
    switch (state.tab) {
      case 'findings': return renderFindings(s);
      case 'recurring': return renderRecurring(s);
      case 'promises': return renderPromises(s);
      case 'budget': return renderBudget(s);
      case 'coverage': return renderCoverage(s);
      case 'prompt': return renderPromptPanel();
      default: return renderSummary(s);
    }
  }

  function renderTitle() {
    const t = state.target;
    if (isSilguk()) {
      const depts = root.DCC.core.silguks(state.ix).find(g => g.name === t.name).depts;
      return el('section', { class: 'page-head mesh' },
        eyebrow('OFFICE — 실·국 합산'),
        el('h2', { tabindex: '-1' }, SILGUK_LABEL[t.name] || t.name),
        el('p', { class: 'muted small', text: '소속 ' + depts.length + '개 부서: ' + depts.join(', ') }));
    }
    const d = state.ix.depts.get(t.name);
    return el('section', { class: 'page-head mesh' },
      eyebrow('DEPARTMENT'),
      el('h2', { tabindex: '-1' }, d.name, ' ', d.current ? null : badge('옛 부서', 'old')),
      el('p', { class: 'muted small' }, '소속 ' + (!d.silguk || d.silguk === '기타' ? '미확인' : d.silguk),
        (d.aliases || []).length ? ' · 이 부서로 묶은 표기: ' + d.aliases.map(a => '「' + a + '」').join(' ') : null),
      d.current ? null : el('p', { class: 'note small',
        text: '지금 조직도에 없는 옛 부서입니다. 업무를 이어받은 부서가 있다면 그 부서 화면도 함께 보십시오.' }));
  }


  // ---------- ⑦ 처리결과 첨부 ----------
  // 흐름(파일 → kordoc/CSV → match 짝 제안 → 확인 표 → 「확인한 것 반영」)은 kit.attachFlow 가 맡는다.
  // 첨부 칸의 대기 파일·기록·읽는 중 표시는 state(pending·log·busy)에 둔다(다시 그려도 남게, 저장은 안 함).
  // 반영은 onApply 로 돌려받아 여기서 state.actions 에 넣고 다시 그린다.
  function targetDeptKeys() {
    const t = state.target;
    const names = t.kind === 'dept' ? [t.name] : root.DCC.core.silguks(state.ix).find(g => g.name === t.name).depts;
    const out = [];
    for (const n of names) { out.push(n); for (const a of (state.ix.depts.get(n) || {}).aliases || []) out.push(a); }
    return out.map(x => x.replace(/\s/g, '')).filter(Boolean);
  }
  // kordoc 을 부르는 갈래. 자체 시험이 잠시 바꿔 끼워 양보·경고 동작을 확인한다.
  function parse(bytes) { return root.kordoc.parse(bytes); }
  const att = kit.attachFlow({
    store: state, multiple: true, merge: false, id: 'attach-panel',
    findings: () => state.summary.findings,
    dept: () => (state.target.kind === 'dept' ? state.target.name : undefined),
    deptKeys: targetDeptKeys,
    actions: () => state.actions,
    label: () => state.target.name,
    parse: b => ui.parse(b),
    // 첨부 칸은 지적 탭 머리에 있다. 다른 탭에서 불리면(자체 시험·영상) 지적 탭으로 옮겨 진행을 보인다.
    beforeRead: () => {
      if (!state.target) throw new Error('먼저 부서나 실·국을 고르십시오');
      if (state.tab !== 'findings') { state.tab = 'findings'; render(); }
    },
    onApply: actions => { Object.assign(state.actions, actions); render(); },
    focusOpts, focusFallback: () => $('tab-findings'),
  });
  const rematch = p => att.rematch(p);
  const renderAttach = () => att.render();
  // 자체 시험(Task 8)도 이 함수를 부른다. 확인 표를 만들 뿐 반영은 하지 않는다.
  const attachBytes = (fileName, bytes) => att.attachBytes(fileName, bytes);
  const applyPending = p => att.apply(p);


  // ---------- ⑧ 프롬프트 ----------
  // 2026-09-29 사용자 판정: 지적·약속을 모두 쏟아 넣지 않고, 후보 목록(kit.candList — 의원용 질문 후보와 같은 틀)에서 고른 것만 싣는다.
  // 고름(state.include — 지적 id·약속 id 를 함께 담는 Set, 약속 탭의 「프롬프트에 포함」도 같은 Set)은 메모리에만 둔다.
  // 종류를 고르면 그 종류의 기본 고르기(prompts.defaults)를 건다:
  //  - 아직 종류를 고른 적이 없으면: 약속 탭에서 미리 체크한 것 + 기본.
  //  - 기본을 건 뒤 사용자가 고름을 바꾸지 않았으면(pick.touched=false): 새 종류의 기본으로 바꾼다.
  //  - 사용자가 바꿨으면: 고름을 그대로 둔다(「기본 고르기로」 단추로 되돌릴 수 있다).
  // 상세 패널의 「이 건 답변서 초안」은 답변서 초안으로 바꾸고 그 지적과 되풀이 줄기 형제를 고른다(이것도 기본으로 친다).
  const KIND_NOTE = {
    '행감대비': ys => '기본: 최근 3개 자료 연도(' + ys + ')의 완료 아닌 지적과 되풀이 지적(완료 빼고)을 골라 두었습니다. 약속은 고르지 않았습니다.',
    '업무보고대비': ys => '기본: 최근 2개 자료 연도(' + ys + ')의 지적, 되풀이 지적, 답변 속 약속을 모두 골라 두었습니다.',
    '답변서초안': () => '답변서를 쓸 지적이나 약속을 고르십시오. 고른 항목마다 초안을 한 건씩 씁니다.',
  };
  const pickOf = () => state.pick || (state.pick = { kind: null, touched: false, from: null });
  function resetPick() { state.include = new Set(); state.pick = { kind: null, touched: false, from: null }; }
  function dataYears() {
    if (!state.dataYears) state.dataYears = [...new Set(root.DCC_DATA.findings.map(f => Number(f.year)).filter(y => y > 0))].sort((a, b) => b - a);
    return state.dataYears;
  }
  function applyDefaults(kind, keep) {
    const d = root.DCC.prompts.defaults(kind, state.summary, state.actions, dataYears());
    const next = new Set(keep ? state.include : []);
    d.findings.forEach(id => next.add(id)); d.promises.forEach(id => next.add(id));
    state.include.clear(); next.forEach(id => state.include.add(id));
  }
  function promptCtx(kind, findingId) {
    const sel = state.include;
    return { target: state.target, summary: state.summary, actions: state.actions, findingIds: sel, promiseIds: sel,
      findingId: findingId || undefined, template: (root.DCC_PROMPTS || {})[kind] || '' };
  }
  // 자체 시험(Task 8)용: 지금 화면 상태(고른 지적·약속, 반영한 조치)로 조립한 원문. 복사·미리 보기와 같은 글.
  function promptText(kind, findingId) { return root.DCC.prompts.build(kind, promptCtx(kind, findingId)).text; }
  // 고른 것 가운데 지금 대상의 지적·약속 수(다른 대상 id 는 세지 않는다).
  function pickedCount() {
    const s = state.summary;
    if (!s) return 0;
    return s.findings.filter(f => state.include.has(f.id)).length + (s.promises.guessed || []).filter(p => state.include.has(p.id)).length;
  }

  // kind 를 고른다. findingId 를 주면(상세 패널의 「이 건 답변서 초안」) 그 지적과 되풀이 형제만 고른다.
  function openPrompt(kind, findingId) {
    if (!state.summary) return;
    const pick = pickOf();
    if (findingId) {
      const ids = root.DCC.prompts.draftPick(state.summary, findingId);
      state.include.clear(); ids.forEach(id => state.include.add(id));
      pick.kind = kind; pick.touched = false; pick.from = findingId;
    } else {
      if (pick.kind === null) applyDefaults(kind, true);
      else if (!pick.touched) applyDefaults(kind, false);
      pick.kind = kind; pick.from = null;
    }
    const from = document.activeElement;
    const fromKind = from && from.closest && from.closest('#prompt-panel') ? from : null;
    dropDetail();
    state.tab = 'prompt';
    render();
    const tabs = $('tabs');
    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    // 포커스: 종류 단추에서 불렀으면 같은 단추, 그 밖(상세의 답변서 초안 등)은 프롬프트 탭.
    let t = null;
    if (fromKind && fromKind.dataset.kind) t = document.querySelector('#prompt-panel button[data-kind="' + fromKind.dataset.kind + '"]');
    if (!t && from && from !== document.body) t = $('tab-prompt');
    if (t) t.focus(focusOpts());
  }
  // 「기본 고르기로」: 지금 종류의 기본으로 되돌린다(약속 탭에서 체크한 것도 푼다).
  function resetDefaults() {
    const pick = pickOf();
    if (!pick.kind) return;
    if (pick.from) { const ids = root.DCC.prompts.draftPick(state.summary, pick.from); state.include.clear(); ids.forEach(id => state.include.add(id)); }
    else applyDefaults(pick.kind, false);
    pick.touched = false;
    render();
    const b = $('p-reset'); if (b) b.focus(focusOpts());
    kit.prefs.announce('기본 고르기로 되돌렸습니다');
  }

  function renderPromptPanel() {
    const pick = pickOf();
    const on = k => pick.kind === k;
    const ys = k => dataYears().slice(0, k === '행감대비' ? 3 : 2).slice().sort((a, b) => a - b).join('·');
    return el('section', { id: 'prompt-panel', class: 'panel sec' },
      el('div', { class: 'sec-h' }, el('div', { class: 'sec-t' }, el('p', { class: 'eyebrow', text: 'PROMPT' }),
        el('h3', { text: 'AI 업무비서에 붙일 프롬프트' }),
        el('p', { class: 'muted small', text: '종류를 고르면 넣을 자료를 미리 골라 둡니다. 목록에서 더하거나 빼면 미리 보기가 바로 바뀝니다. [복사]해 기관 AI 업무비서에 붙여 넣으십시오.' }))),
      el('div', { class: 'btns p-btns', role: 'group', 'aria-label': '프롬프트 종류' },
        KINDS.map(([k, label]) => el('button', { type: 'button', class: 'btn pill' + (on(k) ? ' primary' : ' secondary'),
          dataset: { kind: k }, 'aria-pressed': on(k) ? 'true' : 'false', onclick: () => openPrompt(k), text: label }))),
      pick.kind ? el('p', { id: 'p-note', class: 'p-note small' },
        pick.from ? '「이 건 답변서 초안」: 고른 지적과 같은 되풀이 줄기의 지적을 골라 두었습니다. 고른 항목마다 초안을 한 건씩 씁니다.' : KIND_NOTE[pick.kind](ys(pick.kind)),
        pick.touched ? [' ', el('button', { type: 'button', id: 'p-reset', class: 'link-btn', onclick: resetDefaults, text: '기본 고르기로' })] : null) : null,
      pick.kind ? el('div', { class: 'p-grid' }, renderPromptCands(), renderPromptBox(pick.kind)) : null);
  }

  // 후보: 되풀이 지적(줄기마다 소제목) · 행감 지적(되풀이 밖, 연도마다 소제목) · 답변 속 약속(부서 추정) · 예산(늘 함께 — 고르지 않음).
  function renderPromptCands() {
    const s = state.summary;
    const P = root.DCC.prompts;
    const st = f => P.statusOf(f, state.actions);
    const stTag = f => el('span', { class: 'st ' + (state.actions[f.id] ? kit.statusCls(st(f)) : 's-etc'), text: state.actions[f.id] ? st(f) : '첨부 전' });
    const fEv = f => f.year + ' ' + kit.comName(f.com) + ' ' + f.no + '번' + (isSilguk() ? ' · ' + f.dept : '') + ' · 이행 ' +
      (state.actions[f.id] ? st(f) + (state.actions[f.id].text ? ' — ' + state.actions[f.id].text : '') : '처리결과 첨부 전');
    const fItem = (f, sub) => ({ id: f.id, title: f.title, year: f.year, sub, tags: [stTag(f)], evidence: fEv(f),
      more: () => el('p', { class: 'ev-b', text: f.body || '결과보고서에 요지가 따로 적혀 있지 않습니다.' }) });
    const recs = new Map(s.recurring.map(r => [r.id, r]));
    const recF = s.findings.filter(f => f.recurring).sort((a, b) => String(a.recurring).localeCompare(String(b.recurring)) || a.year - b.year);
    const restF = s.findings.filter(f => !f.recurring).sort((a, b) => b.year - a.year || String(a.com).localeCompare(String(b.com), 'ko') || a.no - b.no);
    const recSub = f => { const r = recs.get(f.recurring); return '되풀이 ' + f.recurring + (r ? ' · ' + r.years.join('→') + ((r.common || []).length ? ' · 겹친 낱말 ' + r.common.join('·') : '') : ''); };
    const ps = [...(s.promises.guessed || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
    const bYears = s.expenditure.filter(e => e.year < s.now && e.budget > 0).map(e => e.year).sort((a, b) => b - a).slice(0, 3);
    return kit.candList({ id: 'cand-list', eyebrow: 'MATERIALS — 넣을 자료', title: '넣을 자료 고르기',
      lead: '프롬프트에 넣을 지적·약속을 고르십시오. 근거를 펼쳐 원문과 대조하십시오.', countLabel: '고른 자료', selected: state.include,
      onChange: () => { pickOf().touched = true; syncPromptPick(); },
      groups: [
        { cls: 'cat-rec', kind: 'recurring', title: '되풀이 지적', empty: '여러 해에 되풀이된 지적 줄기가 없습니다.', items: recF.map(f => fItem(f, recSub(f))) },
        { cls: 'cat-find', kind: 'findings', title: '행감 지적(되풀이 밖)', empty: '되풀이 밖 지적이 없습니다.', items: restF.map(f => fItem(f, f.year + '년')) },
        { cls: 'cat-prom', kind: 'promise', title: '답변 속 약속(부서 추정)', empty: '이 대상으로 추정된 약속이 없습니다.',
          items: ps.map(p => ({ id: p.id, title: p.topic || p.question || '(주제 없음)', year: Number(String(p.date).slice(0, 4)) || null,
            tags: [el('span', { class: 'est', text: '추정' })],
            evidence: '제' + p.session + '회 시정질문(' + p.date + ') 답변 약속(부서 추정 — 확인 필요): ' + (p.commitments || []).join(' '),
            more: () => p.question ? el('p', { class: 'ev-b' }, el('span', { class: 'muted', text: '질문 요지 ' }), p.question) : null })) },
        { cls: 'cat-exec', kind: 'budget', title: '예산(늘 함께)', count: bYears.length, items: [],
          empty: bYears.length ? '최근 마감 연도 예산·집행률(' + bYears.join('·') + ')은 고르지 않아도 [B] 로 늘 함께 들어갑니다.' : '마감된 연도의 세출 자료가 없습니다.' },
      ] });
  }
  // 고름이 바뀌면(후보 목록·약속 탭) 미리 보기·글자 수·복사 단추·「기본 고르기로」를 바로 맞춘다.
  function syncPromptPick() {
    const pick = pickOf();
    const note = $('p-note');
    if (note && pick.touched && !$('p-reset')) append(note, [' ', el('button', { type: 'button', id: 'p-reset', class: 'link-btn', onclick: resetDefaults, text: '기본 고르기로' })]);
    syncPromptPreview();
  }
  function promptBuilt(kind) { return root.DCC.prompts.build(kind, promptCtx(kind, pickOf().from)); }
  // 미리 보기 채우기. q(id) → 요소(기본은 문서 전체, 그리는 중에는 새 칸 안).
  function syncPromptPreview(q) {
    q = q || $;
    const pick = pickOf();
    if (!pick.kind || !q('prompt-preview')) return;
    const built = promptBuilt(pick.kind);
    const tpl = (root.DCC_PROMPTS || {})[pick.kind] || '';
    // 자료 칸 글자 수 = 전체 − 틀(대상 이름 넣고 {{자료}} 뺀 것). maskNames 는 글자 수를 바꾸지 않는다(이름 3자 → ○○○).
    const fixed = tpl.replace('{{대상}}', state.target.name).replace('{{자료}}', '').length;
    const LIMIT = root.DCC.prompts.LIMIT;
    const omit = [built.omitted.F ? '자료 칸이 ' + LIMIT + '자를 넘어 고른 지적 뒤쪽 ' + built.omitted.F + '건을 뺐습니다(되풀이·최근 지적을 먼저 남김). 원문에는 「외 ' + built.omitted.F + '건 생략」으로 적힙니다.' : '',
      built.omitted.P ? '약속이 자료 칸의 1/3 을 넘어 ' + built.omitted.P + '건을 뺐습니다(앞쪽을 남김). 원문에는 「외 ' + built.omitted.P + '건 생략」으로 적힙니다.' : ''].filter(Boolean).join(' ');
    kit.fillPreview(q, { none: pickedCount() === 0, text: built.text, copyId: 'p-copy', warn: built.actionsIncluded > 0, omit,
      count: '자료 칸 ' + (built.chars - fixed) + ' / ' + LIMIT + '자 · 전체 ' + built.chars + '자 · 지적 ' + built.picked.F + ' · 약속 ' + built.picked.P });
    const m = q('p-msg'); if (m) m.textContent = '';
  }

  function renderPromptBox(kind) {
    const msg = el('span', { id: 'p-msg', class: 'p-msg small', role: 'status' });
    async function copy() {
      const built = promptBuilt(kind);
      if (pickedCount() === 0) return;
      // 복사 직전 이름 가리기를 한 번 더 건다(조립 때 이미 가렸다).
      const masked = root.DCC.prompts.maskNames(built.text);
      // 복사 방식(클립보드 → 1.5초 안에 안 끝나면 execCommand)은 kit.copyText.
      const ok = await kit.copyText(masked);
      msg.textContent = ok ? '복사했습니다. 기관 AI 업무비서 입력 칸에 붙여 넣으십시오.' : '복사하지 못했습니다. 미리 보기 글을 끌어 골라 Ctrl+C 로 복사하십시오.';
    }
    const box = el('div', { class: 'p-box card', dataset: { kind } },
      kit.previewBox({ onCopy: copy, copyId: 'p-copy', warn: '첨부한 처리결과 내용이 포함됩니다. 기관 AI 업무비서에만 붙여 넣으십시오.',
        hint: kind === '답변서초안' ? '답변서를 쓸 지적이나 약속을 하나 이상 고르면 복사될 프롬프트가 여기에 보이고 [복사]가 켜집니다.'
          : '자료를 하나 이상 고르면 복사될 프롬프트가 여기에 보입니다.' }),
      msg);
    // 그린 뒤 바로 채운다(아직 문서에 붙기 전이므로 box 안에서 찾는다).
    syncPromptPreview(id => box.querySelector('#' + id));
    return box;
  }

  const ui = { start, select, render, el, state, implText, attachBytes, applyPending, promptText, openPrompt, parse,
    setTab, openDetail, closeDetail, openQS, closeQS, goHome, setFs, stepFs, cycleTheme };
  root.DCC = root.DCC || {};
  root.DCC.ui = ui;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
