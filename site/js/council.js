// 역할: 의원용 페이지(의원점검표.html) 화면 → root.DCC.council.start().
// 흐름: 시작(상임위 카드) → 상임위(소관 부서 표, 물을 거리 많은 순, 칸 머리로 다시 정렬) → 부서(탭: 질문 후보(요약 포함)·지적·되풀이·약속·예산·자료 범위)
// → 내보내기(질문 후보 탭 아래 막대: 프롬프트 보기·복사·질문 목록 인쇄/CSV·1쪽 브리핑 인쇄).
// 부서 화면의 요약 칸·지적~자료 범위 탭과 지적 상세 패널은 집행부 화면과 같은 DCC.deptview(공용 모듈)가 그린다. 이 화면의 state.actions 를
// 넘기므로 처리결과를 반영하면 지적 탭 이행 칸과 질문 후보가 함께 바뀐다.
// 물을 거리 계산은 DCC.councilCore(가중치 없이 건수만), 겉모양 도구(요소·글자 크기·테마·첨부 흐름)는 DCC.kit.
// 「첨부 전」 지적은 따로 보이고 합계에 넣지 않는다. 표 정렬은 화면 도구일 뿐 순위가 아니다.
// 첨부한 처리결과·고른 후보는 메모리(state)에만 둔다 — localStorage·sessionStorage·IndexedDB 에 쓰지 않는다.
// 주소에는 committee=·dept=·tab=·fs=·theme= 만 남긴다(history.replaceState). tab 은 부서 화면에서 질문 후보(기본)가 아닐 때만.
// 왼쪽 사이드바(상임위 → 소관 부서 나무)는 상임위·부서 화면에만 보인다. 시작 화면은 사이드바 없이 한 칸(.solo).
// 나무 묶음의 여닫힘도 메모리(sideOpen)에만 둔다.
// 시작 화면은 일기 예보 꼴(2026-09-29): 레이더·등압선 배경, 발표 줄, 「전체 예보」 띠, 예보 카드. 부서 날씨 그림(사이드바·상임위 표·카드 분포)은
// 물을 거리 합계만으로 고르며(평가 아님) 범례를 시작·상임위 화면에 늘 둔다.
// 자료 문자열은 모두 textContent(텍스트 노드)로만 넣는다 — innerHTML 에 자료를 넣지 않는다(XSS 방지).
(function (root) {
  const kit = root.DCC.kit;
  const { el, append, $, clear, badge, icon, prefs } = kit;
  const cc = () => root.DCC.councilCore;
  const core = () => root.DCC.core;
  const region = () => root.DCC_REGION || {};
  const brand = () => root.DCC_BRAND || {};
  const ko = (a, b) => a.localeCompare(b, 'ko');

  // 물을 거리 네 칸: [counts 키, 칸 이름, 분류색 클래스(집행부와 같은 색), 후보 kind, 묶음 제목]
  const KINDS = [
    ['unfixed', '조치 안 됨', 'cat-find', 'unfixed', '조치 안 된 지적'],
    ['recurring', '되풀이', 'cat-rec', 'recurring', '되풀이 지적'],
    ['promises', '약속(추정)', 'cat-prom', 'promise', '답변 속 약속(추정)'],
    ['exec', '집행 이상', 'cat-exec', 'exec', '집행 이상'],
  ];
  // 상임위 표의 칸: [정렬 키, 머리 글, 분류색]
  const COLS = [['name', '부서', ''], ...KINDS.map(k => [k[0], k[1], k[2]]), ['total', '합계', ''], ['pending', '첨부 전', '']];

  // 부서 화면 탭: [탭 id, 탭 이름, 칸 머리말]. 질문 후보가 첫째·기본. 프롬프트 탭은 없다(질문 후보 탭의 내보내기를 쓴다).
  // 요약 탭도 없다(2026-09-29): 부서 요약(되풀이·최근 지적)은 질문 후보 탭 위에 둔다. 옛 주소 tab=summary 는 질문 후보로 연다.
  const TABS = [['questions', '질문 후보', 'QUESTIONS'], ['findings', '지적', 'FINDINGS'],
    ['recurring', '되풀이', 'RECURRING'], ['promises', '약속', 'PROMISES — ESTIMATED'], ['budget', '예산', 'BUDGET'], ['coverage', '자료 범위', 'SOURCES']];
  const TAB_IDS = new Set(TABS.map(t => t[0]));

  // target·summary·include·promiseShown·groupBy·detail·reopened·tab 은 공용 탭 모듈(deptview)이 읽고 쓰는 칸이다.
  const state = { ix: null, cfg: null, fById: null, committee: null, dept: null, actions: {}, selected: new Set(),
    sort: { key: 'total', dir: 'desc' }, session: '행감', preview: false, fs: 100, theme: 'auto', flows: {}, stores: {},
    target: null, summary: null, include: new Set(), promiseShown: 0, groupBy: 'status', detail: null, reopened: new Set(), tab: 'questions' };

  let byPointer = false;
  const focusOpts = () => ({ preventScroll: true, focusVisible: !byPointer });
  const view = root.DCC.deptview.create({
    state, tabs: TABS, promiseCheck: false,
    setTab: (tab, focus) => setTab(tab, focus), rerender: () => renderDeptInto(),
    // 첨부 칸은 질문 후보 탭과 지적 탭 머리에 같은 흐름(부서 단위)으로 놓인다.
    renderAttach: () => (state.dept ? deptFlow(state.dept).render() : null),
    focusOpts: () => focusOpts(),
    tabCount: id => (id === 'questions' && state.dept ? candidates().length : null),
  });
  const eyebrow = (text, cls) => el('p', { class: ('eyebrow ' + (cls || '')).trim(), text });
  // 상임위 + 상임위 밖 묶음(site_data.groups — 구청·동 행정복지센터). 묶음도 표·부서 화면은 상임위와 같고
  // 주소도 committee=<묶음 이름> 을 그대로 쓴다(주소 키를 늘리지 않는다). 묶음은 group: true.
  const committees = () => cc().units(root.DCC_DATA);
  // 4차 이전에 만든 out/site_data.json(committees 칸 없음)으로 구우면 상임위 카드가 하나도 없다 — 조용히 비우지 말고 알린다.
  const noCommittees = () => !Array.isArray(root.DCC_DATA.committees) || root.DCC_DATA.committees.length === 0;
  const committeeOf = name => committees().find(c => c.name === name) || null;
  // 날씨(2026-09-29): 부서 물을 거리 합계만으로 고른다(councilCore.weather, 구간은 config/council.json 「weather」). 평가가 아니다.
  // 첨부를 반영하면 합계가 바뀌므로 그리는 때마다 다시 고른다. 범례는 시작·상임위 화면에 늘 둔다.
  const wxScale = () => cc().weatherScale(state.cfg);
  const wxOf = total => cc().weather(total, state.cfg);

  // ---------- 시작 ----------
  function start() {
    document.body.dataset.ready = '0';
    const data = root.DCC_DATA;
    state.ix = core().index(data, core().dataYear(data, new Date().getFullYear()));
    state.cfg = Object.assign({ exec_low: 60, exec_high: 100 }, data.council || {});
    state.fById = new Map(data.findings.map(f => [f.id, f]));
    prefs.read(state);
    const app = clear($('app'));
    app.className = 'shell solo council';
    app.appendChild(renderSide());
    app.appendChild(el('div', { class: 'main-col' }, renderHeader(),
      el('main', { id: 'body', class: 'body' }), renderFooter()));
    app.appendChild(el('div', { id: 'scrim', class: 'scrim', hidden: true, onclick: () => { closeDrawer(); view.closeDetail(); } }));
    app.appendChild(el('aside', { id: 'detail', class: 'detail', hidden: true, role: 'dialog', 'aria-labelledby': 'detail-title', onkeydown: view.trapTab }));
    app.appendChild(el('div', { id: 'print-area', class: 'print-area' }));
    app.appendChild(el('p', { id: 'live', class: 'vh', role: 'status', 'aria-live': 'polite' }));
    prefs.apply(state);
    document.addEventListener('keydown', globalKeys);
    // 인쇄가 끝나면 인쇄 칸만 보이던 표시를 푼다(내용은 다음 화면 옮김 때 지운다).
    window.addEventListener('afterprint', () => document.body.classList.remove('has-print'));
    document.addEventListener('pointerdown', () => { byPointer = true; }, true);
    document.addEventListener('keydown', () => { byPointer = false; }, true);
    fromQuery(location.search);
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(view.drawCharts, 150); });
    if (root.DCC.council.onReady) root.DCC.council.onReady();
  }
  // 주소(committee·dept·tab)로 화면을 연다. start() 가 쓰고, 자체 시험이 주소 왕복을 볼 때도 같은 길로 부른다(fs·theme 는 prefs.read).
  function fromQuery(search) {
    const q = new URLSearchParams(search);
    const c = q.get('committee'), d = q.get('dept');
    if (d) { state.tab = TAB_IDS.has(q.get('tab')) ? q.get('tab') : 'questions'; openDept(d, c && committeeOf(c) ? c : null, false); }
    else if (c && committeeOf(c)) openCommittee(c, false);
    else goHome(false);
  }

  function renderHeader() {
    return el('header', { class: 'topbar' },
      el('button', { type: 'button', id: 'menu-btn', class: 'icon-btn menu-btn', 'aria-label': '상임위·부서 목록 열기', 'aria-controls': 'side',
        'aria-expanded': 'false', hidden: true, onclick: toggleDrawer }, icon('menu')),
      el('button', { type: 'button', id: 'home-btn', class: 'btn home-btn', onclick: () => goHome(true),
        'aria-label': '처음으로 (상임위 고르기)', title: '처음으로 (상임위 고르기)' }, icon('home'), el('span', { class: 'hb-t', text: '처음으로' })),
      el('p', { class: 'b-name top-brand' }, el('a', { class: 'b-home', id: 'brand-home', href: prefs.homeHref(state), title: '처음으로 (상임위 고르기)',
        onclick: e => { e.preventDefault(); goHome(true); } }, brand().name || '')),
      el('nav', { id: 'crumbs', class: 'crumbs', 'aria-label': '위치' }),
      el('p', { class: 'meta' }, '공개자료 기준 · 갱신 ', el('span', { id: 'data-date', class: 'mono', text: root.DCC_DATA.generated || '(날짜 없음)' }),
        root.DCC_BUILT && root.DCC_BUILT !== root.DCC_DATA.generated ? ' (화면 생성 ' + root.DCC_BUILT + ')' : ''),
      el('div', { class: 'top-tools' }, prefs.controls(state, onPrefChange)));
  }
  function onPrefChange(kind) { syncUrl(); if (kind === 'fs') view.drawCharts(); }

  function renderFooter() {
    return el('footer', { class: 'foot' },
      el('p', { text: '출처: ' + (region().의회명 || '') + ' 행정사무감사 결과보고서 · 시정질문 답변요지서 · ' + (region().지자체명 || '') +
        ' 누리집 사업 및 예산정보(지방재정365 보충 포함).' }),
      el('p', { text: '물을 거리는 가중치 없이 건수만 셉니다. 상임위 배정·되풀이 묶음·약속의 부서는 기계가 만든 것이므로 원문으로 확인하십시오. 표 정렬은 화면 도구일 뿐 부서 순위가 아닙니다.' }));
  }

  function globalKeys(e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key, c = e.code;
      if (k === '+' || k === '=' || c === 'NumpadAdd' || c === 'Equal') { e.preventDefault(); prefs.stepFs(state, 1, onPrefChange); return; }
      if (k === '-' || c === 'NumpadSubtract' || c === 'Minus') { e.preventDefault(); prefs.stepFs(state, -1, onPrefChange); return; }
      if (k === '0' || c === 'Digit0' || c === 'Numpad0') { e.preventDefault(); prefs.setFs(state, 100, onPrefChange); }
    }
    if (e.key === 'Escape') {
      if (state.detail) { view.closeDetail(); e.preventDefault(); }
      else if (drawerOpen()) { closeDrawer(); $('menu-btn').focus(); }
    }
  }

  function syncUrl() {
    try {
      const u = new URL(location.href);
      const q = [];
      if (state.committee) q.push('committee=' + encodeURIComponent(state.committee));
      if (state.dept) q.push('dept=' + encodeURIComponent(state.dept));
      if (state.dept && state.tab !== 'questions') q.push('tab=' + state.tab);
      if (state.fs !== 100) q.push('fs=' + state.fs);
      if (state.theme !== 'auto') q.push('theme=' + state.theme);
      u.search = q.length ? '?' + q.join('&') : '';
      history.replaceState(null, '', u.href);
      const bh = $('brand-home'); if (bh) bh.setAttribute('href', prefs.homeHref(state));
      const sh = $('side-home'); if (sh) sh.setAttribute('href', prefs.homeHref(state));
    } catch (e) { /* file:// 에서 막히면 그냥 둔다 */ }
  }

  // 위치 줄: 상임위 / 위원회 / 부서. 앞 단계는 단추(키보드로 돌아가기).
  function setCrumbs() {
    const c = $('crumbs');
    if (!c) return;
    const parts = [];
    if (state.committee || state.dept) parts.push(el('button', { type: 'button', class: 'crumb-b', onclick: () => goHome(true), text: '상임위' }));
    else parts.push(el('span', { class: 'crumb-cur', 'aria-current': 'page', text: '상임위 고르기' }));
    if (state.committee) {
      parts.push(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
      parts.push(state.dept ? el('button', { type: 'button', class: 'crumb-b', onclick: () => openCommittee(state.committee, true), text: state.committee })
        : el('span', { class: 'crumb-cur', 'aria-current': 'page', text: state.committee }));
    }
    if (state.dept) {
      parts.push(el('span', { class: 'sep', 'aria-hidden': 'true', text: '/' }));
      parts.push(el('span', { class: 'crumb-cur', 'aria-current': 'page', text: state.dept }));
    }
    append(clear(c), parts);
  }

  function show(node, focus) {
    view.dropDetail();
    const body = clear($('body'));
    body.appendChild(node);
    if (state.dept) afterDept();
    clearPrint();
    setCrumbs();
    syncSide();
    syncUrl();
    window.scrollTo(0, 0);
    if (focus) { const h = body.querySelector('.page-head h2, .welcome h1'); if (h) h.focus(focusOpts()); }
    document.body.dataset.ready = '1';
  }
  function clearPrint() { const p = $('print-area'); if (p) clear(p); document.body.classList.remove('has-print'); }

  // ---------- 왼쪽 사이드바: 브랜드 · 상임위 → 소관 부서 나무(집행부 화면 .side/.tg/.ti 모양을 그대로 쓴다) ----------
  // 상임위 머리 수 = 그 상임위 표의 합계를 더한 것, 부서 수 = 표의 「합계」 칸(첨부 반영 뒤 rerender 가 다시 그린다).
  // 부서 순서는 표의 기본 순서(물을 거리 많은 순, 같으면 가나다). 두 상임위 소관 부서는 두 곳 모두에 나온다.
  // 상임위 밖 묶음(구청·동 행정복지센터)은 「상임위 밖 묶음」 글 아래, 소관 미확인은 맨 아래(처음엔 접힘).
  const sideOpen = new Set();
  let sideAt = null;   // 지금 펼쳐 둔 기준 묶음 키(c:상임위 · un)
  const drawerOpen = () => { const s = $('side'); return !!s && s.classList.contains('open'); };
  function renderSide() {
    return el('aside', { id: 'side', class: 'side cm-side', 'aria-label': '상임위와 소관 부서', hidden: true },
      el('div', { class: 'side-brand' },
        el('p', { class: 'b-name' }, el('a', { class: 'b-home', id: 'side-home', href: prefs.homeHref(state), title: '처음으로 (상임위 고르기)',
          onclick: e => { e.preventDefault(); closeDrawer(); goHome(true); } }, brand().name || '')),
        brand().subtitle ? el('p', { class: 'b-sub', text: brand().subtitle }) : null),
      el('p', { class: 'eyebrow side-eb', text: 'COMMITTEES' }),
      el('nav', { id: 'cm-tree', class: 'tree', 'aria-label': '상임위와 소관 부서' }));
  }
  function sideGroups() {
    const sum = rows => rows.reduce((n, r) => n + r.total, 0);
    const gs = committees().map(c => {
      const rows = cc().rows(state.ix, c.name, state.actions, state.cfg);
      return { key: 'c:' + c.name, committee: c.name, group: !!c.group, label: c.name, rows, total: sum(rows) };
    });
    const un = (root.DCC_DATA.unassigned || []).filter(n => state.ix.depts.has(n))
      .map(n => Object.assign({ name: n, current: !!(state.ix.depts.get(n) || {}).current }, cc().counts(state.ix, n, state.actions, state.cfg)))
      .sort((a, b) => (b.total - a.total) || ko(a.name, b.name));
    if (un.length) gs.push({ key: 'un', committee: null, label: '소관 미확인', rows: un, total: sum(un) });
    return gs;
  }
  function renderTree() {
    const out = [];
    let groupLabel = false;
    for (const g of sideGroups()) {
      if (g.group && !groupLabel) { groupLabel = true; out.push(el('p', { class: 'eyebrow side-eb cm-side-gl', text: '상임위 밖 묶음' })); }
      if (g.key === 'un') out.push(el('p', { class: 'eyebrow side-eb cm-side-gl', text: '그 밖' }));
      const open = sideOpen.has(g.key);
      const toggle = () => { if (sideOpen.has(g.key)) sideOpen.delete(g.key); else sideOpen.add(g.key); updateTree(); };
      const cur = g.committee ? g.committee === state.committee : (!state.committee && !!state.dept);
      const listId = 'tg-' + kit.cssId(g.key);
      out.push(el('div', { class: 'tg' + (open ? ' open' : ''), dataset: { key: g.key } },
        el('div', { class: 'tg-h' + (cur ? ' cur' : '') },
          el('button', { type: 'button', class: 'tg-tog', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': open ? listId : null,
            'aria-label': g.label + (open ? ' 접기' : ' 펼치기'), onclick: toggle }, icon('chev')),
          g.committee
            ? el('button', { type: 'button', class: 'tg-name', dataset: { committee: g.committee },
              'aria-current': cur && !state.dept ? 'page' : null, title: g.label + ' — 소관 부서 표 보기',
              'aria-label': g.label + ' — 물을 거리 ' + g.total + '건, 소관 부서 표 보기',
              onclick: () => { closeDrawer(); openCommittee(g.committee, true); } }, g.label)
            : el('button', { type: 'button', class: 'tg-name plain', 'aria-expanded': open ? 'true' : 'false',
              'aria-label': g.label + ' ' + g.rows.length + '곳 — 물을 거리 ' + g.total + '건', onclick: toggle }, g.label),
          el('span', { class: 'tg-n mono', 'aria-hidden': 'true', title: '물을 거리', text: String(g.total) })),
        open ? el('ul', { class: 'tg-list', id: listId }, g.rows.map(r => el('li', {},
          el('button', { type: 'button', class: 'ti cm-ti', dataset: { dept: r.name },
            'aria-current': cur && state.dept === r.name ? 'page' : null,
            'aria-label': r.name + (r.current ? '' : '(옛 부서)') + ' — 물을 거리 ' + r.total + '건, 날씨 ' + wxOf(r.total).icon,
            onclick: () => { closeDrawer(); openDept(r.name, g.committee, true); } },
            kit.wxIcon(wxOf(r.total)), el('span', { class: 'ti-t', text: r.name }), el('span', { class: 'ti-n mono', 'aria-hidden': 'true', text: String(r.total) }))))) : null));
    }
    return out;
  }
  // 나무를 다시 그려도 키보드 포커스가 있던 단추(같은 묶음의 펼치기·이름, 같은 부서)로 돌려놓는다.
  function treeFocusSel(n) {
    if (!n || !n.closest || !n.closest('#cm-tree')) return null;
    const g = n.closest('.tg');
    if (!g) return null;
    const base = '.tg[data-key="' + CSS.escape(g.dataset.key) + '"] ';
    if (n.dataset.dept) return base + '.ti[data-dept="' + CSS.escape(n.dataset.dept) + '"]';
    return base + (n.classList.contains('tg-tog') ? '.tg-tog' : '.tg-name');
  }
  function updateTree() {
    const tree = $('cm-tree');
    if (!tree || $('side').hidden) return;
    const sel = treeFocusSel(document.activeElement);
    append(clear(tree), renderTree());
    const n = sel && tree.querySelector(sel);
    if (n) n.focus(focusOpts());
  }
  // 화면을 옮길 때: 시작 화면이면 사이드바·메뉴 단추를 숨기고 한 칸(.solo)으로, 아니면 지금 상임위(소관 미확인이면 그 묶음)를 펼친다.
  function syncSide() {
    const home = !state.committee && !state.dept;
    $('app').classList.toggle('solo', home);
    $('side').hidden = home;
    $('menu-btn').hidden = home;
    if (home) { closeDrawer(); sideAt = null; return; }
    // 다른 상임위로 옮기면 그 상임위만 펼친다. 같은 상임위 안에서 옮길 때는 사람이 펼친·접은 것을 그대로 둔다.
    const key = state.committee ? 'c:' + state.committee : 'un';
    if (key !== sideAt) { sideOpen.clear(); sideOpen.add(key); sideAt = key; }
    updateTree();
  }
  // 폰(≤ 640px): 사이드바는 서랍. 메뉴 단추로 열고 가림막·Esc·항목 고르기로 닫는다(집행부 화면과 같다).
  function openDrawer() {
    $('side').classList.add('open'); $('scrim').hidden = false;
    $('menu-btn').setAttribute('aria-expanded', 'true');
    const cur = document.querySelector('#cm-tree [aria-current=page]') || $('side-home');
    cur.focus();
  }
  function closeDrawer() {
    if (!drawerOpen()) return;
    $('side').classList.remove('open'); $('scrim').hidden = true;
    $('menu-btn').setAttribute('aria-expanded', 'false');
  }
  function toggleDrawer() { if (drawerOpen()) closeDrawer(); else openDrawer(); }

  // ---------- 1. 시작: 상임위 카드 ----------
  // 상임위마다 소관 부서 표(councilCore.rows)를 더해 네 칸·합계·첨부 전을 보인다(councilCore.committeeTotals).
  const committeeTotals = () => cc().committeeTotals(state.ix, state.actions, state.cfg);
  const committeeSums = name => committeeTotals().find(x => x.name === name);
  function goHome(focus) {
    state.committee = null; state.dept = null; state.selected = new Set();
    state.target = null; state.summary = null; state.tab = 'questions';
    const un = (root.DCC_DATA.unassigned || []).slice().sort(ko);
    const all = committeeTotals();
    const cards = all.filter(s => !s.group), groups = all.filter(s => s.group);
    const node = el('section', { class: 'welcome mesh cm-start fc' },
      kit.radarBg(),
      kit.forecastHead(root.DCC_DATA),
      el('h1', { class: 'tagline', tabindex: '-1', text: brand().tagline || brand().name || '' }),
      el('h2', { text: '상임위를 고르면 소관 부서가 물을 거리 많은 순으로 나옵니다' }),
      kit.forecastStrip(core().overview(root.DCC_DATA), { committees: true }),
      noCommittees() ? null : kit.wxLegend(wxScale(), 'wx-legend'),
      noCommittees() ? el('p', { id: 'no-committees', class: 'card warn-box', role: 'alert',
        text: '상임위 자료가 없습니다. 자료가 4차 이전 것일 수 있습니다 — python run.py --offline 으로 자료를 다시 만드십시오.' })
        : el('div', { class: 'cm-cards', role: 'list' }, cards.map(renderCommitteeCard)),
      groups.length ? el('div', { class: 'cm-groups', id: 'cm-groups' },
        el('p', { class: 'cm-glabel eyebrow', text: '상임위 밖 묶음' }),
        el('div', { class: 'cm-cards', role: 'list', 'aria-label': '상임위 밖 묶음' }, groups.map(renderCommitteeCard))) : null,
      un.length ? el('details', { class: 'unassigned', id: 'unassigned' },
        el('summary', {}, '소관 미확인 ', el('span', { class: 'mono', text: String(un.length) }), '곳 — 소관표·최근 지적으로 상임위를 정하지 못한 부서'),
        el('ul', { class: 'un-list' }, un.map(n => el('li', {}, el('button', { type: 'button', class: 'link-btn', dataset: { dept: n },
          onclick: () => openDept(n, null, true), text: n }),
          (state.ix.depts.get(n) || {}).current ? null : badge('옛 부서', 'old'))))) : null,
      el('ol', { class: 'steps' },
        el('li', {}, el('span', { class: 'mono n', text: '01' }), el('span', { text: '상임위를 고릅니다' })),
        el('li', {}, el('span', { class: 'mono n', text: '02' }), el('span', { text: '처리결과를 첨부하고 부서 표에서 부서를 고릅니다' })),
        el('li', {}, el('span', { class: 'mono n', text: '03' }), el('span', { text: '질문 후보를 골라 프롬프트·질문 목록·1쪽 브리핑으로 내보냅니다' }))),
      el('p', { class: 'muted small start-foot', text: '공개자료만 · 인터넷 없이 열림 · 가중치 없이 건수만 · 부서끼리 순위를 매기지 않습니다' }));
    show(node, focus);
  }
  // 예보 카드: 이름 · 부서 수 · 물을 거리 합 · 네 칸 · 소관 부서 날씨 분포(날씨마다 부서 몇 곳) · 첨부 전.
  function renderCommitteeCard(s) {
    const scale = wxScale();
    const dist = scale.map(w => ({ w, n: cc().rows(state.ix, s.name, state.actions, state.cfg).filter(r => wxOf(r.total).level === w.level).length }));
    const distText = dist.map(x => x.w.icon + ' ' + x.n + '곳').join(', ');
    return el('div', { role: 'listitem', class: 'cm-li' }, el('button', { type: 'button', class: 'card cm-card' + (s.group ? ' cm-group' : ''),
      dataset: s.group ? { committee: s.name, group: '1' } : { committee: s.name },
      'aria-label': s.name + (s.group ? '(상임위 밖 묶음)' : '') + ' — 소관 부서 ' + s.depts + '곳, 물을 거리 ' + s.total + '건, 첨부 전 지적 ' + s.pending + '건, 부서 날씨 ' + distText,
      onclick: () => openCommittee(s.name, true) },
      el('span', { class: 'cm-top' }, el('span', { class: 'cm-name', text: s.name }),
        el('span', { class: 'cm-sub', text: (s.group ? '상임위 밖 · 부서 ' : '소관 부서 ') + s.depts + '곳' })),
      el('span', { class: 'cm-total' }, el('span', { class: 'mono', text: String(s.total) }), el('small', { text: '물을 거리' })),
      el('span', { class: 'cm-wx' }, dist.map(x => el('span', { class: 'cw' + (x.n ? '' : ' zero'), dataset: { wx: x.w.icon, n: String(x.n) } },
        kit.wxIcon(x.w, false), el('b', { class: 'mono', text: String(x.n) })))),
      el('span', { class: 'cm-kinds' }, KINDS.map(k => el('span', { class: 'kk ' + k[2] },
        el('i', { class: 'kdot', 'aria-hidden': 'true' }), el('span', { class: 'kl', text: k[1] }), el('b', { class: 'mono', text: String(s[k[0]]) })))),
      el('span', { class: 'cm-pend' }, '첨부 전 지적 ', el('span', { class: 'mono', text: String(s.pending) }), '건 · 합계 밖')));
  }

  // ---------- 처리결과 첨부(상임위 단위 여러 파일 · 부서 단위 한 파일) ----------
  // 흐름은 kit.attachFlow. 대기 파일·기록은 범위(상임위·부서)마다 state.stores 에 둔다(메모리만).
  function deptKeys(names) {
    const out = [];
    for (const n of names) { out.push(n); for (const a of (state.ix.depts.get(n) || {}).aliases || []) out.push(a); }
    return out;
  }
  function findingsOf(names) {
    const seen = new Set(), out = [];
    for (const n of names) for (const f of core().summarize(state.ix, { kind: 'dept', name: n }).findings) {
      if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
    }
    return out;
  }
  function flow(key, opts) {
    if (!state.flows[key]) {
      state.stores[key] = state.stores[key] || {};
      state.flows[key] = kit.attachFlow(Object.assign({
        store: state.stores[key], actions: () => state.actions, focusOpts,
        onApply: acts => { Object.assign(state.actions, acts); rerender(); },
      }, opts));
    }
    return state.flows[key];
  }
  function committeeFlow(name) {
    const names = () => (committeeOf(name) || { depts: [] }).depts;
    return flow('c:' + name, { id: 'cm-attach', multiple: true, findings: () => findingsOf(names()),
      deptKeys: () => deptKeys(names()), label: name, focusFallback: () => $('cm-table') });
  }
  function deptFlow(name) {
    return flow('d:' + name, { id: 'dept-attach', multiple: false, dept: name, findings: () => findingsOf([name]),
      deptKeys: () => deptKeys([name]), label: name, focusFallback: () => $('cand-list') || $('tab-' + state.tab),
      // 첨부 칸은 질문 후보·지적 탭에만 있다. 다른 탭에서 불리면(자체 시험) 질문 후보 탭으로 옮겨 진행을 보인다.
      beforeRead: () => {
        if (state.dept === name && state.tab !== 'questions' && state.tab !== 'findings') { state.tab = 'questions'; renderDeptInto(); syncUrl(); }
      } });
  }
  // 반영 뒤: 지금 화면만 다시 그린다(포커스는 kit 이 첨부 칸 기록으로 옮긴다).
  function rerender() {
    if (state.dept) renderDeptInto();
    else if (state.committee) renderCommitteeInto();
    updateTree();
  }

  // ---------- 2. 상임위: 소관 부서 표 ----------
  function openCommittee(name, focus) {
    if (!committeeOf(name)) { goHome(focus); return; }
    state.committee = name; state.dept = null; state.selected = new Set();
    state.target = null; state.summary = null; state.tab = 'questions';
    show(renderCommittee(), focus);
  }
  function renderCommitteeInto() {
    const a = document.activeElement;
    const th = a && a.closest ? a.closest('#cm-table th[data-sort]') : null;
    const body = clear($('body'));
    body.appendChild(renderCommittee());
    document.body.dataset.ready = '1';
    if (th) { const b = document.querySelector('#cm-table th[data-sort="' + th.dataset.sort + '"] button'); if (b) b.focus(focusOpts()); }
  }
  function renderCommittee() {
    const name = state.committee;
    const s = committeeSums(name);
    const rows = cc().sortRows(cc().rows(state.ix, name, state.actions, state.cfg), state.sort.key, state.sort.dir);
    return el('div', { class: 'cm-page' },
      el('section', { class: 'page-head mesh' },
        eyebrow((committeeOf(name) || {}).group ? 'GROUP — 상임위 밖 묶음' : 'COMMITTEE — 상임위'),
        el('h2', { tabindex: '-1', text: name }),
        el('p', { class: 'muted small' }, '소관 부서 ' + s.depts + '곳 · 물을 거리 ', el('b', { class: 'mono ink', text: String(s.total) }),
          '건 · 첨부 전 지적 ' + s.pending + '건(합계에 넣지 않음)')),
      committeeFlow(name).render(),
      el('section', { class: 'sec' },
        el('div', { class: 'sec-h' }, el('div', { class: 'sec-t' }, eyebrow('OFFICES — 소관 부서'),
          el('h3', { text: '물을 거리 많은 순' }),
          el('p', { class: 'muted small', text: '칸 머리를 누르면 다시 정렬합니다(같은 칸을 다시 누르면 방향이 바뀝니다). 부서 이름을 누르면 질문 후보가 나옵니다.' }))),
        kit.wxLegend(wxScale(), 'wx-legend'),
        rows.length ? el('div', { class: 'table-scroll cm-scroll' }, renderTable(rows))
          : el('p', { class: 'empty', text: '이 상임위에 배정된 부서가 없습니다.' }),
        el('p', { class: 'muted small cm-note', text: '조치 안 됨 = 첨부한 처리결과가 「미조치」「장기검토」인 지적 · 되풀이 = 되풀이 줄기 수 · 약속(추정) = 부서로 추정된 답변 속 약속 · ' +
          '집행 이상 = 최근 마감 연도 집행률 ' + state.cfg.exec_low + '% 미만 또는 ' + state.cfg.exec_high + '% 초과이면 1. 합계는 네 칸의 합(가중치 없음)이고, 첨부 전 지적은 합계에 넣지 않습니다.' })));
  }
  function renderTable(rows) {
    const sortBtn = (key, label) => el('button', { type: 'button', class: 'th-b', onclick: () => sortBy(key) },
      el('span', { text: label }), el('span', { class: 'sort-ic', 'aria-hidden': 'true',
        text: state.sort.key === key ? (state.sort.dir === 'asc' ? '▲' : '▼') : '↕' }));
    const ariaSort = key => (state.sort.key === key ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const numCell = (v, cls) => el('td', { class: 'num ' + (cls || '') + (v ? '' : ' zero') }, el('span', { class: 'n', text: String(v) }));
    return el('table', { id: 'cm-table', class: 'cm-table' },
      el('caption', { class: 'vh', text: state.committee + ' 소관 부서의 물을 거리(건수). 칸 머리 단추로 정렬합니다.' }),
      el('thead', {}, el('tr', {}, COLS.map(([key, label, cat]) =>
        el('th', { scope: 'col', class: (key === 'name' ? 'c-name' : 'c-num') + (cat ? ' ' + cat : ''), dataset: { sort: key }, 'aria-sort': ariaSort(key) },
          sortBtn(key, label))))),
      el('tbody', {}, rows.map(r => el('tr', { dataset: { dept: r.name }, onclick: e => { if (!e.target.closest('button')) openDept(r.name, state.committee, true); } },
        el('th', { scope: 'row', class: 'c-name' }, el('span', { class: 'c-name-in' }, kit.wxIcon(wxOf(r.total)),
          el('button', { type: 'button', class: 'link-btn plain dept-b', onclick: () => openDept(r.name, state.committee, true), text: r.name }),
          r.current ? null : badge('옛 부서', 'old'))),
        KINDS.map(k => numCell(r[k[0]], k[2])),
        el('td', { class: 'num total' }, el('span', { class: 'n', text: String(r.total) })),
        el('td', { class: 'num pend' + (r.pending ? '' : ' zero') }, el('span', { class: 'n', text: String(r.pending) }))))));
  }
  function sortBy(key) {
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { key, dir: key === 'name' ? 'asc' : 'desc' };
    renderCommitteeInto();
    prefs.announce((COLS.find(c => c[0] === key) || [0, key])[1] + ' ' + (state.sort.dir === 'asc' ? '오름차순' : '내림차순') + ' 정렬');
  }

  // ---------- 3. 부서: 질문 후보 ----------
  function openDept(name, committee, focus) {
    const ix = state.ix;
    if (!ix.depts.has(name) && ix.alias.has(name)) name = ix.alias.get(name);
    if (!ix.depts.has(name)) {
      goHome(false);
      $('body').insertBefore(el('section', { class: 'card warn-box', role: 'alert' },
        el('p', { text: '「' + name + '」을(를) 찾지 못했습니다. 상임위를 고른 뒤 부서 표에서 다시 골라 주십시오.' })), $('body').firstChild);
      document.body.dataset.ready = 'notfound';
      return;
    }
    if (!committee || !(committeeOf(committee) || { depts: [] }).depts.includes(name)) {
      const c = committees().find(x => x.depts.includes(name));
      committee = c ? c.name : null;
    }
    if (state.dept !== name) { state.selected = new Set(); state.preview = false; state.promiseShown = 0; }
    state.committee = committee; state.dept = name;
    state.target = { kind: 'dept', name };
    state.summary = core().summarize(ix, state.target);
    show(renderDept(), focus);
  }
  // 몸통에 붙인 뒤: 예산 막대(칸 폭에 맞춤)와 상세 패널을 그린다.
  function afterDept() { view.drawCharts(); view.renderDetail(); }
  function renderDeptInto() {
    const body = clear($('body'));
    body.appendChild(renderDept());
    afterDept();
    document.body.dataset.ready = '1';
  }
  function setTab(tab, focus) {
    if (!TAB_IDS.has(tab) || !state.dept) return;
    state.tab = tab;
    renderDeptInto();
    syncUrl();
    const tabs = $('tabs');
    if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    if (focus) $('tab-' + tab).focus(focusOpts());
  }
  function candidates() { return cc().candidates(state.ix, state.dept, state.actions, state.cfg); }
  function renderDept() {
    const name = state.dept, d = state.ix.depts.get(name);
    // 반영을 다시 해 후보에서 빠진 것(예: 미조치 → 완료)은 고른 목록에서도 뺀다(고른 순서는 그대로).
    const live = new Set(candidates().map(x => x.id));
    state.selected = new Set([...state.selected].filter(id => live.has(id)));
    const c = cc().counts(state.ix, name, state.actions, state.cfg);
    const s = state.summary;
    const pend = s.findings.filter(f => !state.actions[f.id]);
    state.reopened = view.reopenedIds(s);
    return el('div', { class: 'dept-page' },
      el('section', { class: 'page-head mesh' },
        eyebrow('DEPARTMENT' + (state.committee ? ' — ' + state.committee : ' — 소관 미확인')),
        el('h2', { tabindex: '-1' }, name, ' ', d.current ? null : badge('옛 부서', 'old')),
        el('p', { class: 'muted small', text: '소속 ' + (!d.silguk || d.silguk === '기타' ? '미확인' : d.silguk) +
          ' · 행감 지적 ' + s.findings.length + '건 · 물을 거리 ' + c.total + '건' })),
      view.renderTabs(s),
      el('div', { id: 'tabpanel', class: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-' + state.tab }, renderTab(s, c, pend)));
  }
  function renderTab(s, c, pend) {
    switch (state.tab) {
      case 'findings': return view.renderFindings(s);
      case 'recurring': return view.renderRecurring(s);
      case 'promises': return view.renderPromises(s);
      case 'budget': return view.renderBudget(s);
      case 'coverage': return view.renderCoverage(s);
      default: return renderQuestions(c, pend, s);
    }
  }
  // 질문 후보 탭: 물을 거리 네 칸 · 첨부 전 줄 · 부서 요약(되풀이·최근 지적·예산 추이와 최근 마감 집행률 — 집행부 요약 탭과 같은 deptview 칸) · 처리결과 첨부 · 질문 후보 ·
  // 내보내기 막대(이 탭에만 — 고르는 곳과 내보내는 곳을 한 탭에 둔다). 요약의 네 칸 카드는 물을 거리 네 칸과 겹치므로 쓰지 않는다.
  function renderQuestions(c, pend, s) {
    return el('div', { id: 'sec-questions', class: 'questions' },
      el('section', { class: 'cards cm-counts', 'aria-label': '물을 거리' }, KINDS.map(k =>
        el('div', { class: 'card sum-card ' + k[2] }, el('span', { class: 'k', text: k[1] }),
          el('span', { class: 'v' }, el('span', { class: 'mono', text: String(c[k[0]]) }), el('small', { text: k[0] === 'recurring' ? '줄기' : '건' }))))),
      el('p', { class: 'pend-line' + (pend.length ? '' : ' none') }, el('span', { class: 'pdot', 'aria-hidden': 'true' }),
        el('span', {}, pend.length ? ['첨부 전 지적 ', el('b', { class: 'mono', text: String(pend.length) }), '건 — 처리결과를 첨부하면 조치 안 된 것이 「조치 안 된 지적」 후보로 올라옵니다(합계에 넣지 않음).']
          : '이 부서의 지적은 모두 처리결과가 반영되었습니다.')),
      el('section', { id: 'dept-summary', class: 'dept-summary', 'aria-label': '부서 요약' }, view.renderSummaryGrid(s), view.renderSummaryBudget(s, { rate: true })),
      deptFlow(state.dept).render(),
      renderCandidates(pend),
      renderExportBar());
  }

  // ---------- 4. 내보내기 막대(부서 화면 아래 고정): 프롬프트 복사 · 질문 목록(인쇄·CSV) · 1쪽 브리핑 ----------
  const SESSIONS = [['행감', '행정사무감사'], ['업무보고', '주요업무보고'], ['예산심의', '예산 심의']];
  function picked() {
    const byId = new Map(candidates().map(x => [x.id, x]));
    return [...state.selected].map(id => byId.get(id)).filter(Boolean);
  }
  const ctx = () => ({ dept: state.dept, committee: state.committee, group: !!(committeeOf(state.committee) || {}).group, picked: picked() });
  function currentPrompt() { return cc().promptText((root.DCC_PROMPTS || {})[state.session] || '', ctx()); }
  function currentCsv() { return cc().csvText(ctx()); }
  const safeName = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_');
  function exportMsg(text) { const m = $('export-msg'); if (m) m.textContent = text; }
  // 고른 「조치 안 됨」 후보의 근거에 첨부한 처리결과 문장(내부 문서)이 들어 있으면 내보내기 전에 알린다(집행부 #p-attach-warn 과 같은 문구).
  const attachIncluded = () => picked().some(x => x.kind === 'unfixed' && ((state.actions[x.id] || {}).text || '').trim());
  const ATTACH_WARN = '첨부한 처리결과 내용이 포함됩니다. 기관 AI 업무비서에만 붙여 넣으십시오.';
  function syncAttachWarn() {
    const on = attachIncluded();
    for (const id of ['export-attach-warn', 'pp-attach-warn']) { const w = $(id); if (w) w.hidden = !on; }
  }

  // 프롬프트 미리 보기: 「프롬프트 보기」 단추로 여닫는 읽기 전용 칸(#prompt-preview-box, 막대 안 맨 위).
  // 글은 #btn-prompt 가 복사하는 것과 같은 currentPrompt() 이고, 후보 고르기·전부 고르기·회기·첨부 반영 때 바로 다시 채운다.
  // 여닫힘은 메모리(state.preview)에만 둔다 — 저장하지 않고 주소에도 넣지 않는다.
  const LIMIT = () => ((root.DCC.prompts || {}).LIMIT || 6000);
  function syncPreview(scope) {
    const q = id => (scope ? scope.querySelector('#' + id) : $(id));
    const box = q('prompt-preview-box');
    const tg = q('btn-preview');
    if (tg) tg.setAttribute('aria-expanded', state.preview ? 'true' : 'false');
    if (!box) return;
    box.hidden = !state.preview;
    if (!state.preview) return;
    const none = state.selected.size === 0;
    const text = none ? '' : currentPrompt();
    const m = none ? null : /^외 (\d+)건 생략$/m.exec(text);
    kit.fillPreview(q, { none, text, count: text.length + ' / ' + LIMIT() + '자', warn: attachIncluded(),
      omit: m ? '전체가 ' + LIMIT() + '자를 넘어 고른 후보 뒤쪽 ' + m[1] + '건을 뺐습니다. 글 끝에 「외 ' + m[1] + '건 생략」으로 적힙니다.' : '' });
  }
  function togglePreview() {
    state.preview = !state.preview;
    syncPreview();
    prefs.announce(state.preview ? '프롬프트 미리 보기를 열었습니다' : '프롬프트 미리 보기를 닫았습니다');
    if (state.preview) { const p = $('prompt-preview'); if (p && !p.hidden) p.scrollTop = 0; }
  }
  function renderPreview() {
    return kit.previewBox({ hidden: !state.preview, onCopy: copyPrompt, warn: ATTACH_WARN,
      hint: '질문 후보를 하나 이상 고르면 복사될 프롬프트가 여기에 보입니다.' });
  }
  // 회기: 세 단추짜리 분할 단추(radiogroup). 고른 것만 tabindex 0(roving), ←/→/Home/End 로 옮기면 바로 고른다.
  function setSession(k, focus) {
    const g = $('session-control');
    if (!g || !SESSIONS.some(s => s[0] === k)) return;
    const changed = state.session !== k;
    state.session = k;
    g.querySelectorAll('[data-session]').forEach(b => {
      const on = b.dataset.session === k;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    if (changed) { exportMsg(''); syncPreview(); }
  }
  function sessionKey(e) {
    const keys = SESSIONS.map(s => s[0]);
    const i = keys.indexOf(e.currentTarget.dataset.session);
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: keys.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setSession(keys[(to + keys.length) % keys.length], true);
  }
  function renderSessionControl() {
    return el('div', { class: 'eb-sess' },
      el('span', { id: 'session-lbl', class: 'eb-sess-l small', text: '회기' }),
      el('div', { id: 'session-control', class: 'seg-ctl', role: 'radiogroup', 'aria-labelledby': 'session-lbl' },
        SESSIONS.map(([k, label]) => {
          const on = state.session === k;
          return el('button', { type: 'button', role: 'radio', class: 'seg-ctl-b', dataset: { session: k },
            'aria-checked': on ? 'true' : 'false', tabindex: on ? '0' : '-1', text: label,
            onclick: () => setSession(k, true), onkeydown: sessionKey });
        })));
  }
  function renderExportBar() {
    const none = state.selected.size === 0;
    const bar = el('section', { id: 'export-bar', class: 'export-bar', 'aria-label': '내보내기' },
      renderPreview(),
      renderSessionControl(),
      el('span', { class: 'eb-n small' }, '고른 후보 ', el('b', { id: 'export-n', class: 'mono', text: String(state.selected.size) }), '개'),
      el('div', { class: 'btns eb-btns' },
        el('button', { type: 'button', id: 'btn-preview', class: 'btn', 'aria-expanded': state.preview ? 'true' : 'false',
          'aria-controls': 'prompt-preview-box', onclick: togglePreview, text: '프롬프트 보기' }),
        el('button', { type: 'button', id: 'btn-prompt', class: 'btn pill primary', disabled: none, onclick: copyPrompt, text: '프롬프트 복사' }),
        el('button', { type: 'button', id: 'btn-print-list', class: 'btn', disabled: none, onclick: () => { renderList(); root.print(); }, text: '질문 목록 인쇄' }),
        el('button', { type: 'button', id: 'btn-csv', class: 'btn', disabled: none, onclick: downloadCsv, text: '질문 목록 CSV' }),
        el('button', { type: 'button', id: 'btn-brief', class: 'btn', onclick: () => { renderBrief(); root.print(); }, text: '1쪽 브리핑 인쇄' })),
      el('p', { id: 'export-attach-warn', class: 'att-warn eb-warn', hidden: !attachIncluded(), text: ATTACH_WARN }),
      el('p', { id: 'export-msg', class: 'eb-msg small', role: 'status' }));
    syncPreview(bar);
    return bar;
  }
  async function copyPrompt() {
    const ok = await kit.copyText(currentPrompt());
    exportMsg(ok ? '복사했습니다. 기관 AI 업무비서 입력 칸에 붙여 넣으십시오.' : '복사하지 못했습니다. 브라우저가 클립보드를 막았을 수 있습니다.');
  }
  function downloadCsv() {
    kit.downloadText('질문목록_' + safeName(state.dept) + '.csv', '﻿' + currentCsv(), 'text/csv;charset=utf-8');
    exportMsg('질문 목록 CSV 를 내려받았습니다(이 컴퓨터에 저장, 어디로도 보내지 않음).');
  }

  // 인쇄용 칸(#print-area): 화면에서는 숨고, 인쇄할 때만 이것만 보인다(body.has-print).
  const eok = won => { const v = won / 1e8; return v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1); };
  const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  function printHead(title) {
    const d = state.ix.depts.get(state.dept) || {};
    return [el('p', { class: 'pr-eb', text: (brand().name || '') + ' · ' + (state.committee || '소관 미확인') }),
      el('h1', { class: 'pr-h', text: title }),
      el('p', { class: 'pr-meta', text: '소속 ' + (!d.silguk || d.silguk === '기타' ? '미확인' : d.silguk) + ' · 자료 기준일 ' +
        (root.DCC_DATA.generated || '—') + ' · 인쇄 ' + today() })];
  }
  function printFoot() {
    return el('p', { class: 'pr-src', text: '출처: ' + (region().의회명 || '') + ' 행정사무감사 결과보고서 · 시정질문 답변요지서 · ' +
      (region().지자체명 || '') + ' 누리집 사업 및 예산정보(지방재정365 보충 포함). 물을 거리는 가중치 없이 건수만 센 것이며 부서 간 순위가 아닙니다. ' +
      '약속의 부서·되풀이 묶음은 기계가 만든 것이므로 원문으로 확인하십시오.' });
  }
  function fillPrint(kind, kids) {
    const p = clear($('print-area'));
    p.dataset.kind = kind;
    append(p, kids);
    document.body.classList.add('has-print');
    return p;
  }
  function qTable(list) {
    return el('table', { class: 'pr-table' },
      el('thead', {}, el('tr', {}, ['번호', '종류', '질문 후보', '연도', '근거'].map(h => el('th', { text: h })))),
      el('tbody', {}, list.map((c, i) => el('tr', {}, el('td', { class: 'n', text: 'Q' + (i + 1) }),
        el('td', { class: 'n', text: cc().KIND_LABEL[c.kind] }), el('td', { text: c.title }), el('td', { class: 'n', text: c.year ? String(c.year) : '' }),
        el('td', { class: 'pr-ev', text: c.evidence })))));
  }
  function renderList() {
    const list = picked();
    return fillPrint('list', [...printHead(state.dept + ' — 질문 목록'),
      el('p', { class: 'pr-meta', text: '회기: ' + (SESSIONS.find(s => s[0] === state.session) || [0, state.session])[1] + ' · 고른 후보 ' + list.length + '개(고른 순서)' }),
      list.length ? qTable(list) : el('p', { text: '고른 후보가 없습니다.' }), printFoot()]);
  }
  function renderBrief() {
    const name = state.dept;
    const c = cc().counts(state.ix, name, state.actions, state.cfg);
    const s = core().summarize(state.ix, { kind: 'dept', name });
    const sel = picked(), top = (sel.length ? sel : candidates()).slice(0, 8);
    const recs = [...s.recurring].sort((a, b) => Math.max(...b.years) - Math.max(...a.years)).slice(0, 3);
    const years = s.expenditure.filter(e => e.year <= s.now && e.budget > 0).slice(-5);
    const rate = e => (Math.round(e.spent / e.budget * 1000) / 10) + '%';
    return fillPrint('brief', [...printHead(name + ' — 1쪽 브리핑'),
      el('div', { class: 'pr-counts' }, KINDS.map(k => el('div', { class: 'pr-c' }, el('span', { class: 'k', text: k[1] }), el('b', { text: String(c[k[0]]) }))),
        el('div', { class: 'pr-c tot' }, el('span', { class: 'k', text: '합계' }), el('b', { text: String(c.total) })),
        el('div', { class: 'pr-c pend' }, el('span', { class: 'k', text: '첨부 전(합계 밖)' }), el('b', { text: String(c.pending) }))),
      el('h2', { class: 'pr-s', text: (sel.length ? '고른 질문 후보(고른 순서)' : '질문 후보(고른 것 없음 — 전체에서)') + ' · 최대 8개' }),
      top.length ? el('ol', { class: 'pr-q' }, top.map(x => el('li', {}, el('b', { text: '[' + cc().KIND_LABEL[x.kind] + '] ' }), x.title,
        x.year ? ' (' + x.year + ')' : '', el('span', { class: 'pr-ev', text: ' — ' + x.evidence }))))
        : el('p', { text: '질문 후보가 없습니다.' }),
      el('div', { class: 'pr-2col' },
        el('section', {}, el('h2', { class: 'pr-s', text: '되풀이 줄기(최근 3개)' }),
          recs.length ? el('ul', { class: 'pr-rec' }, recs.map(r => {
            const fs = r.finding_ids.map(id => state.fById.get(id)).filter(Boolean);
            return el('li', {}, el('b', { text: r.years.join('→') + ' ' }), fs.length ? fs[fs.length - 1].title : '',
              (r.common || []).length ? el('span', { class: 'pr-ev', text: ' · 겹친 낱말 ' + r.common.join('·') }) : null);
          })) : el('p', { text: '되풀이 줄기 없음' })),
        el('section', {}, el('h2', { class: 'pr-s', text: '예산 추이(최근 5년, 억 원)' }),
          years.length ? el('table', { class: 'pr-table pr-bud' },
            el('thead', {}, el('tr', {}, ['연도', '예산', '집행', '집행률'].map(h => el('th', { text: h })))),
            el('tbody', {}, years.map(e => el('tr', {}, el('td', { class: 'n', text: e.year + (e.mended ? '*' : '') + (e.year >= s.now ? ' 진행 중' : '') }),
              el('td', { class: 'n', text: eok(e.budget) }), el('td', { class: 'n', text: eok(e.spent) }), el('td', { class: 'n', text: rate(e) })))))
            : el('p', { text: '세출 자료 없음' }),
          years.some(e => e.mended) ? el('p', { class: 'pr-ev', text: '* 지방재정365 보충' }) : null)),
      printFoot()]);
  }

  // 후보 묶음: 조치 안 된 지적 / 되풀이 지적 / 답변 속 약속(추정) / 집행 이상. 체크 상자 + 한 줄 제목 + 근거 펼침.
  // 목록 틀(묶음·체크·전부 고르기·고른 수)은 kit.candList — 집행부 프롬프트 탭과 같은 것(2026-09-29).
  function renderCandidates(pend) {
    const cs = candidates();
    return kit.candList({ id: 'cand-list', eyebrow: 'QUESTIONS — 질문 후보', title: '질문 후보',
      lead: '질문으로 쓸 후보를 고르십시오. 근거를 펼쳐 원문과 대조하십시오.', countLabel: '고른 후보', selected: state.selected,
      onChange: () => syncPicked(),
      groups: KINDS.map(k => ({ cls: k[2], kind: k[3], title: k[4], empty: emptyText(k[3], pend),
        items: cs.filter(x => x.kind === k[3]).map(x => ({ id: x.id, title: x.title, year: x.year, evidence: x.evidence, more: () => evidenceMore(x) })) })) });
  }
  function emptyText(kind, pend) {
    if (kind === 'unfixed') return pend.length ? '처리결과를 첨부해 「미조치」「장기검토」로 반영된 지적이 아직 없습니다.' : '조치 안 된 지적이 없습니다.';
    if (kind === 'recurring') return '여러 해에 되풀이된 지적 줄기가 없습니다.';
    if (kind === 'promise') return '이 부서로 추정된 답변 속 약속이 없습니다.';
    return '최근 마감 연도 집행률이 기준(' + state.cfg.exec_low + '~' + state.cfg.exec_high + '%) 안이거나 세출 자료가 없습니다.';
  }
  // 근거 펼침의 덧붙임: 지적 요지·되풀이 지적 목록·약속 질문 요지·원문 링크.
  function evidenceMore(x) {
    if (x.kind === 'unfixed') {
      const f = state.fById.get(x.id);
      return f ? [el('p', { class: 'ev-b', text: f.body || '결과보고서에 요지가 따로 적혀 있지 않습니다.' }), srcLink(f.uid, '결과보고서 원문')] : null;
    }
    if (x.kind === 'recurring') {
      const r = root.DCC_DATA.recurring.find(z => z.id === x.id);
      if (!r) return null;
      return el('ul', { class: 'ev-fs' }, r.finding_ids.map(id => state.fById.get(id)).filter(Boolean).map(f =>
        el('li', {}, el('span', { class: 'y mono', text: String(f.year) }), el('span', { class: 't', text: f.title }), srcLink(f.uid))));
    }
    if (x.kind === 'promise') {
      const p = root.DCC_DATA.promises.find(z => z.id === x.id);
      return p ? [p.question ? el('p', { class: 'ev-b' }, el('span', { class: 'muted', text: '질문 요지 ' }), p.question) : null,
        el('p', { class: 'hint', text: '부서는 답변 낱말로 기계가 추정한 것입니다 — 확인 필요' }), srcLink(p.uid, '답변요지서 원문')] : null;
    }
    return el('p', { class: 'hint', text: '출처: ' + (region().지자체명 || '') + ' 누리집 사업 및 예산정보' });
  }
  function srcLink(uid, label) {
    const s = state.ix.src.get(uid);
    if (!s || !s.url) return null;
    // 의회 누리집 주소만 링크로 만든다. 그 밖의 주소는 글자로만 보인다(집행부 화면과 같은 규칙).
    const b = (region().의회 || {}).base;
    if (!(b && /^https:\/\//.test(b) && String(s.url).startsWith(b + '/'))) return el('span', { class: 'src-text', text: (label || '원문') + ' (' + s.url + ')' });
    return el('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'src', text: label || '원문' });
  }
  function syncPicked() {
    kit.candSync($('cand-list'));
    const en = $('export-n'); if (en) en.textContent = String(state.selected.size);
    for (const id of ['btn-prompt', 'btn-print-list', 'btn-csv']) { const b = $(id); if (b) b.disabled = state.selected.size === 0; }
    syncAttachWarn();
    syncPreview();
  }

  // 자체 시험(Task 7)이 쓰는 것: 첨부(확인 표 만들기)·반영, 내보내기 내용(currentPrompt·currentCsv·renderList·renderBrief). 지금 화면(부서 → 부서 칸, 상임위 → 상임위 칸)의 첨부 흐름.
  function currentFlow() { return state.dept ? deptFlow(state.dept) : state.committee ? committeeFlow(state.committee) : null; }
  function attachBytes(fileName, bytes) {
    const f = currentFlow();
    if (!f) return Promise.reject(new Error('먼저 상임위나 부서를 고르십시오'));
    return f.attachBytes(fileName, bytes);
  }
  function applyPending() { const f = currentFlow(); return f ? f.apply() : 0; }

  root.DCC = root.DCC || {};
  root.DCC.council = { start, fromQuery, state, goHome, openCommittee, openDept, setTab, sortBy, attachBytes, applyPending, candidates, picked,
    currentPrompt, currentCsv, renderList, renderBrief, openDetail: id => view.openDetail(id), closeDetail: () => view.closeDetail() };
})(typeof window !== 'undefined' ? window : globalThis);
