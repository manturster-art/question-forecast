// 역할: 의원용 페이지 Edge 헤드리스 자체 시험 러너(4차 Task 7). ?selftest 로 상임위 → 부서 표 → 첨부 → 질문 후보 →
// 내보내기를 스스로 돌려 몸통 끝에 id 「selftest」인 pre 태그를 하나 붙이고 결과 JSON 을 적는다(site/js/selftest.js 와 같은 꼴).
// 오프라인 산출물(의원점검표.html)에는 들어가지 않는다 — dcc/site_build.build(..., page='council', selftest=True) 일 때 만드는
// 시험판(의원점검표_selftest.html)에만 selftest_fixture.js 와 함께 council.js 뒤에 붙는다. council.js 는 이 파일을 모른다 —
// council.js 가 부르는 DCC.council.onReady 훅 하나로만 이어진다.
// 복사(kit.copyText)·내려받기(kit.downloadText)·인쇄(window.print)는 헤드리스에서 멈추거나 막히므로 잠시 가짜로 바꿔 끼워
// 넘어간 내용만 보고 끝나면 되돌린다. 네트워크(fetch·XHR·sendBeacon)는 감싸서 세기만 한다(0 이어야 통과).
(function (root) {
  const council = root.DCC.council;
  const kit = root.DCC.kit;
  const ko = (a, b) => a.localeCompare(b, 'ko');
  const COMMITTEES = ['의회운영위원회', '기획행정위원회', '복지환경위원회', '도시교통위원회'];
  const URL_KEYS = ['committee', 'dept', 'tab', 'fs', 'theme'];
  // 부서 화면 탭 순서(질문 후보가 첫째·기본, 프롬프트 탭 없음).
  const TAB_ORDER = ['questions', 'findings', 'recurring', 'promises', 'budget', 'coverage'];
  const tabIds = () => [...document.querySelectorAll('#tabs [role=tab]')].map(b => b.dataset.tab);
  const selTab = () => { const b = document.querySelector('#tabs [role=tab][aria-selected="true"]'); return b ? b.dataset.tab : null; };

  function csvField(v) { const s = String(v == null ? '' : v); return '"' + s.replace(/"/g, '""') + '"'; }
  // 견본 CSV(첨부 칸 「견본 CSV」와 같은 머리)에 가짜 조치 한 줄: 그 지적을 「미조치」로.
  function selftestCsv(f, dept, status) {
    return '﻿연도,위원회,부서,지적번호,지적제목,조치상태,조치내용\n' +
      [f.year || '', '', csvField(dept), '', csvField(f.title), status || '미조치', '자체시험'].join(',') + '\n';
  }
  const rowsOf = () => [...document.querySelectorAll('#cm-table tbody tr[data-dept]')];
  const cellN = (tr, i) => Number(tr.querySelectorAll('td')[i].textContent.trim());   // td 순서: 네 칸 · 합계 · 첨부 전
  const rowOf = name => rowsOf().find(tr => tr.dataset.dept === name);
  // 사이드바 나무: 상임위 묶음(.tg[data-key="c:이름"]) · 그 안 부서 단추(.ti[data-dept]) · 수(.tg-n / .ti-n).
  const sideGroup = cm => document.querySelector('#cm-tree .tg[data-key="' + CSS.escape('c:' + cm) + '"]');
  const sideItem = (cm, dept) => { const g = sideGroup(cm); return g ? g.querySelector('.ti[data-dept="' + CSS.escape(dept) + '"]') : null; };
  const sideN = (cm, dept) => { const b = sideItem(cm, dept); return b ? Number(b.querySelector('.ti-n').textContent) : -1; };
  const sideHeadN = cm => { const g = sideGroup(cm); return g ? Number(g.querySelector('.tg-n').textContent) : -1; };
  // 날씨 그림: 표 행(이름 칸)·사이드바 부서 단추의 svg.wx. 라벨·모양이 councilCore.weather(합계)와 같아야 한다.
  const wxFor = total => root.DCC.councilCore.weather(total, council.state.cfg);
  const rowWx = tr => tr.querySelector('th .wx');
  const wxMismatch = () => rowsOf().filter(tr => {
    const i = rowWx(tr), w = wxFor(cellN(tr, 4));
    return !i || i.getAttribute('role') !== 'img' || i.getAttribute('aria-label') !== w.label || i.dataset.wx !== w.icon || !i.classList.contains('wx-' + w.key);
  }).map(tr => tr.dataset.dept);
  const sideShown = () => { const s = document.getElementById('side'); return !!s && !s.hidden && s.getBoundingClientRect().width > 0; };

  async function selftest() {
    const steps = [];
    const add = (name, ok, detail) => steps.push({ name, ok: !!ok, detail: detail === undefined ? null : String(detail) });

    let netCalls = 0;
    const origFetch = root.fetch;
    if (origFetch) root.fetch = function () { netCalls++; return origFetch.apply(this, arguments); };
    const XHR = root.XMLHttpRequest;
    const origOpen = XHR && XHR.prototype.open;
    if (origOpen) XHR.prototype.open = function () { netCalls++; return origOpen.apply(this, arguments); };
    const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (origBeacon) navigator.sendBeacon = function () { netCalls++; return origBeacon.apply(navigator, arguments); };
    const origCopy = kit.copyText, origDown = kit.downloadText, origPrint = root.print;

    try {
      // ① 시작 화면: 상임위 카드 네 장(의회운영·기획행정·복지환경·도시교통)
      try {
        council.goHome(false);
        const names = [...document.querySelectorAll('.cm-card[data-committee]:not([data-group])')].map(b => b.dataset.committee);
        add('상임위 카드 네 장', names.length === 4 && COMMITTEES.every(c => names.includes(c)), names.join(','));
      } catch (e) { add('상임위 카드 네 장', false, e); }

      // ①-1 시작 화면에는 사이드바·메뉴 단추가 없다(한 칸 .solo).
      try {
        const side = document.getElementById('side'), mb = document.getElementById('menu-btn');
        const solo = document.getElementById('app').classList.contains('solo');
        add('시작 화면 사이드바 없음', !!side && side.hidden && !sideShown() && !!mb && mb.hidden && solo,
          '사이드바 숨김=' + (side && side.hidden) + ' 메뉴 단추 숨김=' + (mb && mb.hidden) + ' solo=' + solo);
      } catch (e) { add('시작 화면 사이드바 없음', false, e); }

      // ①-1b 예보 시작 화면(2026-09-29): 레이더·등압선 배경, 발표 줄, 「전체 예보」 띠(자료 전체 수 + 상임위 수), 범례, 예보 카드의 날씨 분포.
      try {
        const w = document.querySelector('#body .welcome');
        const g = root.DCC_DATA.generated || '';
        const head = (document.getElementById('fc-head') || {}).textContent || '';
        const ov = root.DCC.core.overview(root.DCC_DATA);
        const n = k => { const li = document.querySelector('#fc-strip .fc-i[data-k="' + k + '"]'); return li ? li.dataset.n : null; };
        const numsOk = ['findings', 'recurring', 'promises', 'committees'].every(k => n(k) === String(ov[k])) && n('period') === ov.from + '~' + ov.to;
        const lg = document.getElementById('wx-legend');
        const scale = root.DCC.councilCore.weatherScale(council.state.cfg);
        const legendOk = !!lg && lg.textContent.includes('날씨 = 물을 거리 건수 기준(평가 아님)') && lg.querySelectorAll('li').length === scale.length &&
          scale.every(x => lg.textContent.includes(x.icon) && lg.textContent.includes(x.range));
        // 카드 분포: 날씨마다 부서 몇 곳 = 그 상임위 부서 표의 합계로 고른 날씨 수
        const bad = [];
        for (const card of document.querySelectorAll('.cm-card[data-committee]')) {
          const rows = root.DCC.councilCore.rows(council.state.ix, card.dataset.committee, council.state.actions, council.state.cfg);
          for (const cw of card.querySelectorAll('.cm-wx .cw')) {
            const want = rows.filter(r => wxFor(r.total).icon === cw.dataset.wx).length;
            if (Number(cw.dataset.n) !== want || Number(cw.querySelector('b').textContent) !== want) bad.push(card.dataset.committee + ':' + cw.dataset.wx);
          }
          if (card.querySelectorAll('.cm-wx .cw').length !== scale.length || !card.getAttribute('aria-label').includes('부서 날씨')) bad.push(card.dataset.committee);
        }
        const ok = !!w.querySelector('.fc-bg[aria-hidden="true"] .fc-sweep') && !!w.querySelector('.fc-iso') &&
          head === '의회 예보 · ' + g + ' 발표 · 공개자료 기준' && numsOk && legendOk && !bad.length &&
          w.querySelector('h1.tagline').textContent === (root.DCC_BRAND.tagline || '');
        add('예보 시작 화면', ok, '발표=' + head + ' 띠=' + ['findings', 'recurring', 'promises', 'committees', 'period'].map(k => k + ':' + n(k)).join(',') +
          ' 범례=' + legendOk + ' 카드 어긋남=' + bad.join(','));
      } catch (e) { add('예보 시작 화면', false, e); }

      // ①-2 다섯째 카드: 상임위 밖 묶음(구청·동 행정복지센터) — 네 장 뒤 「상임위 밖 묶음」 칸에 따로, 누르면 같은 부서 표.
      //      묶음 부서는 어느 상임위에도 없다.
      try {
        const g = (root.DCC_DATA.groups || [])[0];
        const card = document.querySelector('#cm-groups .cm-card[data-group]');
        const label = document.querySelector('#cm-groups .cm-glabel');
        const inCm = new Set((root.DCC_DATA.committees || []).flatMap(c => c.depts));
        const clash = g ? g.depts.filter(n => inCm.has(n)) : ['(묶음 없음)'];
        card.click();
        const trs = rowsOf();
        const eb = document.querySelector('.cm-page .page-head .eyebrow').textContent;
        const ok = !!g && card.dataset.committee === g.name && !!label && label.textContent.includes('상임위 밖 묶음') &&
          council.state.committee === g.name && trs.length === g.depts.length && trs.length >= 1 && eb.includes('상임위 밖 묶음') && !clash.length;
        add('상임위 밖 묶음 카드', ok, (g ? g.name : '(없음)') + ' 행=' + trs.length + ' 겹침=' + clash.join(',') + ' 머리=' + eb);
        council.goHome(false);
      } catch (e) { add('상임위 밖 묶음 카드', false, e); }

      // ② 첫 카드 → 소관 부서 표 행 ≥ 1, 합계 칸 내림차순(기본 정렬)
      try {
        const card = document.querySelector('.cm-card[data-committee]');
        card.click();
        const trs = rowsOf();
        const totals = trs.map(tr => cellN(tr, 4));
        const desc = totals.every((v, i) => !i || totals[i - 1] >= v);
        const th = document.querySelector('#cm-table th[data-sort="total"]');
        add('상임위 부서 표', trs.length >= 1 && desc && th.getAttribute('aria-sort') === 'descending',
          card.dataset.committee + ' 행=' + trs.length + ' 합계=' + totals.join(',') + ' aria-sort=' + th.getAttribute('aria-sort'));
      } catch (e) { add('상임위 부서 표', false, e); }

      // ③ 「부서」 머리 클릭 → aria-sort="ascending", 가나다순. 합계 머리로 되돌린다.
      try {
        // 행이 여럿인 상임위에서 본다(첫 카드 의회운영위원회는 한 곳뿐일 수 있다).
        const many = COMMITTEES.find(c => ((root.DCC_DATA.committees || []).find(x => x.name === c) || { depts: [] }).depts.length > 1);
        if (many) council.openCommittee(many, false);
        document.querySelector('#cm-table th[data-sort="name"] button').click();
        const th = document.querySelector('#cm-table th[data-sort="name"]');
        const names = rowsOf().map(tr => tr.dataset.dept);
        const sorted = names.join() === [...names].sort(ko).join();
        const asc = th.getAttribute('aria-sort') === 'ascending';
        const others = [...document.querySelectorAll('#cm-table th[data-sort]')].filter(x => x !== th).every(x => x.getAttribute('aria-sort') === 'none');
        document.querySelector('#cm-table th[data-sort="total"] button').click();
        add('부서 이름 정렬', asc && sorted && others && names.length > 1,
          (many || '') + ' aria-sort=' + th.getAttribute('aria-sort') + ' 가나다=' + sorted + ' 다른 칸 none=' + others + ' 행=' + names.length);
      } catch (e) { add('부서 이름 정렬', false, e); }

      // ③-1 상임위 화면: 사이드바가 보이고 네 상임위 + 상임위 밖 묶음 머리가 있으며, 지금 상임위만 펼쳐져 aria-current 이고
      //      그 부서 단추 수 = 표 행 수, 순서 = 표의 기본 순서(물을 거리 많은 순).
      try {
        const cm = council.state.committee;
        const g = sideGroup(cm);
        const heads = [...document.querySelectorAll('#cm-tree .tg[data-key^="c:"]')].map(x => x.dataset.key.slice(2));
        const want = [...COMMITTEES, ...(root.DCC_DATA.groups || []).map(x => x.name)];
        const open = [...document.querySelectorAll('#cm-tree .tg.open')].map(x => x.dataset.key);
        const name = g && g.querySelector('.tg-name');
        const items = g ? [...g.querySelectorAll('.ti[data-dept]')].map(b => b.dataset.dept) : [];
        const tableOrder = rowsOf().map(tr => tr.dataset.dept);
        const gl = [...document.querySelectorAll('#cm-tree .cm-side-gl')].some(p => p.textContent.includes('상임위 밖 묶음'));
        const ok = sideShown() && want.every(n => heads.includes(n)) && open.length === 1 && open[0] === 'c:' + cm &&
          !!name && name.getAttribute('aria-current') === 'page' && g.querySelector('.tg-tog').getAttribute('aria-expanded') === 'true' &&
          items.join() === tableOrder.join() && gl && document.getElementById('menu-btn').hidden === false;
        add('상임위 화면 사이드바', ok, cm + ' 머리=' + heads.join(',') + ' 펼침=' + open.join(',') + ' 부서=' + items.length + '/' + tableOrder.length +
          ' 순서 같음=' + (items.join() === tableOrder.join()));
      } catch (e) { add('상임위 화면 사이드바', false, e); }

      // ③-2 사이드바 부서 수 = 표 「합계」 칸, 상임위 머리 수 = 머리글의 물을 거리 합.
      try {
        const cm = council.state.committee;
        const bad = rowsOf().filter(tr => sideN(cm, tr.dataset.dept) !== cellN(tr, 4)).map(tr => tr.dataset.dept);
        const headTotal = Number(document.querySelector('.cm-page .page-head b.mono').textContent);
        add('사이드바 수 = 표 합계', !bad.length && rowsOf().length > 0 && sideHeadN(cm) === headTotal,
          cm + ' 행=' + rowsOf().length + ' 어긋남=' + bad.join(',') + ' 머리 ' + sideHeadN(cm) + '/' + headTotal);
      } catch (e) { add('사이드바 수 = 표 합계', false, e); }

      // ③-2b 날씨 그림 = 물을 거리: 표 행마다 이름 칸에 날씨 그림(role=img, 「흐림 — 물을 거리 5~9건」 라벨)이 있고 합계로 고른 것과 같다.
      //       사이드바 부서 단추도 같은 그림·라벨(단추 aria-label 에 날씨), 상임위 화면에 범례가 있다.
      try {
        const cm = council.state.committee;
        const bad = wxMismatch();
        const sideBad = rowsOf().filter(tr => {
          const b = sideItem(cm, tr.dataset.dept), i = b && b.querySelector('.wx'), w = wxFor(cellN(tr, 4));
          return !i || i.dataset.wx !== w.icon || i.getAttribute('aria-label') !== w.label || !b.getAttribute('aria-label').endsWith('날씨 ' + w.icon);
        }).map(tr => tr.dataset.dept);
        const lg = document.querySelector('.cm-page #wx-legend');
        const ok = rowsOf().length > 0 && !bad.length && !sideBad.length && !!lg && lg.textContent.includes('날씨 = 물을 거리 건수 기준(평가 아님)');
        add('날씨 아이콘 = 물을 거리', ok, cm + ' 행=' + rowsOf().length + ' 표 어긋남=' + bad.join(',') + ' 사이드바 어긋남=' + sideBad.join(',') +
          ' 예=' + (rowsOf()[0] ? rowWx(rowsOf()[0]).getAttribute('aria-label') : '') + ' 범례=' + !!lg);
      } catch (e) { add('날씨 아이콘 = 물을 거리', false, e); }

      // ③-3 사이드바 부서 단추를 누르면 그 부서 화면이 열리고, 사이드바에서 그 단추가 aria-current 가 된다.
      try {
        const cm = council.state.committee;
        const btns = [...sideGroup(cm).querySelectorAll('.ti[data-dept]')];
        const pick = btns[btns.length > 1 ? 1 : 0];
        const dept = pick.dataset.dept;
        pick.click();
        const cur = sideItem(cm, dept);
        const ok = council.state.dept === dept && council.state.committee === cm && !!document.getElementById('cand-list') &&
          !!cur && cur.getAttribute('aria-current') === 'page' && document.querySelectorAll('#cm-tree [aria-current="page"]').length === 1 &&
          new URLSearchParams(location.search).get('dept') === dept;
        add('사이드바 부서 열기', ok, cm + ' / ' + dept + ' 화면=' + council.state.dept + ' 주소=' + location.search);
      } catch (e) { add('사이드바 부서 열기', false, e); }

      // ④ 상임위 첨부(#cm-attach)에 견본 CSV(첨부 전 지적이 있는 첫 부서의 첫 지적 = 미조치)를 넣고 반영
      //    → 그 행 「조치 안 됨」 ≥ 1, 「첨부 전」 1 감소
      let target = null, sideBefore = null;
      try {
        const cm = COMMITTEES.find(c => {
          council.openCommittee(c, false);
          return rowsOf().some(tr => cellN(tr, 5) > 0);
        });
        if (!cm) throw new Error('첨부 전 지적이 있는 상임위가 없습니다');
        const tr = rowsOf().find(r => cellN(r, 5) > 0);
        const dept = tr.dataset.dept;
        const f = root.DCC.core.summarize(council.state.ix, { kind: 'dept', name: dept }).findings.find(x => !council.state.actions[x.id]);
        const before = { unfixed: cellN(tr, 0), pending: cellN(tr, 5) };
        sideBefore = { item: sideN(cm, dept), head: sideHeadN(cm), total: cellN(tr, 4) };
        const hasBox = !!document.getElementById('cm-attach');
        const res = await council.attachBytes('자체시험_처리결과.csv', new TextEncoder().encode(selftestCsv(f, dept)).buffer);
        const n = council.applyPending();
        const after = rowOf(dept);
        const unfixed = after ? cellN(after, 0) : -1, pending = after ? cellN(after, 5) : -1;
        target = { committee: cm, dept, fid: f.id };
        add('상임위 첨부 반영', hasBox && !res.error && res.matched >= 1 && n >= 1 && council.state.actions[f.id] &&
          council.state.actions[f.id].status === '미조치' && unfixed >= 1 && pending === before.pending - 1,
          cm + ' / ' + dept + ' 짝=' + res.matched + ' 반영=' + n + ' 조치 안 됨 ' + before.unfixed + '→' + unfixed +
          ' 첨부 전 ' + before.pending + '→' + pending);
      } catch (e) { add('상임위 첨부 반영', false, e); }

      // ④-1 반영 뒤 사이드바 수도 바뀐다: 그 부서 수 = 표 합계(첨부 전 → 조치 안 됨이면 +1), 상임위 머리 수도 같이 +1.
      try {
        if (!target || !sideBefore) throw new Error('앞 단계 실패');
        const tr = rowOf(target.dept);
        const now = cellN(tr, 4), item = sideN(target.committee, target.dept), head = sideHeadN(target.committee);
        const headTotal = Number(document.querySelector('.cm-page .page-head b.mono').textContent);
        add('첨부 반영 뒤 사이드바 수', item === now && item === sideBefore.item + 1 && sideBefore.item === sideBefore.total &&
          head === sideBefore.head + 1 && head === headTotal,
          target.dept + ' 사이드바 ' + sideBefore.item + '→' + item + ' 표 ' + sideBefore.total + '→' + now + ' 머리 ' + sideBefore.head + '→' + head);
      } catch (e) { add('첨부 반영 뒤 사이드바 수', false, e); }

      // ④-2 반영 뒤 날씨도 새 합계를 따른다(표 행·사이드바 모두).
      try {
        if (!target) throw new Error('앞 단계 실패');
        const tr = rowOf(target.dept);
        const w = wxFor(cellN(tr, 4));
        const i = rowWx(tr), si = sideItem(target.committee, target.dept).querySelector('.wx');
        add('첨부 반영 뒤 날씨', !wxMismatch().length && i.getAttribute('aria-label') === w.label && si.getAttribute('aria-label') === w.label,
          target.dept + ' 합계=' + cellN(tr, 4) + ' 날씨=' + i.getAttribute('aria-label') + ' 사이드바=' + si.getAttribute('aria-label'));
      } catch (e) { add('첨부 반영 뒤 날씨', false, e); }

      // ⑤ 그 행 클릭 → 부서 화면, #cand-list 에 「조치 안 된 지적」 묶음(방금 반영한 지적)
      try {
        if (!target) throw new Error('앞 단계 실패');
        rowOf(target.dept).querySelector('td.total').click();
        const g = document.querySelector('#cand-list .cand-group[data-kind="unfixed"]');
        const ok = council.state.dept === target.dept && !!g && g.querySelector('.cg-h').textContent.includes('조치 안 된 지적') &&
          !!g.querySelector('input.cand[data-id="' + target.fid + '"]');
        add('질문 후보 묶음', ok, '부서=' + council.state.dept + ' 조치 안 된 지적=' + (g ? g.querySelectorAll('li.cand-row').length : 0) + '건');
      } catch (e) { add('질문 후보 묶음', false, e); }

      // ⑥ #pick-all → #btn-prompt 켜짐, 복사 내용에 Q1 과 부서 이름(kit.copyText 를 가로챈다).
      //    고른 것에 첨부한 처리결과 문장(「자체시험」)이 들어가므로 #export-attach-warn 이 보여야 한다(최종 검토 Minor 4).
      try {
        const btn = document.getElementById('btn-prompt');
        const off = btn.disabled;
        document.getElementById('pick-all').click();
        const on = !btn.disabled;
        let copied = null;
        kit.copyText = async t => { copied = t; return true; };
        btn.click();
        await new Promise(r => setTimeout(r, 0));
        const msg = document.getElementById('export-msg').textContent;
        const warn = document.getElementById('export-attach-warn');
        const warnOn = !!warn && !warn.hidden && warn.textContent.includes('AI 업무비서');
        add('프롬프트 복사', off && on && typeof copied === 'string' && copied.includes('Q1') && copied.includes(council.state.dept) &&
          msg.includes('복사했습니다') && warnOn, '처음 꺼짐=' + off + ' 고른 뒤 켜짐=' + on + ' 길이=' + (copied || '').length + ' 안내=' + msg +
          ' 첨부 경고=' + warnOn);
      } catch (e) { add('프롬프트 복사', false, e); }
      finally { kit.copyText = origCopy; }

      // ⑥-2 「프롬프트 보기」 → #prompt-preview 글 === #btn-prompt 가 복사하는 글, 미리 보기 안 「복사」도 같은 글.
      //      aria-expanded·aria-controls, 글자 수 칸, 첨부 경고(#pp-attach-warn)도 본다.
      try {
        const tg = document.getElementById('btn-preview');
        const before = tg.getAttribute('aria-expanded');
        tg.click();
        const box = document.getElementById(tg.getAttribute('aria-controls'));
        const pre = document.getElementById('prompt-preview');
        const copied = [];
        kit.copyText = async t => { copied.push(t); return true; };
        document.getElementById('btn-prompt').click();
        document.getElementById('pp-copy').click();
        await new Promise(r => setTimeout(r, 0));
        const shown = pre.textContent;
        const count = document.getElementById('pp-count').textContent;
        const warn = document.getElementById('pp-attach-warn');
        const ok = before === 'false' && tg.getAttribute('aria-expanded') === 'true' && !!box && !box.hidden && !pre.hidden &&
          pre.tabIndex === 0 && copied.length === 2 && copied[0] === shown && copied[1] === shown && shown === council.currentPrompt() &&
          count.startsWith(shown.length + ' / ' + root.DCC.prompts.LIMIT) && !warn.hidden;
        add('미리 보기 = 복사 글', ok, '열림=' + tg.getAttribute('aria-expanded') + ' 길이=' + shown.length + ' 복사=' + copied.map(t => t.length).join(',') +
          ' 글자 수=' + count + ' 첨부 경고=' + !warn.hidden);
      } catch (e) { add('미리 보기 = 복사 글', false, e); }
      finally { kit.copyText = origCopy; }

      // ⑥-3 후보 하나를 풀면 미리 보기가 바로 바뀌고(그 후보 제목이 빠짐), 다시 고르면 되돌아온다. 모두 풀면 안내 글만.
      try {
        const pre = document.getElementById('prompt-preview');
        const a = pre.textContent;
        const cbs = [...document.querySelectorAll('#cand-list input.cand')];
        const cb = cbs[cbs.length - 1];
        cb.click();
        const b = pre.textContent;
        const expectB = council.state.selected.size ? council.currentPrompt() : '';
        cb.click();
        const c = pre.textContent;
        document.getElementById('pick-all').click();   // 모두 풀기
        const hint = document.getElementById('pp-hint');
        const emptyOk = pre.hidden && !hint.hidden && document.getElementById('pp-copy').disabled;
        document.getElementById('pick-all').click();   // 다시 전부 고르기
        const back = pre.textContent === council.currentPrompt() && !pre.hidden;
        add('후보 고르기 → 미리 보기', a !== b && b === expectB && c === a && emptyOk && back,
          '처음=' + a.length + ' 하나 풂=' + b.length + ' 다시 고름=' + c.length + ' 모두 풂 안내=' + emptyOk + ' 되돌림=' + back);
      } catch (e) { add('후보 고르기 → 미리 보기', false, e); }

      // ⑥-4 회기를 바꾸면 미리 보기 문구가 바뀐다(틀이 다름). 행감으로 되돌리고 미리 보기를 닫는다.
      try {
        // 회기는 분할 단추(#session-control, role=radiogroup). 고른 칸만 aria-checked=true·tabindex 0, → 키로 옮겨도 고른다.
        const grp = document.getElementById('session-control');
        const btns = [...grp.querySelectorAll('[data-session]')];
        const cur = () => btns.find(b => b.getAttribute('aria-checked') === 'true');
        const pre = document.getElementById('prompt-preview');
        const a = pre.textContent;
        const other = btns.map(b => b.dataset.session).find(v => v !== cur().dataset.session);
        grp.querySelector('[data-session="' + other + '"]').click();
        const b = pre.textContent;
        const aria = grp.getAttribute('role') === 'radiogroup' && btns.every(x => x.getAttribute('role') === 'radio') &&
          cur().dataset.session === other && btns.filter(x => x.tabIndex === 0).length === 1 && cur().tabIndex === 0;
        const ok = council.state.session === other && a !== b && b === council.currentPrompt() && aria;
        const first = grp.querySelector('[data-session="행감"]');
        first.click();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const keyOk = council.state.session === btns[1].dataset.session && document.activeElement === btns[1];
        btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        const back = pre.textContent === a && council.state.session === '행감' && keyOk;
        const tg = document.getElementById('btn-preview');
        tg.click();
        const closed = tg.getAttribute('aria-expanded') === 'false' && document.getElementById('prompt-preview-box').hidden;
        const q = new URLSearchParams(location.search);
        const urlOk = [...q.keys()].every(k => URL_KEYS.includes(k));
        add('회기 → 미리 보기 문구', ok && back && closed && urlOk, '회기=' + other + ' 바뀜=' + (a !== b) + ' 접근성=' + aria + ' 키=' + keyOk + ' 되돌림=' + back + ' 닫힘=' + closed +
          ' 주소=' + location.search);
      } catch (e) { add('회기 → 미리 보기 문구', false, e); }

      // ⑦ #btn-csv → 내려받을 내용 첫 줄(BOM 뒤) 「번호,종류,제목,연도,근거」(kit.downloadText 를 가로챈다)
      try {
        let got = null;
        kit.downloadText = (name, text, type) => { got = { name, text, type }; };
        document.getElementById('btn-csv').click();
        const first = got ? got.text.replace(/^﻿/, '').split('\n')[0] : '';
        add('질문 목록 CSV', !!got && got.text.startsWith('﻿') && first === '번호,종류,제목,연도,근거' && /\.csv$/.test(got.name),
          (got ? got.name : '(안 불림)') + ' 첫 줄=' + first);
      } catch (e) { add('질문 목록 CSV', false, e); }
      finally { kit.downloadText = origDown; }

      // ⑧ #btn-brief → #print-area 에 물을 거리 네 칸·출처 줄(window.print 를 가로챈다)
      try {
        let printed = 0;
        root.print = () => { printed++; };
        document.getElementById('btn-brief').click();
        const pa = document.getElementById('print-area');
        const labels = [...pa.querySelectorAll('.pr-counts .pr-c .k')].map(n => n.textContent);
        const four = ['조치 안 됨', '되풀이', '약속(추정)', '집행 이상'].every(k => labels.includes(k));
        const src = pa.querySelector('.pr-src');
        add('1쪽 브리핑', printed === 1 && pa.dataset.kind === 'brief' && four && !!src && src.textContent.startsWith('출처') &&
          document.body.classList.contains('has-print'), '인쇄 호출=' + printed + ' 칸=' + labels.join('·') + ' 출처=' + !!src);
      } catch (e) { add('1쪽 브리핑', false, e); }
      finally { root.print = origPrint; document.body.classList.remove('has-print'); }

      // ⑨ 고른 「조치 안 됨」 지적을 부서 첨부로 「완료」 재반영 → 후보에서 빠지고 고른 목록에서도 빠진다(최종 검토 Minor 3).
      //    고른 수 = 실제로 내보낼 후보 수, 첨부 경고는 숨는다.
      try {
        if (!target) throw new Error('앞 단계 실패');
        const f = council.state.fById.get(target.fid);
        const had = council.state.selected.has(target.fid);
        const res = await council.attachBytes('자체시험_재반영.csv', new TextEncoder().encode(selftestCsv(f, target.dept, '완료')).buffer);
        const n = council.applyPending();
        const sel = council.state.selected, pk = council.picked();
        const shown = Number(document.getElementById('picked-n').textContent);
        const warn = document.getElementById('export-attach-warn');
        const btn = document.getElementById('btn-prompt');
        const ok = had && !res.error && n >= 1 && council.state.actions[target.fid].status === '완료' && !sel.has(target.fid) &&
          pk.length === sel.size && shown === sel.size && !!warn && warn.hidden && btn.disabled === (sel.size === 0) &&
          !document.querySelector('#cand-list input.cand[data-id="' + target.fid + '"]');
        add('재반영 뒤 고른 후보 정리', ok, '재반영 전 고름=' + had + ' 반영=' + n + ' 고른 수=' + sel.size + ' 내보낼 수=' + pk.length +
          ' 표시=' + shown + ' 경고 숨김=' + (warn && warn.hidden));
      } catch (e) { add('재반영 뒤 고른 후보 정리', false, e); }

      // ⑨-1 부서 화면 탭: 질문 후보·지적·되풀이·약속·예산·자료 범위 순서(요약 탭 없음), 기본은 질문 후보(주소에 tab 없음),
      //      질문 후보 뱃지 = 후보 수, → 키로 지적 탭(aria-selected·포커스), Home 으로 되돌린다. 내보내기 막대는 질문 후보 탭에만.
      try {
        if (!target) throw new Error('앞 단계 실패');
        const ids = tabIds();
        const first = selTab();
        const badgeN = Number((document.querySelector('#tab-questions .count') || { textContent: '-1' }).textContent);
        const noTabInUrl = !new URLSearchParams(location.search).has('tab');
        const list = document.getElementById('tabs');
        const panelOk = document.getElementById('tabpanel').getAttribute('aria-labelledby') === 'tab-questions' && list.getAttribute('role') === 'tablist';
        document.getElementById('tab-questions').focus();
        document.getElementById('tab-questions').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const moved = selTab() === 'findings' && document.activeElement && document.activeElement.id === 'tab-findings' &&
          !document.getElementById('export-bar') && !document.getElementById('dept-summary');
        document.getElementById('tab-findings').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        const back = selTab() === 'questions' && !!document.getElementById('export-bar') && !!document.getElementById('cand-list');
        add('부서 탭 순서', ids.join() === TAB_ORDER.join() && first === 'questions' && badgeN === council.candidates().length && noTabInUrl &&
          panelOk && moved && back, '탭=' + ids.join(',') + ' 처음=' + first + ' 후보 뱃지=' + badgeN + '/' + council.candidates().length +
          ' → 지적=' + moved + ' Home=' + back);
      } catch (e) { add('부서 탭 순서', false, e); }

      // ⑨-1b 질문 후보 탭 위 부서 요약: #dept-summary 가 #cand-list 보다 앞에 있고, 되풀이(최근 3줄기)·최근 지적(6건) 칸이
      //      state.summary 와 같은 수. 요약 탭은 없고, 옛 주소 tab=summary 는 질문 후보 탭으로 연다.
      try {
        if (!target) throw new Error('앞 단계 실패');
        const s = council.state.summary;
        const box = document.getElementById('dept-summary'), list = document.getElementById('cand-list');
        const above = !!box && !!list && !!(box.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
        const recN = box ? box.querySelectorAll('#sum-recurring .mini-rec li').length : -1;
        const recentN = box ? box.querySelectorAll('#sum-recent .frow').length : -1;
        // 첨부 반영(앞 단계)이 요약 칸의 이행 표시에도 같이 보인다(같은 state.actions).
        const implOk = [...box.querySelectorAll('#sum-recent .frow')].every(r => !!council.state.actions[r.dataset.fid] === !!r.querySelector('.impl.has'));
        const counts = recN === Math.min(3, s.recurring.length) && recentN === Math.min(6, s.findings.length) && implOk;
        const noTab = !document.getElementById('tab-summary') && !document.getElementById('sec-summary');
        const q = new URLSearchParams(location.search); q.set('tab', 'summary');
        council.fromQuery('?' + q.toString());
        const fallback = council.state.tab === 'questions' && selTab() === 'questions' && !!document.getElementById('dept-summary');
        add('질문 후보 탭 요약', above && counts && noTab && fallback, '요약 위=' + above + ' 되풀이=' + recN + '/' + s.recurring.length +
          ' 최근=' + recentN + '/' + s.findings.length + ' 요약 탭 없음=' + noTab + ' tab=summary→' + council.state.tab);
      } catch (e) { add('질문 후보 탭 요약', false, e); }

      // ⑧-2 질문 후보 탭 요약의 예산 칸(2026-09-29): 되풀이·최근 지적 뒤, 첨부 칸 앞에 예산 추이 작은 그래프와 최근 마감 연도 집행률.
      //      집행률은 예산 탭 「숫자로 보기」 표의 같은 해 값과 같아야 한다.
      try {
        if (!target) throw new Error('앞 단계 실패');
        const box = document.getElementById('sum-budget'), grid = document.querySelector('#dept-summary .sum-grid');
        const att = document.querySelector('#tabpanel #dept-attach');
        const order = !!box && !!grid && !!att && !!(grid.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          !!(box.compareDocumentPosition(att) & Node.DOCUMENT_POSITION_FOLLOWING) && box.closest('#dept-summary') !== null;
        const r = document.getElementById('sum-rate');
        const chart = !!box && !!box.querySelector('#budget-mini svg') && !!box.querySelector('.more-link');
        const year = r ? r.dataset.year : '', rate = r ? r.dataset.rate : '';
        council.setTab('budget');
        const row = [...document.querySelectorAll('#tabpanel details.nums tbody tr')].find(tr => tr.cells[0].textContent.trim().split(/\s/)[0] === year);
        const tabRate = row ? row.cells[3].textContent.trim().split('%')[0] : null;
        council.setTab('questions');
        const back = selTab() === 'questions' && !!document.getElementById('sum-budget');
        add('질문 후보 탭 예산', order && chart && !!r && tabRate === rate && r.textContent.includes(rate + '%') && back,
          '순서=' + order + ' 그래프=' + chart + ' ' + year + '년 요약=' + rate + ' 예산 탭=' + tabRate + ' 돌아옴=' + back);
      } catch (e) { add('질문 후보 탭 예산', false, e); }

      // ⑨-2 지적 탭 이행 칸 = 이 화면 state.actions: ⑨ 에서 「완료」로 반영한 지적 줄은 이행 「완료」, 첨부 칸도 지적 탭 머리에 있다.
      //      같은 반영으로 질문 후보에서는 빠졌다(두 곳이 한 actions 를 본다).
      try {
        if (!target) throw new Error('앞 단계 실패');
        council.setTab('findings');
        const row = document.querySelector('#tabpanel .frow[data-fid="' + CSS.escape(target.fid) + '"]');
        const impl = row && row.querySelector('.impl');
        const st = row && row.querySelector('.st');
        const others = [...document.querySelectorAll('#tabpanel .frow')].filter(r => !council.state.actions[r.dataset.fid]);
        const plain = others.every(r => !r.querySelector('.impl.has'));
        const ok = !!impl && impl.classList.contains('has') && !!st && st.textContent === '완료' && plain &&
          !!document.querySelector('#tabpanel #dept-attach') && !council.candidates().some(x => x.id === target.fid);
        add('지적 탭 이행 반영', ok, target.fid + ' 이행=' + (st ? st.textContent : '(없음)') + ' 미첨부 줄=' + others.length + ' 첨부 칸=' +
          !!document.querySelector('#tabpanel #dept-attach'));
      } catch (e) { add('지적 탭 이행 반영', false, e); }

      // ⑨-3 되풀이 탭: 되풀이 줄기가 있는 부서(주택과가 있으면 주택과)에서 줄기마다 연도 사슬(→)이 자료의 years 와 같다.
      let recDept = null;
      try {
        const recs = root.DCC_DATA.recurring || [];
        const has = n => recs.some(r => r.dept === n) && council.state.ix.depts.has(n);
        recDept = has('주택과') ? '주택과' : (recs.find(r => has(r.dept)) || {}).dept;
        if (!recDept) throw new Error('되풀이 줄기가 있는 부서가 없습니다');
        council.openDept(recDept, null, false);
        council.setTab('recurring');
        const want = council.state.summary.recurring;
        const cards = [...document.querySelectorAll('#tabpanel article.rec')];
        const bad = want.filter(r => {
          const a = cards.find(c => c.dataset.rid === r.id);
          const ys = a ? [...a.querySelectorAll('.rec-h .chain .yr')].map(n => Number(n.textContent)) : [];
          return ys.join() !== r.years.join() || a.querySelectorAll('.rec-h .chain .arr').length !== r.years.length - 1;
        }).map(r => r.id);
        const badge = Number(document.querySelector('#tab-recurring .count').textContent);
        add('되풀이 탭 연도 사슬', want.length >= 1 && cards.length === want.length && !bad.length && badge === want.length && selTab() === 'recurring',
          recDept + ' 줄기=' + cards.length + '/' + want.length + ' 어긋남=' + bad.join(',') + ' 사슬=' + want.map(r => r.years.join('→')).join(' · '));
      } catch (e) { add('되풀이 탭 연도 사슬', false, e); }

      // ⑨-4 예산 탭: 막대그래프(svg 막대)와 「숫자로 보기」 표(2016년부터 한 해 한 줄).
      try {
        const name = recDept && (root.DCC_DATA.expenditure[recDept] || []).some(e => e.budget > 0) ? recDept
          : Object.keys(root.DCC_DATA.expenditure).sort().find(n => council.state.ix.depts.has(n) && root.DCC_DATA.expenditure[n].some(e => e.year >= 2016 && e.budget > 0));
        if (council.state.dept !== name) council.openDept(name, null, false);
        council.setTab('budget');
        const svgEl = document.querySelector('#budget-chart svg');
        const bars = svgEl ? svgEl.querySelectorAll('rect.bar-b').length : 0;
        const want = council.state.summary.expenditure.filter(e => e.year >= 2016);
        const trs = document.querySelectorAll('#tabpanel details.nums tbody tr').length;
        const sum = document.querySelector('#tabpanel details.nums summary');
        add('예산 탭 그래프·숫자표', bars >= 1 && bars === want.filter(e => e.budget > 0).length && trs === want.length && !!sum &&
          sum.textContent.includes('숫자로 보기'), name + ' 막대=' + bars + ' 표 줄=' + trs + '/' + want.length);
      } catch (e) { add('예산 탭 그래프·숫자표', false, e); }

      // ⑨-5 주소 tab= 왕복: 예산 탭 주소(committee·dept·tab 만)를 처음으로 간 뒤 같은 길(fromQuery)로 다시 열면 같은 부서·같은 탭.
      //      질문 후보 탭으로 돌아가면 주소에서 tab 이 빠진다.
      try {
        const s1 = location.search, q1 = new URLSearchParams(s1), dept = council.state.dept;
        const keysOk = [...q1.keys()].every(k => URL_KEYS.includes(k)) && q1.get('tab') === 'budget';
        council.goHome(false);
        const gone = !new URLSearchParams(location.search).has('tab');
        council.fromQuery(s1);
        const again = council.state.dept === dept && council.state.tab === 'budget' && selTab() === 'budget' &&
          !!document.querySelector('#budget-chart svg') && location.search === s1;
        council.setTab('questions');
        const cleared = !new URLSearchParams(location.search).has('tab') && !!document.getElementById('cand-list');
        add('주소 tab 왕복', keysOk && gone && again && cleared, '주소=' + s1 + ' 처음으로 뒤 tab 없음=' + gone + ' 다시 열기=' + again + ' 질문 후보 뒤=' + location.search);
      } catch (e) { add('주소 tab 왕복', false, e); }

      // ⑩ 글자 크기 올림 → 처음으로 → 주소에 fs=112 유지(committee·dept 는 빠짐). Alt+0 으로 되돌린다.
      try {
        document.getElementById('fs-up').click();
        document.getElementById('home-btn').click();
        const q = new URLSearchParams(location.search);
        const ok = q.get('fs') === '112' && !q.has('committee') && !q.has('dept') && !!document.querySelector('.cm-card') &&
          council.state.committee === null && document.getElementById('brand-home').getAttribute('href').includes('fs=112');
        const search = location.search;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', altKey: true, bubbles: true }));
        add('처음으로·글자 크기 유지', ok && !new URLSearchParams(location.search).has('fs'), '주소=' + search + ' Alt+0 뒤=' + location.search);
      } catch (e) { add('처음으로·글자 크기 유지', false, e); }

      // ⑪ 네트워크 요청 0, 저장소 쓰기 0(첨부·고른 후보는 메모리에만)
      try {
        add('네트워크·저장소 0', netCalls === 0 && localStorage.length === 0 && sessionStorage.length === 0,
          '네트워크=' + netCalls + ' localStorage=' + localStorage.length + ' sessionStorage=' + sessionStorage.length);
      } catch (e) { add('네트워크·저장소 0', false, e); }
    } finally {
      if (origFetch) root.fetch = origFetch;
      if (origOpen) XHR.prototype.open = origOpen;
      if (origBeacon) navigator.sendBeacon = origBeacon;
      kit.copyText = origCopy; kit.downloadText = origDown; root.print = origPrint;
    }
    return { ok: steps.every(s => s.ok), steps };
  }

  // 의원용 화면은 start() 안에서 주소를 committee·dept·fs·theme 만 남기게 고쳐 쓰므로(onReady 보다 먼저) 「?selftest」는 읽힐 때 본다.
  const wanted = new URLSearchParams(location.search).has('selftest');
  council.onReady = function () {
    if (!wanted) return;
    selftest().catch(e => ({ ok: false, steps: [{ name: '러너 오류', ok: false, detail: String((e && e.stack) || e) }] }))
      .then(res => { document.body.appendChild(kit.el('pre', { id: 'selftest' }, JSON.stringify(res))); });
  };

  const api = { selftest };
  root.DCC = root.DCC || {};
  root.DCC.councilSelftest = api;
})(typeof window !== 'undefined' ? window : globalThis);
