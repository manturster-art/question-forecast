// 역할: 구동 동영상 녹화 전용 주입 스크립트(자막 띠·가짜 커서·강조 테두리·표지/끝 화면).
// tools/video/make_video.py 가 out/부서점검표.html 의 「복사본」(work/video/녹화판.html) 끝에만 붙인다 —
// 배포 HTML 에는 들어가지 않는다. 화면 자료는 건드리지 않고 위에 겹쳐 그리기만 한다.
// window.REC_BRAND(make_video.py 가 config/brand.json 에서 넣음)를 표지에 쓴다.
(function (root) {
  const doc = root.document;
  doc.documentElement.style.scrollBehavior = 'auto';   // 스크롤은 아래 scrollTo 가 프레임마다 직접 움직인다
  const css = `
  #rec-cap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000; min-height: 92px;
    display: flex; align-items: center; justify-content: center; padding: 14px 40px;
    background: rgba(10, 10, 10, .92); color: #fff; font: 700 31px/1.35 "Malgun Gothic", sans-serif;
    letter-spacing: -0.01em; text-align: center; transition: opacity .25s; box-shadow: 0 -2px 12px rgba(0,0,0,.25); }
  #rec-cap.off { opacity: 0; }
  #rec-cap .sub { display: block; font-size: 20px; font-weight: 400; color: #cfcfcf; margin-top: 2px; }
  #rec-cursor { position: fixed; left: 0; top: 0; width: 30px; height: 30px; z-index: 2147483200; pointer-events: none;
    transition: transform .6s cubic-bezier(.3,.7,.3,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
  #rec-cursor.hide { display: none; }
  #rec-click { position: fixed; z-index: 2147483100; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
    border: 4px solid #f59e0b; pointer-events: none; opacity: 0; }
  #rec-click.go { animation: rec-pulse .55s ease-out; }
  @keyframes rec-pulse { 0% { opacity: 1; transform: scale(.4); } 100% { opacity: 0; transform: scale(1.5); } }
  .rec-ring { outline: 4px solid #f59e0b !important; outline-offset: 3px; border-radius: 6px; transition: outline-color .3s; }
  #rec-card { position: fixed; inset: 0; z-index: 2147483300; display: flex; flex-direction: column; align-items: center;
    justify-content: center; background: radial-gradient(50% 70% at 10% 0%, rgba(80,227,194,.18), transparent 70%), radial-gradient(45% 70% at 55% 0%, rgba(0,124,240,.16), transparent 70%), radial-gradient(45% 70% at 100% 0%, rgba(121,40,202,.16), transparent 70%), #0a0a0a; color: #fff; text-align: center;
    font-family: "Geist", "Pretendard", "Malgun Gothic", sans-serif; transition: opacity .5s; padding: 40px 80px; }
  #rec-card.off { opacity: 0; pointer-events: none; }
  #rec-card .nm { font-size: 76px; font-weight: 800; letter-spacing: -0.03em; margin: 0; }
  #rec-card .sb { font-size: 34px; font-weight: 600; color: #dbe6f3; margin: 10px 0 0; }
  #rec-card .tg { font-size: 27px; color: #f8d58a; margin: 30px 0 0; }
  #rec-card .pl { font-size: 23px; color: #c9d6e6; margin: 34px 0 0; padding: 10px 24px; border: 1px solid #3a3a3a; border-radius: 30px; }
  #rec-card .big { font-size: 40px; font-weight: 700; line-height: 1.5; margin: 0; }
  #rec-card .big b { color: #f8d58a; }
  #rec-card .fine { font-size: 18px; color: #b7c6d9; margin: 36px 0 0; max-width: 1000px; line-height: 1.6; }
  #rec-file { position: fixed; right: 24px; bottom: 108px; left: auto; z-index: 2147483000; background: #fffdf4; color: #1c2330;
    border: 2px solid #d9b650; border-radius: 10px; padding: 12px 16px; font: 15px/1.5 Consolas, "Malgun Gothic", monospace;
    box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: 1232px; white-space: pre; transition: opacity .3s; }
  #rec-file.off { opacity: 0; }
  #rec-file .h { font: 700 15px "Malgun Gothic", sans-serif; color: #7a5a00; margin-bottom: 6px; white-space: normal; }
  #rec-file .fk { background: #fff0b8; }
  `;
  const st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);
  const mk = (tag, id, cls) => { const n = doc.createElement(tag); if (id) n.id = id; if (cls) n.className = cls; doc.body.appendChild(n); return n; };
  const cap = mk('div', 'rec-cap', 'off');
  const cursor = mk('div', 'rec-cursor', 'hide');
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2 L3 20 L8 15.5 L11.5 23 L14.5 21.6 L11 14.3 L18 14.3 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const click = mk('div', 'rec-click');
  const card = mk('div', 'rec-card', 'off');
  const file = mk('div', 'rec-file', 'off');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = sel => (typeof sel === 'string' ? doc.querySelector(sel) : sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cx = 640, cy = 400;

  const REC = {
    sleep,
    caption(text, sub) {
      if (!text) { cap.classList.add('off'); return; }
      cap.innerHTML = '<div>' + esc(text) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div>';
      cap.classList.remove('off');
    },
    titleCard(b) {
      card.innerHTML = '<p class="nm">' + esc(b.name) + '</p><p class="sb">' + esc(b.subtitle) + '</p>' +
        '<p class="tg">' + esc(b.tagline) + '</p><p class="pl">공개자료만 · 설치 없이 더블클릭</p>';
      card.classList.remove('off');
    },
    endCard(minutes) {
      card.innerHTML = '<p class="big">행감 대비 자료 모으기</p>' +
        '<p class="big">부서당 <b>2~3일</b><span style="font-size:24px;font-weight:400;color:#c9d6e6">(사용자 경험)</span>' +
        ' → 이 도구로 <b>' + esc(minutes) + '분</b></p>' +
        '<p class="fine">「' + esc(minutes) + '분」은 이 영상 녹화에서 부서 찾기부터 프롬프트 복사까지(3~8번 장면)에 실제로 걸린 시간을 올림한 값입니다. ' +
        '자료 모으기·정리 단계에만 해당하며, 답변 작성·검토 시간은 넣지 않았습니다. 「2~3일」은 사용자 경험에 따른 값입니다.</p>' +
        '<p class="pl">' + esc((root.REC_BRAND || {}).name || '') + ' · 공개자료만 · 설치 없이 더블클릭</p>';
      card.classList.remove('off');
    },
    hideCard() { card.classList.add('off'); },
    showFile(title, lines, fakeIdx) {
      file.innerHTML = '<div class="h">' + esc(title) + '</div>' +
        lines.map((l, i) => '<div' + (fakeIdx.includes(i) ? ' class="fk"' : '') + '>' + esc(l) + '</div>').join('');
      file.classList.remove('off');
    },
    hideFile() { file.classList.add('off'); },
    cursorOn() { cursor.classList.remove('hide'); cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)'; },
    cursorOff() { cursor.classList.add('hide'); },
    async moveTo(sel, opt) {
      const n = $(sel); if (!n) throw new Error('없음: ' + sel);
      const r = n.getBoundingClientRect();
      const o = opt || {};
      cx = Math.round(r.left + Math.min(r.width * (o.fx == null ? 0.5 : o.fx), r.width - 4));
      cy = Math.round(r.top + r.height * (o.fy == null ? 0.55 : o.fy));
      REC.cursorOn();
      cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      await sleep(o.ms || 700);
      return n;
    },
    async pulse() {
      click.style.left = cx + 'px'; click.style.top = cy + 'px';
      click.classList.remove('go'); void click.offsetWidth; click.classList.add('go');
      await sleep(250);
    },
    async click(sel, opt) { const n = await REC.moveTo(sel, opt); await REC.pulse(); n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); n.click(); await sleep(300); return n; },
    ring(sel) { const n = $(sel); if (n) n.classList.add('rec-ring'); return n; },
    unring() { doc.querySelectorAll('.rec-ring').forEach(n => n.classList.remove('rec-ring')); },
    // 눈에 보이게 한 글자씩 친다(input 사건을 띄워 화면의 검색 목록이 따라 열린다).
    async type(sel, text, perChar) {
      const n = $(sel); n.focus();
      for (const ch of text) { n.value += ch; n.dispatchEvent(new Event('input', { bubbles: true })); await sleep(perChar || 380); }
    },
    // 부드러운 스크롤: 목표 위치까지 ms 에 걸쳐 프레임마다 움직인다. 목표는 요소(위 여백 offset) 또는 숫자.
    async scrollTo(target, ms, offset) {
      const start = root.scrollY;
      let to = typeof target === 'number' ? target
        : $(target).getBoundingClientRect().top + root.scrollY - (offset == null ? 16 : offset);
      to = Math.max(0, Math.min(to, doc.documentElement.scrollHeight - root.innerHeight));
      const t0 = performance.now(), d = ms || 1200;
      await new Promise(res => {
        const step = now => {
          const k = Math.min(1, (now - t0) / d), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          root.scrollTo(0, start + (to - start) * e);
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      cursor.style.transition = 'none'; cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      void cursor.offsetWidth; cursor.style.transition = '';
    },
    async scrollBox(sel, ms) {
      const n = $(sel); const to = n.scrollHeight - n.clientHeight; const t0 = performance.now(), d = ms || 4000;
      await new Promise(res => { const step = now => { const k = Math.min(1, (now - t0) / d); n.scrollTop = to * k;
        if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    },
  };
  root.REC = REC;
})(window);
