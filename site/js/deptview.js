// 역할: 부서 화면 탭 그리기 공용 모듈 → root.DCC.deptview.create(ctx).
// 집행부 화면(ui.js)에서 꺼낸 것이다(2026-09-29, 의원용 부서 화면 탭). 요약·지적·되풀이·약속·예산(막대그래프·「숫자로 보기」 표·초과 설명)·
// 자료 범위 탭, 탭 줄(role=tablist, 좌우 화살표·Home·End, 건수 뱃지), 지적 상세 패널을 그린다. ui.js 의 겉동작은 바뀌지 않아야 한다.
// 두 화면이 각자 state 를 넘긴다: ix·fById·summary·target·actions(첨부 반영 — 이행 칸)·include·promiseShown·groupBy·detail·reopened·fs·tab.
// ctx: { state, tabs: [[id, 이름, 머리말]…], setTab(id, focus), rerender(), renderAttach()?, detailFoot(f)?, promiseCheck, onInclude(pid, on)?, focusOpts(), tabCount(id, s)? }
// 자료 문자열은 모두 textContent(텍스트 노드)로만 넣는다 — innerHTML 에 자료를 넣지 않는다(XSS 방지). 부서 순위는 만들지 않는다.
(function (root) {
  const kit = root.DCC.kit;
  const { el, append, svg, $, clear, comName, badge, icon, statusIcon, statusCls } = kit;

  function create(ctx) {
    const state = ctx.state;
    const TABS = ctx.tabs;
    const setTab = (tab, focus) => ctx.setTab(tab, focus);
    const render = () => ctx.rerender();
    const renderAttach = () => (ctx.renderAttach ? ctx.renderAttach() : null);
    const isSilguk = () => !!state.target && state.target.kind === 'silguk';
    const focusOpts = () => ctx.focusOpts();
    const BUDGET_FROM = 2016;
    // 집행률 100% 초과 해의 설명(막대 도움말·숫자표 아래 한 줄).
    const OVER_NOTE = '예산현액을 넘는 집행은 이월·보충 자료 차이일 수 있음';
    const PROMISE_PAGE = 8;
    const region = () => root.DCC_REGION || {};
    const isSafeUrl = u => { const b = (region().의회 || {}).base; return !!b && /^https:\/\//.test(b) && String(u).startsWith(b + '/'); };
    const STATUS_ORDER = ['미첨부', '미조치', '장기검토', '추진중', '계속추진', '완료'];
    // 분류색(Task 4e): 행감 지적 파랑 · 되풀이 장미 · 약속 보라 · 집행률(예산) 청록. 색만으로 뜻을 전하지 않도록 늘 글자와 함께 쓴다.
    const CAT = { findings: 'cat-find', recurring: 'cat-rec', promises: 'cat-prom', budget: 'cat-exec' };
    const EB_CAT = { FINDINGS: 'cat-find', RECURRING: 'cat-rec', PROMISES: 'cat-prom', BUDGET: 'cat-exec' };
    const eok = won => { const v = won / 1e8; return v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1); };
    const ebCat = text => EB_CAT[String(text).split(' ')[0]] || '';
    const eyebrow = text => el('p', { class: ('eyebrow ' + ebCat(text)).trim(), text });
    const ko = (a, b) => a.localeCompare(b, 'ko');
    function srcLink(uid, label) {
      const s = state.ix.src.get(uid);
      if (!s || !s.url) return null;
      // 의회 누리집 주소만 링크로 만든다. 그 밖의 주소는 글자로만 보인다.
      if (!isSafeUrl(s.url)) return el('span', { class: 'src-text', text: (label || '원문') + ' (' + s.url + ')' });
      return el('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'src', text: label || '원문' });
    }

    function tabCount(id, s) {
      const c = s.counts;
      if (id === 'findings') return c.findings;
      if (id === 'recurring') return c.recurring;
      if (id === 'promises') return c.guessedPromises;
      if (id === 'budget') return s.expenditure.filter(e => e.year >= BUDGET_FROM && e.budget > 0).length;
      if (id === 'coverage') return s.coverage.length;
      return ctx.tabCount ? ctx.tabCount(id, s) : null;
    }
    const TAB_TIP = { budget: '세출 자료가 있는 해 수', coverage: '이 대상 지적이 나온 결과보고서 수' };
    // 자료 범위: 파싱/선언이 어긋난(불일치·0건·선언 없음) 문서 수. 있으면 탭 뱃지에 경고 점.
    const covIssues = s => s.coverage.filter(c => c.declared === null || c.declared === undefined || !c.parsed || c.parsed !== c.declared).length;
    function tabTip(id, s) {
      if (id === 'coverage' && covIssues(s)) return TAB_TIP.coverage + ' · 확인 필요 ' + covIssues(s) + '건(불일치·0건·선언 없음)';
      return TAB_TIP[id] || null;
    }
    function renderTabs(s) {
      const keys = e => {
        const i = TABS.findIndex(t => t[0] === state.tab);
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = TABS.length - 1;
        if (j !== null) { e.preventDefault(); setTab(TABS[j][0], true); }
      };
      return el('nav', { id: 'tabs', class: 'tabs', role: 'tablist', 'aria-label': '보기', onkeydown: keys },
        TABS.map(([id, label]) => {
          const n = tabCount(id, s), on = id === state.tab;
          return el('button', { type: 'button', role: 'tab', id: 'tab-' + id, class: 'tab' + (on ? ' on' : '') + (CAT[id] ? ' ' + CAT[id] : ''), dataset: { tab: id },
            'aria-selected': on ? 'true' : 'false', 'aria-controls': 'tabpanel', tabindex: on ? '0' : '-1',
            title: tabTip(id, s), onclick: () => setTab(id, true) },
            el('span', { text: label }), n === null ? null : el('span', { class: 'count mono' + (id === 'coverage' && covIssues(s) ? ' warn' : '') },
              id === 'coverage' && covIssues(s) ? el('span', { class: 'cdot', 'aria-hidden': 'true' }) : null, String(n)));
        }));
    }

    // 칸 머리: 고정폭 대문자 머리말 + 한글 제목 + 설명(+ 오른쪽 도구).
    function secHead(eb, title, sub, tools) {
      return el('div', { class: 'sec-h' },
        el('div', { class: 'sec-t' }, eyebrow(eb), el('h3', { text: title }), sub ? el('p', { class: 'muted small', text: sub }) : null),
        tools ? el('div', { class: 'sec-tools' }, tools) : null);
    }
    function section(id, eb, title, sub, ...children) {
      return el('section', { id, class: 'sec' }, secHead(eb, title, sub), ...children);
    }

    // ---------- 요약 탭(한 장 요약·인쇄용) ----------
    function lastClosed(s) {
      const c = s.expenditure.filter(e => e.year < s.now && e.budget > 0);
      return c[c.length - 1] || null;
    }
    function yearsSpan(s) {
      const ys = Object.keys(s.byYear).map(Number);
      return ys.length ? Math.min(...ys) + '~' + Math.max(...ys) + '년 행정사무감사' : '공개 결과보고서에 없음';
    }
    function renderCards(s) {
      const c = s.counts;
      const lc = lastClosed(s);
      const card = (label, value, unit, sub, tab) => el('button', { type: 'button', class: 'card sum-card ' + CAT[tab], dataset: { tab }, onclick: () => setTab(tab, true) },
        el('span', { class: 'k', text: label }),
        el('span', { class: 'v' }, el('span', { class: 'mono', text: value }), unit ? el('small', { text: unit }) : null),
        el('span', { class: 'sub', text: sub }));
      return el('section', { class: 'cards', id: 'summary-cards', 'aria-label': '요약' },
        card('행감 지적', String(c.findings), '건', yearsSpan(s), 'findings'),
        card('되풀이 지적', String(c.recurring), '줄기', '여러 해에 비슷한 지적', 'recurring'),
        card('답변 속 약속', String(c.guessedPromises), '건', '부서 추정 — 확인 필요', 'promises'),
        card('집행률', c.execRate === null ? '—' : String(c.execRate), c.execRate === null ? '' : '%',
          !lc ? '세출 자료 없음' : lc.year + '년 결산' + (lc.mended ? ' *' : '') +
            (isSilguk() ? ' · 실·국 합산 · 예비비·내부거래 포함될 수 있음' : ' 기준'), 'budget'));
    }
    const byRecent = (a, b) => b.year - a.year || (a.com || '').localeCompare(b.com || '', 'ko') || a.no - b.no;
    const moreLink = (tab, text) => el('button', { type: 'button', class: 'more-link', onclick: () => setTab(tab, true), text });
    // 요약의 되풀이·최근 지적 두 칸. 의원용 화면은 질문 후보 탭 위에 이것만 따로 쓴다(요약 탭이 없음).
    function renderSummaryGrid(s) {
      const rs = [...s.recurring].sort((a, b) => Math.max(...b.years) - Math.max(...a.years) || a.id.localeCompare(b.id)).slice(0, 3);
      const recent = [...s.findings].sort(byRecent).slice(0, 6);
      const more = moreLink;
      return el('div', { class: 'sum-grid' },
        el('section', { class: 'sec card pad', id: 'sum-recurring' },
          secHead('RECURRING', '되풀이 지적', rs.length ? '여러 해에 비슷한 지적이 다시 나온 줄기(최근 순)' : null,
            s.recurring.length > rs.length ? more('recurring', '모두 ' + s.recurring.length + '줄기 →') : null),
          rs.length ? el('ul', { class: 'mini-rec' }, rs.map(r => {
            const fs = r.finding_ids.map(id => state.fById.get(id)).filter(Boolean);
            return el('li', { dataset: { rid: r.id } }, chainEl(r.years),
              el('span', { class: 't', text: fs.length ? fs[fs.length - 1].title : '' }));
          })) : el('p', { class: 'empty', text: '되풀이된 지적을 찾지 못했습니다.' })),
        el('section', { class: 'sec card pad', id: 'sum-recent' },
          secHead('FINDINGS', '최근 지적', recent.length ? '줄을 누르면 오른쪽에 상세가 열립니다' : null,
            s.findings.length > recent.length ? more('findings', '모두 ' + s.findings.length + '건 →') : null),
          recent.length ? el('div', { class: 'flist compact', role: 'list' }, recent.map(f => renderFindingRow(f, true)))
            : el('p', { class: 'empty', text: '공개된 행정사무감사 결과보고서에서 이 대상의 지적을 찾지 못했습니다.' })));
    }
    function renderSummary(s) {
      return el('div', { id: 'sec-summary', class: 'summary' },
        renderCards(s),
        renderSummaryGrid(s),
        renderSummaryBudget(s));
    }
    // 요약의 예산 칸(작은 막대그래프 + 「숫자로 보기 →」 예산 탭 이동). 집행부 요약은 집행률을 네 칸 카드에 보이므로 그래프만,
    // 의원용 질문 후보 탭(카드 없음)은 opts.rate 로 최근 마감 연도 집행률 줄(지방재정365 보충 * 표시)과 100% 초과 설명을 더한다.
    function renderSummaryBudget(s, opts) {
      opts = opts || {};
      const has = s.expenditure.some(e => e.year >= BUDGET_FROM && e.budget > 0);
      const lc = lastClosed(s);
      const over = (s.overYears || []).filter(y => y >= BUDGET_FROM);
      return el('section', { class: 'sec card pad', id: 'sum-budget' },
        secHead('BUDGET', '예산 추이', has ? BUDGET_FROM + '년부터 · 억 원' : null, has ? moreLink('budget', '숫자로 보기 →') : null),
        opts.rate && has && lc ? el('p', { class: 'sum-rate small', id: 'sum-rate', dataset: { year: String(lc.year), rate: String(s.counts.execRate) } },
          lc.year + '년 결산 집행률 ', el('b', { class: 'mono', text: s.counts.execRate + '%' }),
          lc.mended ? ' *' : null,
          ' (예산 ' + eok(lc.budget) + '억 · 집행 ' + eok(lc.spent) + '억)') : null,
        has ? [budgetLegend(), el('div', { id: 'budget-mini', class: 'chart', dataset: { mini: '1' } })]
          : el('p', { class: 'empty', text: '이 대상에 이어진 세출 자료가 없습니다.' }),
        opts.rate && has && over.length ? el('p', { class: 'note small', id: 'sum-over',
          text: over.join('·') + '년은 집행이 예산보다 많습니다(집행률 100% 초과). ' + OVER_NOTE + '.' }) : null);
    }

    // ---------- 되풀이 탭 ----------
    function chainEl(years) {
      const chain = el('span', { class: 'chain', 'aria-label': '지적 연도 ' + years.join(', ') });
      years.forEach((y, i) => {
        if (i) chain.appendChild(el('span', { class: 'arr', 'aria-hidden': 'true', text: '→' }));
        chain.appendChild(el('span', { class: 'yr mono', text: String(y) }));
      });
      return chain;
    }
    function renderRecurring(s) {
      if (!s.recurring.length) {
        return section('sec-recurring', 'RECURRING', '되풀이 지적', null, el('p', { class: 'empty', text: '여러 해에 걸쳐 비슷하게 되풀이된 지적은 찾지 못했습니다.' }));
      }
      const rs = [...s.recurring].sort((a, b) => Math.max(...b.years) - Math.max(...a.years) || a.id.localeCompare(b.id));
      return section('sec-recurring', 'RECURRING', '되풀이 지적', '비슷한 지적이 여러 해에 다시 나온 줄기입니다. 가장 먼저 살펴보십시오. 제목을 누르면 상세가 열립니다.',
        el('div', { class: 'rec-list' }, rs.map(renderRecurringOne)));
    }
    function renderRecurringOne(r) {
      const fs = r.finding_ids.map(id => state.fById.get(id)).filter(Boolean);
      const re = reopenedPairs(fs);
      return el('article', { class: 'card rec', dataset: { rid: r.id } },
        el('div', { class: 'rec-h' }, el('span', { class: 'rdot', 'aria-hidden': 'true' }), el('span', { class: 'rid mono', text: r.id }), chainEl(r.years),
          isSilguk() ? el('span', { class: 'tag', text: r.dept }) : null, jointTag(r)),
        re.map(x => el('p', { class: 'rec-warn' }, el('strong', { text: '완료로 보고했는데 다시 지적됨. ' }),
          x.f.year + '년 지적을 처리결과에서 「완료」로 보고했으나 ' + x.later.map(g => g.year).join('·') +
          '년에 비슷한 지적이 다시 나왔습니다(근거: ' + state.actions[x.f.id].source + ').')),
        el('ul', { class: 'rec-fs' }, fs.map(f => el('li', { dataset: { fid: f.id } },
          el('span', { class: 'y mono', text: String(f.year) }),
          el('button', { type: 'button', class: 't link-btn plain', onclick: () => openDetail(f.id), text: f.title }), srcLink(f.uid)))),
        (r.common || []).length ? el('p', { class: 'words' },
          el('span', { class: 'muted', text: '겹친 낱말' }),
          r.common.map(w => el('span', { class: 'chip', text: w })),
          el('span', { class: 'hint', text: '기계가 묶은 것, 확인 필요' })) : null);
    }

    // ---------- 지적 탭: 이행 상태별 ↔ 연도별 묶음 ----------
    function implText(id) { const a = state.actions[id]; return a ? a.status : '(미첨부)'; }
    const statusOf = id => (state.actions[id] ? state.actions[id].status : '미첨부');
    function renderFindings(s) {
      const attach = renderAttach();
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': '묶기' },
        [['status', '이행 상태별'], ['year', '연도별']].map(([k, label]) => el('button', { type: 'button', id: 'group-' + k,
          class: 'seg-b' + (state.groupBy === k ? ' on' : ''), 'aria-pressed': state.groupBy === k ? 'true' : 'false',
          onclick: () => { state.groupBy = k; render(); $('group-' + k).focus(); }, text: label })));
      const head = secHead('FINDINGS', '행감 지적', '행정사무감사 결과보고서의 시정·건의 사항입니다. 줄을 누르면(↑↓·Enter) 오른쪽에 상세가 열립니다.',
        s.findings.length ? seg : null);
      if (!s.findings.length) {
        return el('section', { id: 'sec-findings', class: 'sec' }, head, attach,
          el('p', { class: 'empty', text: '공개된 행정사무감사 결과보고서에서 이 대상의 지적을 찾지 못했습니다. 「자료 범위」 탭을 확인하십시오.' }),
          renderCommon(s));
      }
      let groups;
      if (state.groupBy === 'year') {
        const years = Object.keys(s.byYear).map(Number).sort((a, b) => b - a);
        groups = years.map(y => ({ key: 'y' + y, label: y + '년', mono: true, icon: null,
          fs: [...s.byYear[y]].sort((a, b) => (a.com || '').localeCompare(b.com || '', 'ko') || a.no - b.no) }));
      } else {
        const m = new Map();
        for (const f of s.findings) { const k = statusOf(f.id); if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
        const keys = [...m.keys()].sort((a, b) => {
          const i = STATUS_ORDER.indexOf(a), j = STATUS_ORDER.indexOf(b);
          return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || ko(a, b);
        });
        groups = keys.map(k => ({ key: 's' + k, label: k, icon: k, fs: m.get(k).sort(byRecent) }));
      }
      return el('section', { id: 'sec-findings', class: 'sec' }, head, attach,
        el('div', { class: 'fgroups', dataset: { by: state.groupBy } }, groups.map(g => {
          const rec = g.fs.filter(f => f.recurring).length;
          return el('div', { class: 'fgroup', dataset: { group: g.key } },
            el('div', { class: 'fgroup-h' }, g.icon ? statusIcon(g.icon) : null,
              el('span', { class: 'gl' + (g.mono ? ' mono' : ''), text: g.label }),
              el('span', { class: 'gc mono', text: String(g.fs.length) }),
              rec ? el('span', { class: 'muted small', text: '되풀이 ' + rec }) : null),
            el('div', { class: 'flist', role: 'list' }, g.fs.map(f => renderFindingRow(f))));
        })),
        renderCommon(s));
    }
    // Task 4f: 두 구에 함께 준 지적(depts 가 둘 이상)은 기록 하나를 구마다의 부서 밑에 같이 보인다. 그 표시.
    function isJoint(x) { return !!(x && x.depts && x.depts.length > 1); }
    function jointTag(x) {
      return isJoint(x) ? el('span', { class: 'tag joint-t', title: x.depts.join(' · ') + ' 에 함께 준 지적', text: '양 구 공통' }) : null;
    }
    // 한 줄 = 이행 상태 아이콘 · 지적 번호(고정폭) · 제목 · 위원회 칩 · 연도 · 원문.
    function renderFindingRow(f, compact) {
      const a = state.actions[f.id];
      const st = statusOf(f.id);
      return el('div', { class: 'frow' + (state.detail === f.id ? ' sel' : ''), role: 'listitem', dataset: { fid: f.id } },
        el('button', { type: 'button', class: 'frow-main', 'aria-haspopup': 'dialog', 'aria-controls': 'detail', onclick: () => openDetail(f.id), onkeydown: listKeys },
          el('span', { class: 'impl' + (a ? ' has' : ''), dataset: { fid: f.id }, title: a ? st + ' — 근거 파일 ' + a.source : '처리결과 미첨부' },
            statusIcon(st), el('span', { class: 'vh', text: '이행 ' + st })),
          el('span', { class: 'fid mono', text: f.id }),
          el('span', { class: 'ft', text: f.title }),
          el('span', { class: 'fx' },
            a ? el('span', { class: 'st ' + statusCls(st), text: st }) : null,
            f.recurring ? el('span', { class: 'tag rec-t' }, el('span', { class: 'rdot', 'aria-hidden': 'true' }), '되풀이') : null,
            state.reopened.has(f.id) ? el('span', { class: 'tag err-t', text: '완료 뒤 재지적' }) : null,
            isSilguk() ? el('span', { class: 'tag', text: f.dept }) : null,
            jointTag(f),
            compact ? null : el('span', { class: 'tag com', text: comName(f.com) }),
            el('span', { class: 'yr mono', text: String(f.year) }))),
        compact ? null : el('span', { class: 'flink' }, srcLink(f.uid)));
    }
    // 목록 위아래 화살표로 줄 사이를 옮긴다(Enter·Space 는 단추 기본 동작으로 상세를 연다).
    function listKeys(e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const xs = [...document.querySelectorAll('#tabpanel .frow-main')];
      const i = xs.indexOf(e.currentTarget);
      const n = xs[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); }
      e.preventDefault();
    }
    // 부서 화면: 같은 결과보고서에 실린 「여러 부서 공통」 지적은 이 부서 몫이 아니므로 접어서 따로 보인다.
    // 실·국 화면: 묶음 머리가 이 실·국 이름인 「여러 부서 공통」 지적(국 단위 공통 지적, core 의 s.common)을 접어서 보인다.
    function renderCommon(s) {
      if (isSilguk()) {
        if (!(s.common || []).length) return null;
        return el('details', { class: 'common', id: 'silguk-common' },
          el('summary', { text: '공통 지적: 「' + state.target.name + '」 전체에 준 「여러 부서 공통」 지적 ' + s.common.length + '건 (위 건수에는 넣지 않음)' }),
          el('ul', {}, s.common.map(f => el('li', {},
            el('span', { class: 'y mono', text: f.year + ' ' }), el('span', { class: 'muted', text: comName(f.com) + ' ' + f.no + '번 ' }),
            el('span', { text: f.title }), srcLink(f.uid)))));
      }
      const uids = new Set(s.coverage.map(c => c.uid));
      const common = root.DCC_DATA.findings.filter(f => f.dept === '여러 부서 공통' && uids.has(f.uid))
        .sort((a, b) => b.year - a.year || a.no - b.no);
      if (!common.length) return null;
      return el('details', { class: 'common' },
        el('summary', { text: '참고: 같은 결과보고서의 「여러 부서 공통」 지적 ' + common.length + '건 (이 부서만의 지적은 아님)' }),
        el('ul', {}, common.map(f => el('li', {},
          el('span', { class: 'y mono', text: f.year + ' ' }), el('span', { class: 'muted', text: comName(f.com) + ' ' + f.no + '번 ' }),
          el('span', { text: f.title }), srcLink(f.uid)))));
    }

    // ---------- 오른쪽 상세 패널(폰에서는 전체 화면 시트) ----------
    let detailReturn = null, detailReturnId = null;
    // 상세 패널: 데스크톱은 목록 옆에 뜨는 비모달 대화상자, 폰(≤ 640px)은 전체 화면 모달 시트
    // (뒤 본문·사이드바에 inert, Tab 은 패널 안에서만 돈다).
    const phone = () => !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches);
    function setModal(on) {
      const box = $('detail');
      if (on) box.setAttribute('aria-modal', 'true'); else box.removeAttribute('aria-modal');
      document.querySelectorAll('.main-col, #side').forEach(n => { if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert'); });
    }
    function trapTab(e) {
      if (e.key !== 'Tab' || !$('detail').hasAttribute('aria-modal')) return;
      const xs = [...$('detail').querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.offsetParent !== null);
      if (!xs.length) return;
      const first = xs[0], last = xs[xs.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
    // 포커스를 돌려놓지 않고 상세만 닫는다(대상 바꾸기·프롬프트로 옮길 때). 돌아갈 자리 기억도 지운다.
    function dropDetail() {
      state.detail = null; detailReturn = null; detailReturnId = null;
      renderDetail();
    }
    function openDetail(id) {
      if (!state.fById.get(id)) return;
      if (!state.detail) {
        detailReturn = document.activeElement;
        // 목록 줄로 돌아갈 자리는 지적 번호로도 기억한다(다시 그려 단추가 바뀌어도 찾게).
        const fr = detailReturn && detailReturn.closest && detailReturn.closest('.frow');
        detailReturnId = fr ? fr.dataset.fid : id;
      }
      state.detail = id;
      renderDetail();
      document.querySelectorAll('#tabpanel .frow').forEach(r => r.classList.toggle('sel', r.dataset.fid === id));
      const c = $('detail-close'); if (c) c.focus(focusOpts());
    }
    function closeDetail() {
      if (!state.detail) return;
      const id = state.detail;
      state.detail = null;
      renderDetail();
      document.querySelectorAll('#tabpanel .frow.sel').forEach(r => r.classList.remove('sel'));
      const back = detailReturn && document.contains(detailReturn) ? detailReturn
        : document.querySelector('#tabpanel .frow[data-fid="' + CSS.escape(detailReturnId || id) + '"] .frow-main');
      if (back && back.focus) back.focus(focusOpts());
      detailReturn = null; detailReturnId = null;
    }
    function renderDetail() {
      const box = $('detail');
      if (!box) return;
      clear(box);
      const f = state.detail && state.fById.get(state.detail);
      const scrim = $('scrim');
      if (!f || !state.summary) {
        box.hidden = true; document.body.classList.remove('has-detail'); setModal(false);
        if (scrim && !$('side').classList.contains('open')) scrim.hidden = true;
        return;
      }
      box.hidden = false; document.body.classList.add('has-detail'); setModal(phone());
      if (scrim) scrim.hidden = false;
      const a = state.actions[f.id];
      const st = statusOf(f.id);
      const r = root.DCC_DATA.recurring.find(x => x.finding_ids.includes(f.id));
      const chainFs = r ? r.finding_ids.map(id => state.fById.get(id)).filter(Boolean) : [];
      const block = (eb, ...kids) => el('section', { class: 'd-sec' }, eyebrow(eb), ...kids);
      append(box, [
        el('div', { class: 'd-head' },
          el('span', { class: 'fid mono', text: f.id }),
          el('button', { type: 'button', id: 'detail-close', class: 'btn', onclick: closeDetail, 'aria-label': '상세 닫기 (Esc)' }, icon('close'), el('span', { text: '닫기' }))),
        el('div', { class: 'd-body' },
          el('h3', { class: 'd-title', id: 'detail-title', text: f.title }),
          el('p', { class: 'd-meta' },
            el('span', { class: 'mono', text: String(f.year) }), ' · ' + comName(f.com) + ' ' + f.no + '번',
            isSilguk() ? ' · ' + f.dept : null,
            isJoint(f) ? ' · ' : null, jointTag(f)),
          el('p', { class: 'd-st' }, statusIcon(st), el('span', { class: a ? 'st ' + statusCls(st) : 'muted', text: a ? st : '처리결과 미첨부' })),
          state.reopened.has(f.id) ? el('p', { class: 'rec-warn', text: '앞선 해 지적을 「완료」로 보고했는데 다시 지적됨' }) : null,
          block('BODY — 요지', el('p', { class: 'd-text', text: f.body || '결과보고서에 요지가 따로 적혀 있지 않습니다.' })),
          r ? block('RECURRING — 같은 줄기 ' + r.id,
            el('p', {}, chainEl(r.years)),
            el('ul', { class: 'd-chain' }, chainFs.map(g => el('li', { class: g.id === f.id ? 'me' : null },
              el('span', { class: 'y mono', text: String(g.year) }),
              g.id === f.id ? el('span', { class: 't', text: g.title + ' (이 건)' })
                : el('button', { type: 'button', class: 'link-btn plain t', onclick: () => openDetail(g.id), text: g.title })))),
            (r.common || []).length ? el('p', { class: 'words' }, el('span', { class: 'muted', text: '겹친 낱말' }),
              r.common.map(w => el('span', { class: 'chip', text: w })), el('span', { class: 'hint', text: '기계가 묶은 것, 확인 필요' })) : null) : null,
          block('ACTION — 반영한 조치', a
            ? [el('p', { class: 'd-text', text: a.text || '(조치 내용 칸이 비어 있음)' }), el('p', { class: 'muted small', text: '근거 파일: ' + a.source })]
            : el('p', { class: 'muted small', text: '지적 탭 머리의 「처리결과 첨부」로 처리결과를 첨부하고 확인하면 여기에 보입니다.' })),
          block('SOURCE — 원문', el('p', {}, srcLink(f.uid, '행정사무감사 결과보고서 원문') || el('span', { class: 'muted', text: '원문 주소 없음' })))),
        ctx.detailFoot ? el('div', { class: 'd-foot' }, ctx.detailFoot(f)) : null]);
    }

    // ---------- 약속 탭(추정) ----------
    function renderPromises(s) {
      const ps = [...s.promises.guessed].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
      const band = el('p', { class: 'guess-band' },
        el('strong', { text: '추정 — 확인 필요. ' }),
        '시정질문 답변요지서에는 담당 부서가 적혀 있지 않아, 답변 낱말이 부서 업무와 겹치는 정도로 기계가 부서를 추정했습니다. 원문으로 확인하십시오.');
      const title = '답변 속 약속';
      if (!ps.length) return section('sec-promises', 'PROMISES — ESTIMATED', title, null, band, el('p', { class: 'empty', text: '이 대상으로 추정된 약속이 없습니다.' }));
      const list = el('div', { class: 'p-list' });
      const more = el('button', { type: 'button', class: 'btn more' });
      let shown = 0;
      function show(upto) {
        upto = Math.min(ps.length, upto);
        ps.slice(shown, upto).forEach(p => list.appendChild(renderPromise(p)));
        shown = Math.max(shown, upto);
        state.promiseShown = shown;
        more.textContent = '더 보기 (' + (ps.length - shown) + '건 남음)';
        more.hidden = shown >= ps.length;
      }
      more.addEventListener('click', () => show(shown + PROMISE_PAGE));
      // 다시 그려도(첨부 반영 등) 보던 만큼, 그리고 「포함」 체크한 약속은 모두 보이게 편다.
      let lastInc = -1;
      ps.forEach((p, i) => { if (state.include.has(p.id)) lastInc = i; });
      show(Math.max(PROMISE_PAGE, state.promiseShown, lastInc + 1));
      return section('sec-promises', 'PROMISES — ESTIMATED', title, ctx.promiseCheck ? '프롬프트에 넣을 약속은 「프롬프트에 포함」을 체크하십시오. 프롬프트 탭의 「넣을 자료 고르기」 목록과 같은 고름입니다.'
        : '질문으로 쓰려면 「질문 후보」 탭의 「답변 속 약속(추정)」 묶음에서 고르십시오.', band, list, more);
    }
    function renderPromise(p) {
      const cb = el('input', { type: 'checkbox', dataset: { pid: p.id },
        onchange: e => {
          if (e.target.checked) state.include.add(p.id); else state.include.delete(p.id);
          if (ctx.onInclude) ctx.onInclude(p.id, e.target.checked);
        } });
      cb.checked = state.include.has(p.id);
      const basis = p.dept_basis || [];
      return el('article', { class: 'card promise', dataset: { pid: p.id } },
        el('div', { class: 'p-h' },
          el('span', { class: 'est', text: '추정' }),
          el('span', { class: 'muted small' }, el('span', { class: 'mono p-date', text: p.date || '' }), ' · 제' + p.session + '회 시정질문'),
          isSilguk() ? el('span', { class: 'tag', text: '추정: ' + p.dept }) : null,
          ctx.promiseCheck ? el('label', { class: 'inc' }, cb, '프롬프트에 포함') : null),
        p.topic ? el('p', { class: 'p-topic', text: p.topic }) : null,
        p.question ? el('p', { class: 'p-q' }, el('span', { class: 'muted', text: '질문 ' }), p.question) : null,
        el('ul', { class: 'p-c' }, (p.commitments || []).map(c => el('li', { text: c }))),
        el('p', { class: 'words' },
          basis.length ? [el('span', { class: 'muted', text: '근거 낱말' }), basis.map(w => el('span', { class: 'chip', text: w })),
            el('span', { class: 'hint', text: '이 낱말이 겹쳐 이 부서로 추정' })]
            : el('span', { class: 'hint', text: '근거 낱말 없음 — 확인 필요' }),
          srcLink(p.uid, '답변요지서 원문')));
    }

    // ---------- 예산 탭 ----------
    function budgetLegend() {
      return el('div', { class: 'legend' },
        el('span', {}, el('i', { class: 'sw sw-b' }), '예산'),
        el('span', {}, el('i', { class: 'sw sw-s' }), '집행'),
        el('span', {}, el('i', { class: 'sw sw-d' }), '되풀이 지적이 나온 해'),
        el('span', { text: '* 지방재정365 보충' }));
    }
    function renderBudget(s) {
      const rows = s.expenditure.filter(e => e.year >= BUDGET_FROM);
      const has = rows.some(e => e.budget > 0);
      const rate = e => (e.budget ? (Math.round(e.spent / e.budget * 1000) / 10) + '%' : '—');
      const table = el('details', { class: 'nums' }, el('summary', { text: '숫자로 보기 (억 원)' }),
        el('div', { class: 'table-scroll' }, el('table', {},
          el('thead', {}, el('tr', {}, ['연도', '예산', '집행', '집행률'].map(h => el('th', { text: h })))),
          el('tbody', {}, rows.map(e => el('tr', {},
            el('td', { class: 'mono', text: e.year + (e.mended ? ' *' : '') + (e.year >= s.now ? ' (진행 중)' : '') }),
            el('td', { class: 'num', text: eok(e.budget) }), el('td', { class: 'num', text: eok(e.spent) }),
            el('td', { class: 'num' + (e.budget && e.spent > e.budget ? ' over' : ''), text: rate(e) + (e.budget && e.spent > e.budget ? ' 초과' : '') })))))));
      const over = (s.overYears || []).filter(y => y >= BUDGET_FROM);
      const overNote = over.length ? el('p', { class: 'note small', id: 'budget-over',
        text: over.join('·') + '년은 집행이 예산보다 많습니다(집행률 100% 초과). ' + OVER_NOTE + '.' +
          (isSilguk() ? ' 실·국 합산 기준 — 부서별 초과는 부서 화면에서 확인.' : '') }) : null;
      return section('sec-budget', 'BUDGET', '예산 추이', BUDGET_FROM + '년부터 올해까지 세출 예산과 집행액입니다. 올해 집행은 진행 중인 값입니다.',
        has ? [budgetLegend(), el('div', { id: 'budget-chart', class: 'chart' }), overNote, isSilguk() ? renderMemberRates(s) : null, table]
          : el('p', { class: 'empty', text: '이 대상에 이어진 세출 자료가 없습니다(부서명이 예산서와 다르거나 다른 부서 예산에 잡혀 있을 수 있습니다).' }),
        el('p', { class: 'muted small', text: '출처: ' + region().지자체명 + ' 누리집 사업 및 예산정보. * 표시 해는 지방재정365 자료로 보충했습니다.' }));
    }
    // 실·국 보기: 같은 결산 연도의 소속 부서별 집행률. 가나다순 그대로(비율로 정렬하지 않는다 — 순위 아님).
    function renderMemberRates(s) {
      const lc = lastClosed(s);
      if (!lc) return null;
      const names = root.DCC.core.silguks(state.ix).find(g => g.name === state.target.name).depts;
      const row = n => {
        const e = (root.DCC_DATA.expenditure[n] || []).find(x => x.year === lc.year);
        return el('tr', {}, el('td', { text: n }),
          el('td', { class: 'num', text: e ? eok(e.budget) : '—' }), el('td', { class: 'num', text: e ? eok(e.spent) : '—' }),
          el('td', { class: 'num', text: e && e.budget ? (Math.round(e.spent / e.budget * 1000) / 10) + '%' : '—' }));
      };
      return el('div', { class: 'members' },
        el('p', { class: 'small', text: lc.year + '년 집행률 ' + s.counts.execRate + '%는 소속 부서를 합산한 값입니다. ' +
          '예비비·내부거래처럼 집행되지 않는 예산을 가진 부서가 있으면 낮게 나옵니다. 부서별 값(가나다순, 억 원):' }),
        el('div', { class: 'table-scroll' }, el('table', {},
          el('thead', {}, el('tr', {}, ['부서', '예산', '집행', '집행률'].map(h => el('th', { text: h })))),
          el('tbody', {}, names.map(row)))));
    }
    function niceStep(x) {
      const p = Math.pow(10, Math.floor(Math.log10(x)));
      const m = x / p;
      return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
    }
    function drawCharts() { drawBudget('budget-chart'); drawBudget('budget-mini'); }
    // 그릴 칸의 실제 폭에 맞춰 그린다(폰에서 글자가 작아지지 않게). 창 크기가 바뀌면 다시 그린다.
    function drawBudget(id) {
      const box = $(id); const s = state.summary;
      if (!box || !s) return;
      clear(box);
      const mini = !!box.dataset.mini;
      const W = Math.max(260, Math.round(box.clientWidth || 700) - 2);
      const narrow = W < 520;
      const k = state.fs / 100;   // 글자 크기 단계만큼 축 글자 자리를 넓힌다
      const H = Math.round((mini ? 150 : narrow ? 190 : 220) * Math.max(1, k)), padL = Math.round((narrow ? 36 : 46) * k), padR = 6,
        padT = Math.round(20 * k), padB = Math.round(24 * k);
      const byYear = new Map(s.expenditure.map(e => [e.year, e]));
      const recYears = new Set(s.recurring.flatMap(r => r.years));
      const years = [];
      for (let y = BUDGET_FROM; y <= s.now; y++) years.push(y);
      const max = Math.max(1, ...s.expenditure.filter(e => e.year >= BUDGET_FROM).map(e => Math.max(e.budget, e.spent)));
      const step = niceStep(max / 3);
      const top = Math.ceil(max / step) * step;
      const iw = W - padL - padR, ih = H - padT - padB;
      const slot = iw / years.length, bw = Math.max(8, Math.min(32, slot * 0.62));
      const yOf = v => padT + ih - (v / top) * ih;
      const base = padT + ih;
      const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '연도별 예산과 집행 막대그래프' });
      for (let v = 0; v <= top + step / 2; v += step) {
        g.appendChild(svg('line', { x1: padL, x2: W - padR, y1: yOf(v), y2: yOf(v), class: v ? 'grid' : 'grid base' }));
        g.appendChild(svg('text', { x: padL - 6, y: yOf(v) + 4, class: 'ax', 'text-anchor': 'end' }, eok(v)));
      }
      g.appendChild(svg('text', { x: 0, y: Math.round(11 * k), class: 'ax' }, '억 원'));
      years.forEach((y, i) => {
        const cx = padL + slot * i + slot / 2;
        const e = byYear.get(y);
        const lbl = (narrow || mini ? "'" + String(y).slice(2) : String(y)) + (e && e.mended ? '*' : '');
        g.appendChild(svg('text', { x: cx, y: H - Math.round(7 * k), class: 'ax', 'text-anchor': 'middle' }, lbl));
        if (!e || !e.budget) return;
        const tip = y + '년 예산 ' + eok(e.budget) + '억 원, 집행 ' + eok(e.spent) + '억 원' +
          (e.mended ? ' (지방재정365 보충)' : '') + (y >= s.now ? ' (진행 중)' : '') +
          (e.spent > e.budget ? ' — ' + OVER_NOTE : '');
        g.appendChild(svg('rect', { x: cx - bw / 2, y: yOf(e.budget), width: bw, height: Math.max(0, base - yOf(e.budget)), rx: 2, class: 'bar-b' }, svg('title', {}, tip)));
        const sw = bw * 0.5;
        g.appendChild(svg('rect', { x: cx - sw / 2, y: yOf(e.spent), width: sw, height: Math.max(0, base - yOf(e.spent)), rx: 1.5,
          class: 'bar-s' + (y >= s.now ? ' now' : '') }, svg('title', {}, tip)));
        if (recYears.has(y)) {
          g.appendChild(svg('circle', { cx, cy: yOf(Math.max(e.budget, e.spent)) - 8, r: 3.5, class: 'dot' }, svg('title', {}, y + '년 되풀이 지적 있음')));
        }
      });
      years.forEach((y, i) => {
        const e = byYear.get(y);
        if (recYears.has(y) && !(e && e.budget)) {
          g.appendChild(svg('circle', { cx: padL + slot * i + slot / 2, cy: base - 8, r: 3.5, class: 'dot' }, svg('title', {}, y + '년 되풀이 지적 있음')));
        }
      });
      box.appendChild(g);
    }

    // ---------- 자료 범위 탭 ----------
    function covChip(c) {
      if (c.declared === null || c.declared === undefined) return el('span', { class: 'chip-warn', text: '선언 없음' });
      if (!c.parsed) return el('span', { class: 'chip-warn', text: '0건' });
      if (c.parsed !== c.declared) {
        const d = c.parsed - c.declared;
        return el('span', { class: 'chip-warn', text: '불일치 ' + (d > 0 ? '+' : '') + d });
      }
      return el('span', { class: 'chip-ok', text: '일치' });
    }
    function renderCoverage(s) {
      const reports = root.DCC_DATA.sources.filter(x => x.kind === '결과보고서');
      const ys = reports.map(x => x.year);
      const intro = el('p', { class: 'small', text: '이 파일에 담은 행정사무감사 결과보고서는 ' + reports.length + '건(' +
        Math.min(...ys) + '~' + Math.max(...ys) + '년)입니다. 아래는 그중 이 대상의 지적이 나온 문서입니다. ' +
        '「파싱/선언」은 기계가 읽어 낸 지적 수와 문서가 밝힌 지적 수입니다. 다르면 원문과 대조하십시오.' });
      const counts = new Map();
      for (const f of s.findings) counts.set(f.uid, (counts.get(f.uid) || 0) + 1);
      const table = !s.coverage.length
        ? el('p', {}, el('span', { class: 'chip-warn', text: '0건' }), ' 이 대상의 지적이 나온 결과보고서가 없습니다. 부서명이 결과보고서와 다르게 적혔을 수 있습니다.')
        : el('div', { class: 'table-scroll' }, el('table', { class: 'cov' },
          el('thead', {}, el('tr', {}, ['연도', '위원회', '이 대상', '파싱/선언', '상태', ''].map(h => el('th', { text: h })))),
          el('tbody', {}, s.coverage.map(c => el('tr', {},
            el('td', { class: 'mono', text: String(c.year) }), el('td', {}, c.com, el('span', { class: 'com-sfx', text: '위원회' })),
            el('td', { class: 'num', text: (counts.get(c.uid) || 0) + '건' }),
            el('td', { class: 'num', text: c.parsed + ' / ' + (c.declared === null || c.declared === undefined ? '—' : c.declared) }),
            el('td', {}, covChip(c)), el('td', {}, srcLink(c.uid)))))));
      const psrc = [...new Set(s.promises.guessed.map(p => p.uid))].map(u => state.ix.src.get(u)).filter(Boolean)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return section('coverage', 'SOURCES', '자료 범위', null, intro, table,
        psrc.length ? el('p', { class: 'small src-list' }, '약속을 가져온 답변요지서: ',
          psrc.map((x, i) => [i ? ' · ' : '', srcLink(x.uid, '제' + x.session + '회(' + x.date + ')')])) : null);
    }

    // 되풀이 줄기에서 앞선 해 지적이 「완료」로 반영됐는데 뒤 해에 같은 줄기 지적이 또 있으면 경고.
    function reopenedPairs(fs) {
      const out = [];
      for (const f of fs) {
        const a = state.actions[f.id];
        if (!a || a.status !== '완료') continue;
        const later = fs.filter(g => g.year > f.year);
        if (later.length) out.push({ f, later });
      }
      return out;
    }
    function reopenedIds(s) {
      const ids = new Set();
      for (const r of s.recurring) {
        const fs = r.finding_ids.map(id => state.fById.get(id)).filter(Boolean);
        for (const x of reopenedPairs(fs)) x.later.forEach(g => ids.add(g.id));
      }
      return ids;
    }

  return { renderTabs, renderSummary, renderSummaryGrid, renderSummaryBudget, renderFindings, renderRecurring, renderPromises, renderBudget, renderCoverage,
    renderDetail, openDetail, closeDetail, dropDetail, trapTab, drawCharts, reopenedIds, implText, statusOf,
    secHead, section, eyebrow, srcLink, chainEl, renderFindingRow, phone, eok, BUDGET_FROM };
  }

  root.DCC = root.DCC || {};
  root.DCC.deptview = { create };
})(typeof window !== 'undefined' ? window : globalThis);
