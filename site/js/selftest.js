// 역할: Edge 헤드리스 자체 시험 러너(Task 8). ?selftest 로 부서 선택·첨부·프롬프트를 스스로 돌려
// 몸통 끝에 id 「selftest」인 pre 태그를 하나 붙이고 그 안에 결과 JSON 을 적는다(끝에서 만든다 —
// 시험 스크립트가 태그를 찾을 때 이 주석 자체가 걸리지 않게, 아래에서도 태그를 문자열로 조립한다).
// 오프라인 산출물(부서점검표.html)에는 절대 들어가지 않는다 — dcc/site_build.build(..., selftest=True)
// 일 때 만드는 시험판(부서점검표_selftest.html)에만 selftest_fixture.js 와 함께 ui.js 뒤에 붙는다
// (dcc/site_build.py 참조). ui.js 는 이 파일의 이름도, 브라우저 통신 API 이름도 모른다 — ui.js 가
// 부르는 DCC.ui.onReady 훅 하나로만 이어진다(tests/test_site_build.py 의 오프라인 스캔은 출하판만
// 보므로 이 파일이 그 검사를 건드리지 않는다).
// 다운로드 클릭·클립보드는 헤드리스에서 멈추거나 막히므로 절대 부르지 않는다(promptText·attachBytes 만 시험).
(function (root) {
  const ui = root.DCC.ui;

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function csvField(v) { const s = String(v == null ? '' : v); return '"' + s.replace(/"/g, '""') + '"'; }
  function selftestCsv(title) {
    return '﻿연도,위원회,부서,지적번호,지적제목,조치상태,조치내용\n' +
      ['', '', '', '', csvField(title), '완료', '자체시험'].join(',') + '\n';
  }
  // 사이드바가 보이는지(감춤 속성·계산된 display·폭), 시작 화면이 온 폭 가운데인지(2026-09-29 사용자 요청).
  function sideShown() {
    const n = document.getElementById('side');
    return !!n && !n.hidden && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0;
  }
  function startLayout() {
    const vw = document.documentElement.clientWidth;
    const mc = document.querySelector('.main-col').getBoundingClientRect();
    const w = document.querySelector('#body .welcome');
    const r = w ? w.getBoundingClientRect() : null;
    const mb = document.getElementById('menu-btn');
    const full = Math.abs(mc.left) <= 1 && Math.abs(mc.width - vw) <= 1;
    const centred = !!r && Math.abs(r.left - (vw - r.right)) <= 2;
    return { ok: !sideShown() && full && centred && !!mb && mb.hidden && getComputedStyle(mb).display === 'none',
      text: '사이드바=' + sideShown() + ' 본문 폭=' + Math.round(mc.width) + '/' + vw + ' 가운데=' + centred +
        (r ? '(' + Math.round(r.left) + '|' + Math.round(vw - r.right) + ')' : '') + ' 메뉴 단추 감춤=' + !!(mb && mb.hidden) };
  }
  const NAME_RE = /(?<![가-힣])[가-힣]{3}\s*(사무국장|부시장|구청장|위원장|시장|의원|국장|과장|동장)/;

  async function selftest() {
    const steps = [];
    const add = (name, ok, detail) => steps.push({ name, ok: !!ok, detail: detail === undefined ? null : String(detail) });

    // 아주 처음에 네트워크를 감싸 호출 수를 센다(kordoc.parse 안쪽 호출도 잡는다). 여기서는
    // fetch·XMLHttpRequest·sendBeacon 을 「부르지」 않는다 — 실제 호출을 가로채 세기만 한다
    // (0 이어야 시험을 통과한다).
    let netCalls = 0;
    const origFetch = root.fetch;
    if (origFetch) root.fetch = function () { netCalls++; return origFetch.apply(this, arguments); };
    const XHR = root.XMLHttpRequest;
    const origOpen = XHR && XHR.prototype.open;
    if (origOpen) XHR.prototype.open = function () { netCalls++; return origOpen.apply(this, arguments); };
    const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (origBeacon) navigator.sendBeacon = function () { netCalls++; return origBeacon.apply(navigator, arguments); };

    // 직원용 화면에 날씨 그림이 한 번이라도 붙는지 시험 내내 센다(붙었다 지워져도 잡는다).
    let wxSeen = 0;
    const wxObs = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && (n.matches('.wx, [data-wx], .wx-legend') || n.querySelector('.wx, [data-wx], .wx-legend'))) wxSeen++;
    } });
    wxObs.observe(document.body, { childList: true, subtree: true });
    if (document.querySelector('.wx, [data-wx], .wx-legend')) wxSeen++;

    try {
      // ⓪ 머리 「갱신」과 마감 연도 기준이 자료 생성일(generated)에서 오는지(최종 검토 수정 1)
      try {
        const g = root.DCC_DATA.generated || '';
        const shown = (document.getElementById('data-date') || {}).textContent;
        add('자료 기준일', shown === g && ui.state.ix.now === Number(g.slice(0, 4)),
          '머리=' + shown + ' generated=' + g + ' now=' + ui.state.ix.now);
      } catch (e) { add('자료 기준일', false, e); }

      // ⓪-2 시작 화면(2026-09-29): 사이드바 없이 본문이 온 폭 가운데, 폰 메뉴 단추 감춤, 포커스는 큰 검색창.
      //      Ctrl+K 빠른 검색은 시작 화면에서도 열리고 Esc 로 닫히면 큰 검색창으로 돌아온다.
      try {
        const lay = startLayout();
        const focus = !!document.activeElement && document.activeElement.id === 'start-q';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        const qsOpen = !document.getElementById('qs').hidden && document.activeElement && document.activeElement.id === 'dept-q';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const qsBack = document.getElementById('qs').hidden && document.activeElement && document.activeElement.id === 'start-q';
        add('시작 화면 온 폭', lay.ok && focus && qsOpen && qsBack,
          lay.text + ' 포커스=' + focus + ' Ctrl+K=' + qsOpen + ' Esc 뒤=' + qsBack);
      } catch (e) { add('시작 화면 온 폭', false, e); }

      // ⓪-3 예보 시작 화면(2026-09-29): 레이더·등압선 배경(글자 뒤, aria-hidden), 발표 줄(자료 기준일), 「전체 예보」 띠 =
      //      자료 전체의 행감 지적·되풀이 줄기·답변 속 약속 수와 기간. 검색창은 레이더 그림·「우리 부서 예보 보기」, aria-label 은 온 문장.
      try {
        const w = document.querySelector('#body .welcome');
        const bg = w.querySelector('.fc-bg');
        const sweep = w.querySelector('.fc-sweep');
        const g = root.DCC_DATA.generated || '';
        const head = (document.getElementById('fc-head') || {}).textContent || '';
        const ov = root.DCC.core.overview(root.DCC_DATA);
        const n = k => { const li = document.querySelector('#fc-strip .fc-i[data-k="' + k + '"]'); return li ? li.dataset.n : null; };
        const shownN = k => { const li = document.querySelector('#fc-strip .fc-i[data-k="' + k + '"] b'); return li ? li.textContent : null; };
        const numsOk = ['findings', 'recurring', 'promises'].every(k => n(k) === String(ov[k]) && shownN(k) === ov[k].toLocaleString('ko-KR')) &&
          n('period') === ov.from + '~' + ov.to && !document.querySelector('#fc-strip [data-k="committees"]');
        const input = document.getElementById('start-q');
        const anim = sweep ? getComputedStyle(sweep).animationName : '';
        const behind = !!bg && bg.getAttribute('aria-hidden') === 'true' && getComputedStyle(bg).pointerEvents === 'none';
        const ok = behind && !!w.querySelector('.fc-rings') && !!w.querySelector('.fc-iso') && !!sweep &&
          head === '의회 예보 · ' + g + ' 발표 · 공개자료 기준' && numsOk &&
          !!w.querySelector('.ss-box .ic-radar') && !w.querySelector('.ss-box .ic-search') &&
          input.placeholder.includes('우리 부서 예보 보기') && input.getAttribute('aria-label').startsWith('부서 검색 — 우리 부서 이름을 입력하세요') &&
          w.querySelector('h1.tagline').textContent === root.DCC_BRAND.tagline && !w.querySelector('.wx, [data-wx]');
        add('예보 시작 화면', ok, '발표=' + head + ' 띠=' + ['findings', 'recurring', 'promises', 'period'].map(k => k + ':' + n(k)).join(',') +
          ' 자료=' + ov.findings + '/' + ov.recurring + '/' + ov.promises + ' 회전=' + anim + ' 뒤=' + behind + ' 날씨 그림=' + !!w.querySelector('.wx'));
      } catch (e) { add('예보 시작 화면', false, e); }

      // ① 부서 검색 「청년」
      let rs = [];
      try {
        rs = root.DCC.core.searchDepts(ui.state.ix, '청년');
        add('부서 검색', rs.length >= 1, '결과 ' + rs.length + '건');
      } catch (e) { add('부서 검색', false, e); }

      // ② 첫 결과 선택
      if (rs.length) {
        try {
          ui.select({ kind: 'dept', name: rs[0].name });
          const cards = document.querySelectorAll('#summary-cards .sum-card').length;
          add('부서 선택', document.body.dataset.ready === '1' && cards === 4,
            '이름=' + rs[0].name + ' ready=' + document.body.dataset.ready + ' 카드=' + cards);
        } catch (e) { add('부서 선택', false, e); }
      } else add('부서 선택', false, '검색 결과 없음');

      // ②-1 부서를 고르면 사이드바가 보이고 본문은 그 오른쪽(시작 화면 틀이 풀림)
      try {
        const side = document.getElementById('side').getBoundingClientRect();
        const mc = document.querySelector('.main-col').getBoundingClientRect();
        const ok = sideShown() && mc.left >= side.right - 1 && !document.getElementById('app').classList.contains('start');
        add('선택 뒤 사이드바', ok, '사이드바=' + sideShown() + ' 폭=' + Math.round(side.width) + ' 본문 왼쪽=' + Math.round(mc.left));
      } catch (e) { add('선택 뒤 사이드바', false, e); }

      // ②-2 화면 틀(Task 4c): 탭 건수 뱃지, 지적 탭의 번호 목록, 줄을 누르면 오른쪽 상세, Esc 로 닫힘, 주소에 탭 반영
      try {
        const tabs = document.querySelectorAll('#tabs [role=tab]').length;
        ui.setTab('findings');
        const row = document.querySelector('#tabpanel .frow-main');
        if (!row) throw new Error('지적 줄이 없습니다');
        row.click();
        const det = document.getElementById('detail');
        const opened = !det.hidden && det.textContent.includes(row.querySelector('.fid').textContent);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const closed = det.hidden && !ui.state.detail;
        const urlTab = new URLSearchParams(location.search).get('tab') === 'findings';
        ui.setTab('summary');
        add('탭·상세 패널', tabs === 7 && opened && closed && urlTab, '탭=' + tabs + ' 열림=' + opened + ' Esc 닫힘=' + closed + ' 주소 탭=' + urlTab);
      } catch (e) { add('탭·상세 패널', false, e); }

      // ②-3 키보드 포커스(검토 수정 1): 탭을 누르면 그 탭 단추, 나무 펼치기를 누르면 같은 단추, 상세를 닫으면 누른 줄로 돌아온다
      try {
        document.getElementById('tab-budget').click();
        const tabOk = !!document.activeElement && document.activeElement.id === 'tab-budget';
        const tog = document.querySelector('#tree .tg:not(.open) .tg-tog');
        const key = tog.closest('.tg').dataset.key;
        tog.focus(); tog.click();
        let a = document.activeElement;
        const opened = !!a && a.classList.contains('tg-tog') && a.closest('.tg').dataset.key === key && a.getAttribute('aria-expanded') === 'true';
        a.click();
        a = document.activeElement;
        const closedT = !!a && a.classList.contains('tg-tog') && a.closest('.tg').dataset.key === key && a.getAttribute('aria-expanded') === 'false';
        document.getElementById('tab-findings').click();
        const row = document.querySelector('#tabpanel .frow-main');
        const fid = row.closest('.frow').dataset.fid;
        row.focus(); row.click();
        const inDet = !!document.activeElement && document.activeElement.id === 'detail-close' &&
          document.getElementById('detail').getAttribute('role') === 'dialog';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        a = document.activeElement;
        const back = !!a && a.classList.contains('frow-main') && a.closest('.frow').dataset.fid === fid;
        ui.setTab('summary');
        add('키보드 포커스', tabOk && opened && closedT && inDet && back,
          '탭=' + tabOk + ' 나무 펼침=' + opened + ' 접음=' + closedT + ' 상세=' + inDet + ' 돌아옴=' + back);
      } catch (e) { add('키보드 포커스', false, e); }

      // ③ 실국 「기획경제실」 선택
      try {
        ui.select({ kind: 'silguk', name: '기획경제실' });
        const n = ui.state.summary ? ui.state.summary.findings.length : 0;
        add('실국 선택', document.body.dataset.ready === '1' && n >= 1,
          'ready=' + document.body.dataset.ready + ' 지적=' + n);
      } catch (e) { add('실국 선택', false, e); }

      // ④ 내장 CSV(첫 지적 제목 그대로 + 완료) 첨부 → matched ≥ 1
      try {
        const f0 = ui.state.summary && ui.state.summary.findings[0];
        if (!f0) throw new Error('기준 지적이 없습니다');
        const bytes = new TextEncoder().encode(selftestCsv(f0.title)).buffer;
        const res = await ui.attachBytes('자체시험.csv', bytes);
        add('CSV 첨부', !res.error && res.matched >= 1, JSON.stringify(res));
      } catch (e) { add('CSV 첨부', false, e); }

      // ⑤ 내장 hwpx 첨부 → rows ≥ 1 (kordoc generate 로 만든 것이 없으면 skipped)
      const fixture = root.DCC.selftestFixture;
      if (!fixture || !fixture.hwpx) {
        add('hwpx 첨부', true, 'skipped');
      } else {
        try {
          const bytes = base64ToBytes(fixture.hwpx).buffer;
          const res = await ui.attachBytes('자체시험.hwpx', bytes);
          add('hwpx 첨부', !res.error && res.rows >= 1, JSON.stringify(res));
        } catch (e) { add('hwpx 첨부', false, e); }
      }

      // ⑤-2 내장 PDF(손으로 쓴 최소 PDF, 영문 가짜 표) → kordoc.parse 가 success·fileType 'pdf'.
      // 한글 조치 줄이 없어 extractActions 대신 파싱 성공만 본다. 이 단계만의 네트워크 호출도 따로 센다(0 이어야 함).
      if (!fixture || !fixture.pdf) {
        add('PDF 첨부', false, '견본 없음');
      } else {
        try {
          const before = netCalls;
          const res = await ui.parse(base64ToBytes(fixture.pdf).buffer);
          const calls = netCalls - before;
          add('PDF 첨부', !!res && res.success === true && res.fileType === 'pdf' && calls === 0,
            'success=' + (res && res.success) + ' fileType=' + (res && res.fileType) + ' 네트워크=' + calls +
            ' md=' + JSON.stringify(((res && res.markdown) || '').slice(0, 80)));
        } catch (e) { add('PDF 첨부', false, e); }
      }

      // ⑥ 프롬프트(2026-09-29: 후보를 골라 싣는다): 행감 대비를 고르면 기본 고르기로 [F1] 이 있고 이름 패턴 없음
      const P = root.DCC.prompts;
      const checkedIds = () => [...document.querySelectorAll('#cand-list input.cand')].filter(cb => cb.checked).map(cb => cb.dataset.id);
      const years = [...new Set(root.DCC_DATA.findings.map(f => Number(f.year)))].sort((a, b) => b - a);
      try {
        ui.openPrompt('행감대비');
        const t = ui.promptText('행감대비');
        const pre = document.getElementById('prompt-preview');
        add('프롬프트', t.includes('[F1]') && !NAME_RE.test(t) && !!pre && pre.textContent === t, 'len=' + t.length + ' 미리 보기 같음=' + (!!pre && pre.textContent === t));
      } catch (e) { add('프롬프트', false, e); }

      // ⑧ 행감 대비 기본 고르기: 최근 3개 자료 연도·되풀이 지적, 「완료」는 빼고, 약속은 고르지 않는다.
      //    완료로 반영된 최근 지적을 하나 만들어(시험 중에만) 체크되지 않는지 본다. 고름을 바꾸면 미리 보기·고른 수가 바로 바뀐다.
      {
        const target = ui.state.target;
        const f = ui.state.summary.findings.find(x => years.slice(0, 3).includes(Number(x.year)) && !ui.state.actions[x.id]);
        try {
          if (!f) throw new Error('최근 3개 연도 지적이 없습니다');
          ui.state.actions[f.id] = { status: '완료', text: '', source: '자체시험' };
          ui.select(target);                                       // 고름을 비우고 다시
          ui.openPrompt('행감대비');
          const s = ui.state.summary;
          const want = P.defaults('행감대비', s, ui.state.actions, years);
          const got = checkedIds();
          const same = got.length === want.findings.size && got.every(id => want.findings.has(id));
          const noDone = got.every(id => P.statusOf({ id }, ui.state.actions) !== '완료') && !got.includes(f.id);
          const noProm = !s.promises.guessed.some(p => got.includes(p.id));
          const n0 = Number(document.getElementById('picked-n').textContent);
          const pre0 = document.getElementById('prompt-preview').textContent;
          const cb = document.querySelector('#cand-list input.cand:checked');
          cb.click();                                              // 하나 빼기 → 바로 바뀜
          const n1 = Number(document.getElementById('picked-n').textContent);
          const pre1 = document.getElementById('prompt-preview').textContent;
          const live = n1 === n0 - 1 && pre1 !== pre0 && pre1 === ui.promptText('행감대비');
          add('행감 대비 기본에 완료 없음', same && noDone && noProm && n0 === got.length && live,
            '고름=' + got.length + ' 기본=' + want.findings.size + ' 완료 빠짐=' + noDone + ' 약속 없음=' + noProm + ' 바로 바뀜=' + live);
          // 손댄 뒤 종류를 바꾸면 고름을 그대로 두고, 「기본 고르기로」로 새 종류 기본에 맞춘다.
          const before = checkedIds().sort().join();
          document.querySelector('#prompt-panel button[data-kind="업무보고대비"]').click();
          const kept = checkedIds().sort().join() === before;
          document.getElementById('p-reset').click();
          const w2 = P.defaults('업무보고대비', ui.state.summary, ui.state.actions, years);
          const g2 = checkedIds();
          const reset = g2.length === w2.findings.size + w2.promises.size && g2.every(id => w2.findings.has(id) || w2.promises.has(id));
          add('종류 바꿈·기본 고르기로', kept && reset, '손댄 고름 유지=' + kept + ' 업무보고 기본=' + reset + '(' + g2.length + ')');
        } catch (e) { add('행감 대비 기본에 완료 없음', false, e); }
        finally { if (f) delete ui.state.actions[f.id]; ui.select(target); }
      }

      // ⑧-2 답변서 초안: 아무것도 고르지 않은 채 시작하고, 하나 이상 고르기 전에는 [복사]가 꺼져 있다.
      try {
        ui.openPrompt('답변서초안');
        const copy = document.getElementById('p-copy');
        const off = copy.disabled && !document.getElementById('pp-hint').hidden && document.getElementById('prompt-preview').hidden &&
          checkedIds().length === 0 && document.getElementById('picked-n').textContent === '0';
        document.querySelector('#cand-list input.cand').click();
        const on = !document.getElementById('p-copy').disabled && !document.getElementById('prompt-preview').hidden &&
          /\[[FP]1\]/.test(document.getElementById('prompt-preview').textContent);
        add('답변서 초안 고르기 전 복사 꺼짐', off && on, '처음 꺼짐=' + off + ' 하나 고른 뒤 켜짐=' + on);
      } catch (e) { add('답변서 초안 고르기 전 복사 꺼짐', false, e); }

      // ⑧-3 상세 패널의 「이 건 답변서 초안」: 답변서 초안으로 바꾸고 그 지적과 되풀이 줄기 형제를 미리 고른다.
      {
        const back = ui.state.target;
        try {
          const r = root.DCC_DATA.recurring.find(x => (ui.state.ix.depts.get(x.dept) || {}).current && x.finding_ids.length >= 2);
          if (!r) throw new Error('되풀이 줄기가 있는 부서가 없습니다');
          ui.select({ kind: 'dept', name: r.dept });
          const f = ui.state.summary.findings.find(x => x.recurring === r.id);
          ui.openDetail(f.id);
          document.getElementById('detail-draft').click();
          const want = P.draftPick(ui.state.summary, f.id);
          const got = checkedIds();
          const btn = document.querySelector('#prompt-panel button[data-kind="답변서초안"]');
          const ok = ui.state.tab === 'prompt' && btn.getAttribute('aria-pressed') === 'true' && want.size >= 2 &&
            got.length === want.size && got.every(id => want.has(id)) && !document.getElementById('p-copy').disabled &&
            document.getElementById('prompt-preview').textContent.includes('[F' + want.size + ']');
          add('상세 답변서 초안 미리 고름', ok, '부서=' + r.dept + ' 고름=' + got.length + ' 줄기=' + want.size);
        } catch (e) { add('상세 답변서 초안 미리 고름', false, e); }
        finally { ui.select(back); }
      }

      // ⑨ 대상을 바꿨다 돌아와도 확인 표에서 사람이 고친 것이 남는다(최종 검토 수정 7)
      try {
        const back = ui.state.target;
        const p = ui.state.pending[0];
        const row = p && p.rows.find(x => x.on);
        if (!row) throw new Error('미리 체크된 줄이 없습니다');
        row.on = false;                               // 사람이 체크를 끈 것
        ui.select({ kind: 'dept', name: '청년정책관' });
        ui.select(back);
        const same = ui.state.pending[0].rows.find(x => x.r.action === row.r.action);
        add('대상 바꿔도 고른 짝 유지', !!same && same.on === false, 'on=' + (same && same.on));
      } catch (e) { add('대상 바꿔도 고른 짝 유지', false, e); }

      // ⑩ 첨부: kordoc.parse 전에 한 번 양보해 「읽는 중…」이 그려지고, 20MB 넘는 파일은 경고 줄(최종 검토 수정 6)
      // kordoc 번들 객체를 직접 바꿔 끼우면 가짜가 불리지 않았다(첫 시도) — ui.parse 갈래를 잠시 바꿔 끼운다.
      {
        const origParse = ui.parse;
        const logLen = ui.state.log.length;
        try {
          let ticked = false, seen = null;
          setTimeout(() => { ticked = true; }, 0);
          ui.parse = async () => { seen = { ticked, busy: !!document.querySelector('.att-busy') }; return { success: false, fileType: 'pdf' }; };
          await ui.attachBytes('자체시험_큰파일.pdf', new ArrayBuffer(21 * 1024 * 1024));
          const warned = ui.state.log.slice(logLen).some(m => m.kind === 'warn' && m.text.includes('20MB'));
          add('첨부 양보·큰 파일 경고', !!seen && seen.ticked && seen.busy && warned, JSON.stringify(seen) + ' 경고=' + warned);
        } catch (e) { add('첨부 양보·큰 파일 경고', false, e); }
        finally { ui.parse = origParse; ui.state.log.length = logLen; }
      }

      // ⑪ 집행률 100% 초과 해가 있는 부서 → 예산 칸에 「이월·보충 자료 차이일 수 있음」 한 줄(3차 Task 0)
      // 자료에 조건에 맞는 부서가 없으면(자료 갱신으로 사라지면) 실패가 아니라 skipped 로 적는다(hwpx 견본 없음과 같은 꼴).
      {
        let name = null;
        try {
          name = Object.keys(root.DCC_DATA.expenditure).sort().find(n => ui.state.ix.depts.has(n) &&
            root.DCC_DATA.expenditure[n].some(e => e.year >= 2016 && e.budget > 0 && e.spent > e.budget)) || null;
        } catch (e) { add('초과 집행 설명', false, e); name = undefined; }
        if (name === null) add('초과 집행 설명', true, 'skipped: 조건에 맞는 자료 없음');
        else if (name) {
          try {
            ui.select({ kind: 'dept', name });
            ui.setTab('budget');   // 초과 설명은 예산 탭에 있다(Task 4c)
            const note = document.getElementById('budget-over');
            const deptOk = !!note && note.textContent.includes('이월·보충 자료 차이일 수 있음') &&
              !note.textContent.includes('실·국 합산 기준');
            // 합산해도 초과가 남는 실·국이 있으면 그 화면의 설명에 「실·국 합산 기준」이 붙는지도 본다(없으면 이 부분만 건너뜀).
            const sgName = root.DCC.core.silguks(ui.state.ix).map(g => g.name).find(g =>
              root.DCC.core.summarize(ui.state.ix, { kind: 'silguk', name: g }).overYears.some(y => y >= 2016));
            let sgOk = true, sgText = '실·국 합산 초과 없음(건너뜀)';
            if (sgName) {
              ui.select({ kind: 'silguk', name: sgName });
              const sn = document.getElementById('budget-over');
              sgOk = !!sn && sn.textContent.includes('실·국 합산 기준');
              sgText = sgName + ': ' + (sn ? sn.textContent : '(없음)');
            }
            add('초과 집행 설명', deptOk && sgOk,
              name + ': ' + (note ? note.textContent : '(없음)') + ' / ' + sgText);
          } catch (e) { add('초과 집행 설명', false, e); }
        }
      }

      // ⑫ 국 단위 공통 지적(group = 실·국 이름, dept = 여러 부서 공통)이 그 실·국 화면의 「공통 지적」 칸에 보인다(3차 Task 0)
      // 조건에 맞는 지적이 없으면 skipped.
      {
        let f = null;
        try {
          const sg = new Set(root.DCC.core.silguks(ui.state.ix).map(g => g.name));
          f = root.DCC_DATA.findings.find(x => x.dept === '여러 부서 공통' && sg.has((x.group || '').trim())) || null;
        } catch (e) { add('국 공통 지적', false, e); f = undefined; }
        if (f === null) add('국 공통 지적', true, 'skipped: 조건에 맞는 자료 없음');
        else if (f) {
          try {
            ui.select({ kind: 'silguk', name: f.group.trim() });
            ui.setTab('findings');   // 공통 지적은 지적 탭 아래에 있다(Task 4c)
            const box = document.getElementById('silguk-common');
            const note = document.getElementById('budget-over');
            add('국 공통 지적', !!box && box.textContent.includes(f.title) && ui.state.summary.common.length >= 1 &&
              (!note || note.textContent.includes('실·국 합산 기준')),
              f.group + ': ' + (box ? ui.state.summary.common.length + '건' : '(칸 없음)') + (note ? ' · 초과 설명=' + note.textContent : ''));
          } catch (e) { add('국 공통 지적', false, e); }
        }
      }

      // ⑬ 분류색(Task 4e): 요약 카드 4개의 숫자 색이 서로 다르고(행감 지적·되풀이·약속·집행률), 기본 글자색과도 다르다
      try {
        ui.select({ kind: 'dept', name: rs[0].name });
        ui.setTab('summary');
        const ink = getComputedStyle(document.querySelector('.page-head h2')).color;
        const cs = [...document.querySelectorAll('#summary-cards .sum-card .v .mono')].map(n => getComputedStyle(n).color);
        const tabC = getComputedStyle(document.querySelector('#tab-findings .count')).color;
        add('분류색', cs.length === 4 && new Set(cs).size === 4 && !cs.includes(ink) && tabC === cs[0],
          '카드=' + cs.join(' / ') + ' 지적 탭 배지=' + tabC + ' 글자=' + ink);
      } catch (e) { add('분류색', false, e); }

      // ⑭ 글자 크기(Task 4e): 가+ 로 루트 글자 크기가 커지고 주소 &fs= 에 반영, Alt+0 으로 기본(주소에서 빠짐)
      try {
        const px = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
        const base = px();
        document.getElementById('fs-up').click();
        const up = px(), urlUp = new URLSearchParams(location.search).get('fs');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Digit0', altKey: true, bubbles: true }));
        const back = px(), urlBack = new URLSearchParams(location.search).get('fs');
        add('글자 크기', up > base && urlUp === '112' && back === base && urlBack === null,
          '기본=' + base + 'px 가+=' + up + 'px 주소=' + urlUp + ' Alt+0=' + back + 'px 주소=' + urlBack);
      } catch (e) { add('글자 크기', false, e); }

      // ⑮ 테마(Task 4e): 자동 → 라이트 → 다크 → 자동. data-theme 과 계산된 바탕색, 주소 &theme=
      try {
        const bg = () => getComputedStyle(document.body).backgroundColor;
        const th = () => document.documentElement.dataset.theme || 'auto';
        const btn = document.getElementById('theme-btn');
        const seen = [];
        for (let i = 0; i < 3; i++) {
          btn.click();
          seen.push(th() + ':' + bg() + ':' + (new URLSearchParams(location.search).get('theme') || '-'));
        }
        const ok = seen[0] === 'light:rgb(250, 250, 250):light' && seen[1] === 'dark:rgb(10, 10, 10):dark' && seen[2].startsWith('auto:') &&
          seen[2].endsWith(':-') && btn.getAttribute('aria-label').includes('자동');
        add('테마 세 단계', ok, seen.join(' → '));
      } catch (e) { add('테마 세 단계', false, e); }

      // ⑯ 홈(Task 4e): 「처음으로」를 누르면 시작 화면, 주소에서 dept·tab 이 빠지고 포커스는 큰 검색창
      try {
        ui.setTab('findings');
        document.getElementById('fs-up').click();          // 글자를 키운 채 홈으로 가도 fs 는 남아야 한다
        document.getElementById('home-btn').click();
        const q = new URLSearchParams(location.search);
        const href = document.getElementById('brand-home').getAttribute('href');
        const ok = !!document.querySelector('#body .welcome #start-q') && !!document.activeElement && document.activeElement.id === 'start-q' &&
          !q.has('dept') && !q.has('silguk') && !q.has('tab') && q.get('fs') === '112' && href === '?fs=112' && ui.state.target === null;
        ui.setFs(100);
        const lay = startLayout();
        add('처음으로 사이드바 감춤', lay.ok, lay.text);
        add('처음으로', ok, 'search=' + location.search + ' 홈 링크=' + href + ' 포커스=' + (document.activeElement && document.activeElement.id));
      } catch (e) { add('처음으로', false, e); }

      // ⑰ 시작 화면 검색창(Task 4e): 이름을 치면 아래 목록, Enter 로 그 부서가 열린다. 실·국 바로가기는 가나다순
      try {
        const input = document.getElementById('start-q');
        input.value = rs[0].name;
        input.dispatchEvent(new Event('input'));
        const shown = !document.getElementById('start-list').hidden && document.querySelectorAll('#start-list li[role=option]').length >= 1;
        const chips = [...document.querySelectorAll('.sg-chips .sg-chip')].map(b => b.textContent);
        const sorted = chips.every((c, i) => !i || chips[i - 1].localeCompare(c, 'ko') <= 0);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const t = ui.state.target;
        // 검색 줄 순서(맞춤 정도): 이름이 검색어로 시작하는 부서가 실·국 합산이나 이름에 들어 있기만 한 부서보다 먼저
        let orderOk = true, orderText = '건너뜀';
        const pre = [...ui.state.ix.depts.values()].find(d => d.current && [...ui.state.ix.depts.values()].some(e =>
          e.current && e.name !== d.name && e.name.slice(1).includes(d.name.slice(0, 2))));
        if (pre) {
          ui.openQS();
          const qi = document.getElementById('dept-q');
          qi.value = pre.name.slice(0, 2); qi.dispatchEvent(new Event('input'));
          const first = document.querySelector('#dept-list li[role=option]');
          orderOk = !!first && !!first.dataset.name && first.dataset.name.startsWith(pre.name.slice(0, 2));
          orderText = qi.value + '→' + (first ? first.dataset.name || first.dataset.silguk : '(없음)');
          ui.closeQS(false);
        }
        add('시작 화면 검색', orderOk && shown && sorted && chips.length >= 1 && !!t && t.name === rs[0].name && document.body.dataset.ready === '1',
          '목록=' + shown + ' 칩=' + chips.length + ' 가나다=' + sorted + ' 연 부서=' + (t && t.name) + ' 줄 순서=' + orderText);
      } catch (e) { add('시작 화면 검색', false, e); }

      // ⑱ 구 부서 순서(2026-09-28 사용자 요청): 구 실·국을 펼치면 구청 부서(가나다순)가 먼저, 동(가나다순)이 뒤.
      //     「구청」·「보건소」·「보좌기관」 묶음은 없다. 구·동 판정은 자료의 gu·dong(region.json).
      try {
        const core = root.DCC.core, ix = ui.state.ix, ko = (a, b) => a.localeCompare(b, 'ko');
        const gus = (root.DCC_DATA.gu || []).map(g => g + '구');
        const out = [];
        let ok = gus.length > 0;
        for (const g of gus) {
          ui.select({ kind: 'silguk', name: g });
          const names = [...document.querySelectorAll('#tree .tg[data-key="sg:' + g + '"] .tg-list .ti[data-name]')].map(b => b.dataset.name);
          const dong = names.map(n => core.isDong(ix, n));
          const firstDong = dong.indexOf(true);
          const offices = firstDong < 0 ? names : names.slice(0, firstDong), dongs = firstDong < 0 ? [] : names.slice(firstDong);
          const good = names.length > 0 && firstDong > 0 && dong.slice(firstDong).every(Boolean) &&
            offices.join() === [...offices].sort(ko).join() && dongs.join() === [...dongs].sort(ko).join();
          ok = ok && good;
          out.push(g + ': 구청 ' + offices.length + ' · 동 ' + dongs.length + (good ? '' : ' 순서 어긋남 ' + names.slice(0, 12).join(',')));
        }
        const labels = [...document.querySelectorAll('#tree .tg-name')].map(b => b.textContent.trim());
        const bad = labels.filter(l => ['구청', '보건소', '보좌기관'].includes(l));
        add('구 부서 순서', ok && !bad.length, out.join(' / ') + (bad.length ? ' 남은 묶음=' + bad.join(',') : ''));
      } catch (e) { add('구 부서 순서', false, e); }

      // ⑥-9 직원용에는 부서 날씨 그림·등급이 어디에도 없다(시험 내내 붙은 것까지 — wxSeen 감시).
      try {
        wxObs.disconnect();
        const now = document.querySelectorAll('.wx, [data-wx], .wx-legend').length;
        add('날씨 그림 없음', wxSeen === 0 && now === 0 && !/구름 조금|물을 거리/.test(document.getElementById('app').innerText), '감시=' + wxSeen + ' 지금=' + now);
      } catch (e) { add('날씨 그림 없음', false, e); }

      // ⑦ 네트워크 호출 0건(fetch·XHR·sendBeacon 을 부르지 않았는지)
      add('네트워크 0건', netCalls === 0, 'calls=' + netCalls);

      // 가로 스크롤 없음(폭보다 넓은 요소가 없는지)
      add('가로 스크롤 없음', document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        'scrollWidth=' + document.documentElement.scrollWidth + ' clientWidth=' + document.documentElement.clientWidth);

      // 저장소 0건(첨부·조치 내용은 메모리에만 둔다)
      try {
        add('저장소 비어 있음', localStorage.length === 0 && sessionStorage.length === 0,
          'localStorage=' + localStorage.length + ' sessionStorage=' + sessionStorage.length);
      } catch (e) { add('저장소 비어 있음', false, e); }
    } finally {
      if (origFetch) root.fetch = origFetch;
      if (origOpen) XHR.prototype.open = origOpen;
      if (origBeacon) navigator.sendBeacon = origBeacon;
    }

    return { ok: steps.every(s => s.ok), steps };
  }

  ui.onReady = function () {
    if (!new URLSearchParams(location.search).has('selftest')) return;
    selftest().then(res => {
      document.body.appendChild(ui.el('pre', { id: 'selftest' }, JSON.stringify(res)));
    });
  };

  const api = { selftest };
  root.DCC = root.DCC || {};
  root.DCC.selftest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
