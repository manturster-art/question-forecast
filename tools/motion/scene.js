// 역할: 「질문 예보」 30초 모션그래픽. window.seek(t) 가 t초(0~30)의 한 장면을 결정적으로 그린다
// (난수는 씨앗 고정, 시계·requestAnimationFrame 을 쓰지 않는다). 숫자는 모두 window.MOTION(자료에서 뽑음)에서 온다.
// 1920×1080. 캔버스(배경·입자·레이더·점) 위에 DOM 글자층, 맨 위에 입자 결(grain)을 얹는다.
(function () {
  'use strict';
  const M = window.MOTION;
  const W = 1920, H = 1080, DUR = 30;
  const stage = document.getElementById('stage');

  // ───────── 도구 ─────────
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    inQ: p => p * p, outQ: p => 1 - (1 - p) * (1 - p),
    inC: p => p * p * p, outC: p => 1 - Math.pow(1 - p, 3),
    ioC: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outX: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inX: p => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
    ioX: p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2),
  };
  // 감쇠 용수철 0→1 (u = 시작 뒤 초)
  function spring(u, f = 2.4, z = 0.45) {
    if (u <= 0) return 0;
    const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
  }
  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmt = n => n.toLocaleString('en-US');
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const C = { find: [110, 168, 255], rec: [255, 125, 156], prom: [187, 155, 255], exec: [63, 208, 182], ink: [237, 237, 237] };

  function el(cls, parent, html) {
    const e = document.createElement('div');
    e.className = 'a ' + cls;
    if (html !== undefined) e.innerHTML = html;
    (parent || stage).appendChild(e);
    e.style.display = 'none';
    return e;
  }
  // (x, y) 에 요소의 기준점(ax, ay %)을 둔다. 기본은 가운데.
  function put(e, x, y, o) {
    o = o || {};
    const op = o.o === undefined ? 1 : o.o;
    if (op <= 0.002) { if (e.style.display !== 'none') e.style.display = 'none'; return; }
    const s = o.s === undefined ? 1 : o.s, sx = o.sx === undefined ? s : o.sx, sy = o.sy === undefined ? s : o.sy;
    const r = o.r || 0, b = o.b || 0, ax = o.ax === undefined ? -50 : o.ax, ay = o.ay === undefined ? -50 : o.ay;
    if (e.style.display === 'none') e.style.display = '';
    e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) translate(${ax}%,${ay}%) ${o.pre || ''} scale(${sx.toFixed(4)},${sy.toFixed(4)}) rotate(${r.toFixed(3)}deg)`;
    e.style.opacity = op.toFixed(4);
    e.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none';
  }
  const hide = e => { if (e.style.display !== 'none') e.style.display = 'none'; };
  function setHTML(e, h) { if (e.__h !== h) { e.innerHTML = h; e.__h = h; } }

  function canvas(id) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H; c.id = id;
    stage.appendChild(c);
    return c.getContext('2d');
  }
  const bg = canvas('bg');
  const fx = canvas('fx');

  // ───────── 배경: 분류색 안개 + 점 격자(시차) + 가장자리 어둡게 ─────────
  const gridTile = document.createElement('canvas');
  gridTile.width = gridTile.height = 48;
  (g => { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(23, 23, 2, 2); })(gridTile.getContext('2d'));
  const gridPat = bg.createPattern(gridTile, 'repeat');
  // 시각별 안개 세기 [행감 파랑, 되풀이 장미, 약속 보라, 예산 청록]
  const MOOD = [[0, [0.03, 0.13, 0.02, 0]], [3, [0.05, 0.08, 0.09, 0]], [7, [0.11, 0.03, 0.07, 0.04]],
    [11, [0.07, 0.05, 0.06, 0.06]], [17, [0.06, 0.03, 0.05, 0.05]], [24, [0.03, 0.08, 0.03, 0.08]],
    [27, [0.10, 0.04, 0.08, 0.05]], [30, [0.10, 0.04, 0.08, 0.05]]];
  function mood(t) {
    for (let i = 0; i < MOOD.length - 1; i++) {
      const [a, va] = MOOD[i], [b, vb] = MOOD[i + 1];
      if (t <= b) { const p = E.ioC(seg(t, a, b)); return va.map((v, k) => lerp(v, vb[k], p)); }
    }
    return MOOD[MOOD.length - 1][1];
  }
  function drawBg(t) {
    bg.globalAlpha = 1;
    bg.fillStyle = '#09090b';
    bg.fillRect(0, 0, W, H);
    const m = mood(t);
    const blobs = [
      [C.find, 1500 + Math.sin(t * 0.21) * 160, 180 + Math.cos(t * 0.17) * 90, 900],
      [C.rec, 330 + Math.cos(t * 0.19) * 140, 860 + Math.sin(t * 0.23) * 80, 850],
      [C.prom, 560 + Math.sin(t * 0.15 + 2) * 180, 160 + Math.cos(t * 0.2) * 70, 800],
      [C.exec, 1560 + Math.cos(t * 0.18 + 1) * 150, 920 + Math.sin(t * 0.16) * 70, 820],
    ];
    blobs.forEach((b, i) => {
      if (m[i] <= 0.002) return;
      const g = bg.createRadialGradient(b[1], b[2], 0, b[1], b[2], b[3]);
      g.addColorStop(0, rgba(b[0], m[i])); g.addColorStop(1, rgba(b[0], 0));
      bg.fillStyle = g; bg.fillRect(0, 0, W, H);
    });
    bg.save();
    bg.globalAlpha = 0.9;
    bg.translate(-((t * 9) % 48), -((t * 5) % 48));
    bg.fillStyle = gridPat; bg.fillRect(0, 0, W + 48, H + 48);
    bg.restore();
    const v = bg.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.62)');
    bg.fillStyle = v; bg.fillRect(0, 0, W, H);
  }

  // ═════════ 장면 A (0~3초) 긴장: 달력 D-7, 쏟아지는 문서, 자료 찾기 2~3일 ═════════
  const A = {};
  A.cal = el('cal', stage, '<div class="band">행정사무감사</div><div class="ring" style="left:96px"></div>' +
    '<div class="ring" style="left:268px"></div><div class="lab">행감</div><div class="flip"><div class="num"></div><div class="num"></div></div><div class="fold"></div>');
  A.f = A.cal.querySelectorAll('.flip div');
  A.kick = el('kick', stage, '자료 찾기');
  A.kickSub = el('kick-sub', stage, '흩어진 지적·약속·예산을 부서가 직접 모으면');
  A.val = el('big-val', stage);
  A.bar = el('bar', stage, '<i></i>');
  A.fill = A.bar.firstChild;
  const FLIP = ['D-30', 'D-21', 'D-14', 'D-7'], FLIP_T = [0.45, 0.8, 1.15], FLIP_D = 0.26;
  const docs = (() => {
    const R = rng(11), out = [];
    for (let i = 0; i < 70; i++) {
      const z = 0.3 + R() * 0.7;
      out.push({ x: R() * 2060 - 70, z, d: R() * 2.3 - 0.2, v: 260 + 520 * z, r0: (R() - 0.5) * 70, w: (R() - 0.5) * 140,
        sway: R() * 6.28, lines: 3 + ((R() * 4) | 0), c: [C.find, C.rec, C.prom, C.exec][(R() * 4) | 0], y0: -260 - R() * 200 });
    }
    return out.sort((a, b) => a.z - b.z);
  })();
  function docAt(dc, t) {
    const u = t - dc.d;
    return { x: dc.x + Math.sin(u * 1.3 + dc.sway) * 50 * dc.z, y: dc.y0 + dc.v * u + 330 * u * u * dc.z, r: (dc.r0 + dc.w * u) * Math.PI / 180 };
  }
  function drawDoc(dc, p, alpha) {
    const w = 60 + 120 * dc.z, h = w * 1.32;
    fx.save();
    fx.translate(p.x, p.y); fx.rotate(p.r);
    fx.globalAlpha = alpha;
    fx.fillStyle = '#e8e9ec';
    fx.beginPath(); fx.roundRect(-w / 2, -h / 2, w, h, w * 0.06); fx.fill();
    fx.fillStyle = rgba(dc.c, 1);
    fx.fillRect(-w / 2 + w * 0.12, -h / 2 + h * 0.1, w * 0.34, h * 0.05);
    fx.fillStyle = 'rgba(20,20,24,0.22)';
    for (let k = 0; k < dc.lines; k++) fx.fillRect(-w / 2 + w * 0.12, -h / 2 + h * (0.24 + k * 0.1), w * (k % 3 === 2 ? 0.5 : 0.76), h * 0.028);
    fx.restore();
  }
  function drawDocs(t) {
    const layer = 1 - E.inC(seg(t, 2.7, 3.25));
    if (layer <= 0) return;
    for (const dc of docs) {
      if (t < dc.d) continue;
      const far = dc.z < 0.55;
      const base = (far ? 0.05 + 0.3 * dc.z : 0.1 + 0.36 * dc.z) * layer * seg(t, dc.d, dc.d + 0.15);
      if (far) {   // 먼 문서: 깊이 흐림, 잔상 없음
        fx.filter = `blur(${((0.55 - dc.z) * 9 + 1).toFixed(1)}px)`;
        drawDoc(dc, docAt(dc, t), base);
        fx.filter = 'none';
        continue;
      }
      // 잔상(움직임 흐림 흉내): 조금 앞선 시각 셋을 옅게
      for (let k = 3; k >= 1; k--) {
        const tt = t - k * 0.018;
        if (tt < dc.d) continue;
        drawDoc(dc, docAt(dc, tt), base * 0.16 / k);
      }
      drawDoc(dc, docAt(dc, t), base);
    }
    // 글자 뒤 어둠 — 문서가 숫자 대비를 해치지 않게
    const sa = layer * seg(t, 0.8, 1.4);
    if (sa > 0) {
      fx.save(); fx.translate(1360, 540); fx.scale(1.55, 1.05);
      const g = fx.createRadialGradient(0, 0, 0, 0, 0, 360);
      g.addColorStop(0, `rgba(9,9,11,${0.9 * sa})`); g.addColorStop(0.65, `rgba(9,9,11,${0.7 * sa})`); g.addColorStop(1, 'rgba(9,9,11,0)');
      fx.fillStyle = g; fx.fillRect(-360, -360, 720, 720);
      fx.restore();
    }
  }
  function sceneA(t) {
    if (t > 3.3) { [A.cal, A.kick, A.kickSub, A.val, A.bar].forEach(hide); return; }
    const ex = E.inC(seg(t, 2.72, 3.2));
    const exo = 1 - ex, exb = 16 * ex, exy = -36 * ex;
    // 달력
    const u = t - 0.05;
    let s = lerp(0.84, 1, spring(u, 1.7, 0.55));
    if (t > 1.41) s *= 1 + 0.055 * Math.exp(-5.5 * (t - 1.41)) * Math.sin(17 * (t - 1.41));
    put(A.cal, 620, 540 + 44 * (1 - E.outX(seg(t, 0.05, 0.8))) + exy,
      { s: s * (1 - 0.06 * ex), r: lerp(-5, -2.2, E.outX(seg(t, 0.05, 1.2))), o: seg(t, 0.05, 0.3) * exo, b: exb + 8 * (1 - seg(t, 0.05, 0.35)) });
    // 넘기는 숫자
    let k = 0;
    while (k < FLIP_T.length && t >= FLIP_T[k]) k++;
    const ft = FLIP_T[k - 1];
    const col = i => (i === FLIP.length - 1 ? 'var(--rec)' : 'var(--ink)');
    if (k > 0 && t < ft + FLIP_D) {
      const p = (t - ft) / FLIP_D;
      setHTML(A.f[0], FLIP[k - 1]); A.f[0].style.color = col(k - 1);
      setHTML(A.f[1], FLIP[k]); A.f[1].style.color = col(k);
      if (p < 0.5) {
        A.f[0].style.transform = `rotateX(${(E.inQ(p * 2) * 90).toFixed(2)}deg)`; A.f[0].style.opacity = 1;
        A.f[1].style.opacity = 0;
      } else {
        A.f[0].style.opacity = 0;
        A.f[1].style.transform = `rotateX(${(-(1 - E.outQ((p - 0.5) * 2)) * 90).toFixed(2)}deg)`; A.f[1].style.opacity = 1;
      }
    } else {
      setHTML(A.f[0], FLIP[k]); A.f[0].style.color = col(k);
      A.f[0].style.transform = 'none'; A.f[0].style.opacity = 1; A.f[1].style.opacity = 0;
    }
    A.f[0].style.textShadow = k === FLIP.length - 1 ? '0 0 40px rgba(255,125,156,0.45)' : 'none';
    // 자료 찾기 → 2~3일
    const X0 = 1070;
    const inK = E.outX(seg(t, 0.85, 1.45));
    put(A.kick, X0 + 30 * (1 - inK), 372 + exy, { ax: 0, o: seg(t, 0.85, 1.1) * exo, b: exb + 6 * (1 - inK) });
    const inS = E.outX(seg(t, 0.98, 1.6));
    put(A.kickSub, X0 + 30 * (1 - inS), 428 + exy, { ax: 0, o: seg(t, 0.98, 1.25) * exo, b: exb + 6 * (1 - inS) });
    const fill = E.ioC(seg(t, 1.3, 2.45));
    put(A.bar, X0, 700 + exy, { ax: 0, o: seg(t, 1.1, 1.35) * exo, b: exb });
    A.fill.style.transform = `scaleX(${fill.toFixed(4)})`;
    if (t >= 1.35) {
      let h, sv = 1;
      if (t < 2.45) {
        const days = Math.max(0.5, Math.round(fill * 4) / 2);
        h = `<span class="num">${days}</span><span class="u">일</span>`;
        sv = 1 + 0.03 * Math.exp(-14 * (t - (1.3 + (days * 2 / 4) * 1.15))) ;
      } else {
        h = '<span class="num">2~3</span><span class="u">일</span>';
        sv = lerp(1.18, 1, spring(t - 2.45, 2.6, 0.4));
      }
      setHTML(A.val, h);
      A.val.style.textShadow = t >= 2.45 ? `0 0 ${(40 * Math.exp(-2 * (t - 2.45))).toFixed(1)}px rgba(255,125,156,0.7)` : 'none';
      put(A.val, X0, 568 + exy, { ax: 0, s: sv, o: seg(t, 1.35, 1.5) * exo, b: exb });
      A.val.style.transformOrigin = '0 60%';
    } else hide(A.val);
  }

  // ═════════ 장면 B (3~7초) 질문 폭풍 → 소용돌이 ═════════
  const QS = [
    { text: '작년에 뭘 지적받았지?', c: 'find', x: 580, y: 318, t0: 3.1 },
    { text: '또 나온 지적인가?', c: 'rec', x: 1330, y: 520, t0: 3.6, r: true },
    { text: '답변 때 뭘 약속했더라?', c: 'prom', x: 720, y: 770, t0: 4.1 },
  ];
  const ECHO = [[330, 150], [1540, 200], [1660, 790], [230, 560], [1250, 930], [1180, 318], [960, 108], [360, 965]];
  const bubbles = [];
  QS.forEach((q, i) => {
    const e = el('bub' + (q.r ? ' r' : ''), stage, q.text);
    e.style.borderColor = rgba(C[q.c], 0.9);
    e.style.boxShadow = `0 30px 70px rgba(0,0,0,.55), 0 0 44px ${rgba(C[q.c], 0.18)}`;
    bubbles.push({ e, x: q.x, y: q.y, t0: q.t0, dly: 0.26 + i * 0.05, seed: i, main: true });
  });
  ECHO.forEach(([x, y], k) => {
    const q = QS[k % 3];
    const e = el('bub sm' + (x > 960 ? ' r' : ''), stage, q.text);
    e.style.borderColor = rgba(C[q.c], 0.45);
    bubbles.push({ e, x, y, t0: 4.55 + k * 0.085, dly: k * 0.028, seed: 3 + k, main: false });
  });
  const CX = 960, CY = 540;
  function sceneB(t) {
    for (const b of bubbles) {
      if (t < b.t0 || t > 7) { hide(b.e); continue; }
      const u = t - b.t0;
      let x = b.x + Math.cos(t * 1.3 + b.seed) * 5, y = b.y + Math.sin(t * 1.7 + b.seed * 1.3) * 6;
      y += 26 * (1 - E.outX(seg(u, 0, 0.5)));
      let s = lerp(0.35, 1, spring(u, 2.3, 0.42));
      let o = seg(u, 0, 0.09) * (b.main ? 1 : 0.8), bl = 8 * (1 - seg(u, 0, 0.16)), r = 0;
      // 소용돌이
      const p = E.inC(seg(t, 5.35 + b.dly, 6.85));
      if (p > 0) {
        const dx = x - CX, dy = y - CY, r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
        const rr = r0 * (1 - p), a = a0 + p * p * 5.4;
        x = CX + rr * Math.cos(a); y = CY + rr * Math.sin(a);
        s *= 1 - 0.9 * p; r = p * p * 140; bl += p * 9; o *= 1 - seg(p, 0.72, 1);
      }
      put(b.e, x, y, { s, o, b: bl, r });
    }
  }
  // 소용돌이 줄무늬 → 레이더 고리로 바뀜
  const swirl = (() => {
    const R = rng(23), out = [];
    for (let k = 0; k < 200; k++) {
      out.push({ r0: 260 + R() * 900, a0: R() * Math.PI * 2, d: R() * 0.5, ring: k % 4, w: 1 + R() * 2.2,
        c: [C.find, C.rec, C.prom, C.exec, C.ink][k % 5], len: 0.18 + R() * 0.3 });
    }
    return out;
  })();
  const R0 = 310, C0 = [960, 450];
  function drawSwirl(t) {
    if (t < 5.05 || t > 8.1) return;
    const morph = E.outX(seg(t, 6.9, 7.75));
    const cx = lerp(CX, C0[0], E.ioC(seg(t, 6.85, 7.5))), cy = lerp(CY, C0[1], E.ioC(seg(t, 6.85, 7.5)));
    fx.save();
    fx.lineCap = 'round';
    for (const p of swirl) {
      const q = seg(t, 5.05 + p.d, 6.9);
      const qe = Math.pow(q, 1.6);
      const rv = 6 + (p.r0 - 6) * Math.pow(1 - qe, 2.1);
      let a = p.a0 + 0.9 * t + 7.5 * qe * qe;
      let r = rv, len = p.len + 0.9 * qe;
      if (t > 6.9) {
        const ringR = R0 * (p.ring + 1) / 4;
        r = lerp(6, ringR, morph);
        a = p.a0 + 0.9 * 6.9 + 7.5 + 3.2 * (1 - Math.exp(-4 * (t - 6.9)));
        len = lerp(1.2, (Math.PI * 2) / 50 + 0.04, morph);
      }
      const alpha = seg(t, 5.05 + p.d, 5.45 + p.d) * (1 - seg(t, 7.45, 8.05)) * (t > 6.9 ? 0.9 : 0.55 + 0.4 * qe);
      if (alpha <= 0) continue;
      fx.strokeStyle = rgba(p.c, alpha);
      fx.lineWidth = p.w * (t > 6.9 ? 1 : 1 - 0.4 * qe);
      fx.beginPath(); fx.arc(cx, cy, Math.max(0.5, r), a - len, a); fx.stroke();
    }
    // 모임점 번쩍임
    const fl = Math.exp(-Math.pow((t - 6.92) / 0.12, 2));
    if (fl > 0.01) {
      const g = fx.createRadialGradient(cx, cy, 0, cx, cy, 260);
      g.addColorStop(0, `rgba(220,235,255,${0.75 * fl})`); g.addColorStop(1, 'rgba(220,235,255,0)');
      fx.fillStyle = g; fx.fillRect(cx - 260, cy - 260, 520, 520);
    }
    fx.restore();
  }

  // ═════════ 레이더 (7초~ 로고, 11~27초 모서리 표식, 27초~ 끝 화면에서 멈춤) ═════════
  const CK = [100, 98], RK = 34;
  function radarGeo(t) {
    let cx = C0[0], cy = C0[1], R = R0;
    if (t > 10.9 && t < 27.7) {
      const p = t < 20 ? E.ioC(seg(t, 10.9, 11.6)) : 1 - E.ioC(seg(t, 26.8, 27.7));
      cx = lerp(C0[0], CK[0], p); cy = lerp(C0[1], CK[1], p); R = lerp(R0, RK, p);
    }
    if (t >= 27.7) R = R0 * (1 + 0.03 * E.outQ(seg(t, 27.7, 30)));
    return { cx, cy, R };
  }
  const W0 = (2 * Math.PI) / 1.4, T1 = 7.5, T2 = 7.9, STOP_D = 1.6, STOP_ANG = -0.9;   // 멈출 때 행감 파랑 점을 가리킨다
  // 감속 시작(T3)을 27.0초에서 한 바퀴(1.4초) 안쪽으로 당겨, 멈춘 쓸기 선이 STOP_ANG 에 오게 한다
  const T3 = (() => {
    const fin = Math.PI + (W0 * (T2 - T1)) / 2 + W0 * (27.0 - T2) + (W0 * STOP_D) / 2;
    const over = (((fin - STOP_ANG) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return 27.0 - over / W0;
  })();
  const T4 = T3 + STOP_D;
  function theta(t) {
    const base = Math.PI;
    if (t <= T1) return base;
    if (t <= T2) { const u = t - T1; return base + (W0 * u * u) / (2 * (T2 - T1)); }
    const a2 = (W0 * (T2 - T1)) / 2;
    if (t <= T3) return base + a2 + W0 * (t - T2);
    const a3 = a2 + W0 * (T3 - T2), D = T4 - T3, u = Math.min(t - T3, D);
    return base + a3 + W0 * (u - (u * u) / (2 * D));
  }
  const BLIPS = [[-0.9, 0.72, C.find], [-2.35, 0.8, C.rec], [0.75, 0.78, C.prom], [2.45, 0.7, C.exec]];
  function drawRadar(t) {
    if (t < 6.95) return;
    const { cx, cy, R } = radarGeo(t);
    const k = R / R0;
    const big = R > 120;
    fx.save();
    // 고리(그려지며 나타남)
    for (let i = 0; i < 4; i++) {
      const rp = E.outX(seg(t, 7.0 + i * 0.08, 7.85 + i * 0.08));
      if (rp <= 0) continue;
      fx.strokeStyle = i === 3 ? 'rgba(190,215,255,0.34)' : 'rgba(190,215,255,0.15)';
      fx.lineWidth = Math.max(1, (i === 3 ? 2 : 1.4) * Math.sqrt(k));
      fx.beginPath(); fx.arc(cx, cy, (R * (i + 1)) / 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rp); fx.stroke();
    }
    const rp = E.outX(seg(t, 7.1, 7.9));
    fx.strokeStyle = `rgba(190,215,255,${0.08 * rp})`;
    fx.lineWidth = 1;
    fx.beginPath(); fx.moveTo(cx - R * rp, cy); fx.lineTo(cx + R * rp, cy); fx.moveTo(cx, cy - R * rp); fx.lineTo(cx, cy + R * rp); fx.stroke();
    if (big) {
      fx.strokeStyle = `rgba(190,215,255,${0.28 * rp * seg(R, 120, 250)})`;
      for (let d = 0; d < 72; d++) {
        const a = (d / 72) * Math.PI * 2, l = d % 6 === 0 ? 14 : 6;
        fx.beginPath(); fx.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
        fx.lineTo(cx + Math.cos(a) * (R + 6 + l), cy + Math.sin(a) * (R + 6 + l)); fx.stroke();
      }
    }
    // 쓸기(부채꼴 잔광 + 앞선)
    const th = theta(t);
    const sa = seg(t, 7.45, 7.7) * (t > T4 ? lerp(1, 0.55, seg(t, T4, T4 + 0.8)) : 1);
    if (sa > 0) {
      const N = 30, span = 1.15;
      for (let i = 0; i < N; i++) {
        const a0 = th - span + (span * i) / N, a1 = a0 + span / N + 0.004;
        fx.fillStyle = `rgba(110,168,255,${(0.24 * Math.pow((i + 1) / N, 2.2) * sa).toFixed(4)})`;
        fx.beginPath(); fx.moveTo(cx, cy); fx.arc(cx, cy, R, a0, a1); fx.closePath(); fx.fill();
      }
      fx.shadowColor = 'rgba(140,190,255,0.9)'; fx.shadowBlur = 14 * k + 2;
      fx.strokeStyle = `rgba(200,225,255,${0.95 * sa})`;
      fx.lineWidth = Math.max(1.2, 2.6 * Math.sqrt(k));
      fx.beginPath(); fx.moveTo(cx, cy); fx.lineTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R); fx.stroke();
      fx.shadowBlur = 0;
    }
    // 점(분류색) — 쓸고 지나가면 밝아진다
    const bOn = seg(t, 7.9, 8.7);
    if (bOn > 0) {
      for (const [ang, rf, c] of BLIPS) {
        let d = (th - ang) % (Math.PI * 2); if (d < 0) d += Math.PI * 2;
        const glow = t > T4 ? (ang === STOP_ANG ? 0.9 + 0.1 * Math.sin(t * 4) : 0.5 + 0.15 * Math.sin(t * 3 + ang)) : 0.25 + 0.75 * Math.exp(-d * 1.3);
        const x = cx + Math.cos(ang) * R * rf, y = cy + Math.sin(ang) * R * rf;
        const g = fx.createRadialGradient(x, y, 0, x, y, 34 * k + 4);
        g.addColorStop(0, rgba(c, 0.6 * glow * bOn)); g.addColorStop(1, rgba(c, 0));
        fx.fillStyle = g; fx.fillRect(x - 40 * k - 4, y - 40 * k - 4, 80 * k + 8, 80 * k + 8);
        fx.fillStyle = rgba(c, (0.5 + 0.5 * glow) * bOn);
        fx.beginPath(); fx.arc(x, y, Math.max(1.5, 6 * k), 0, Math.PI * 2); fx.fill();
      }
    }
    // 로고 뒤 어둠(글자 대비)
    const halo = big ? 1 : 0;
    if (halo) {
      fx.save(); fx.translate(cx, cy); fx.scale(1.45, 0.55);
      const g = fx.createRadialGradient(0, 0, 0, 0, 0, R * 0.78);
      g.addColorStop(0, 'rgba(9,9,11,0.88)'); g.addColorStop(0.6, 'rgba(9,9,11,0.6)'); g.addColorStop(1, 'rgba(9,9,11,0)');
      fx.fillStyle = g; fx.fillRect(-R, -R, 2 * R, 2 * R);
      fx.restore();
    }
    fx.restore();
  }

  // ═════════ 장면 C (7~11초) 로고 + 새 문구, 끝 화면(27~30초)에서 다시 씀 ═════════
  const Cn = {};
  Cn.logo = el('logo', stage, [...M.brand].map(ch => (ch === ' ' ? '<span class="sp"></span>' : `<span>${ch}</span>`)).join(''));
  Cn.chars = [...Cn.logo.children];
  Cn.tag = el('tag', stage, M.tagline.split(' ').map(w => `<span>${w}</span>`).join(''));
  Cn.words = [...Cn.tag.children];
  Cn.mark = el('mark-lab', stage, M.brand);
  Cn.credit = el('credit', stage, M.credit);
  function charP(t, i, n) {
    if (t < 20) {
      const rel = theta(t) - Math.PI;
      const a = 0.3 + (i / Math.max(1, n - 1)) * 2.3;
      return seg(rel, a, a + 1.5);
    }
    return seg(t, 27.5 + i * 0.07, 28.05 + i * 0.07);
  }
  function sceneC(t) {
    const on = (t > 7.4 && t < 11.4) || t > 27.45;
    const { cx, cy, R } = radarGeo(t);
    if (!on) { hide(Cn.logo); } else {
      const n = Cn.chars.length;
      Cn.chars.forEach((c, i) => {
        const p = E.outC(charP(t, i, n));
        c.style.transform = `translateY(${(38 * (1 - p)).toFixed(2)}px) scale(${(1.14 - 0.14 * p).toFixed(4)})`;
        c.style.opacity = E.outQ(p).toFixed(4);
        c.style.filter = p < 0.99 ? `blur(${(9 * (1 - p)).toFixed(2)}px)` : 'none';
        c.style.textShadow = p > 0.35 && p < 1 ? `0 0 ${(18 * (1 - p)).toFixed(1)}px rgba(140,190,255,${(0.7 * (1 - p)).toFixed(3)})` : 'none';
      });
      const o = t < 20 ? 1 - seg(t, 10.9, 11.25) : 1;
      put(Cn.logo, cx, cy + 4 * (R / R0), { s: R / R0, o, b: t < 20 ? 8 * seg(t, 10.9, 11.3) : 0 });
    }
    // 새 문구
    const tagOn = (t > 9 && t < 11.3) || t > 27.8;
    if (!tagOn) hide(Cn.tag); else {
      const t0 = t < 20 ? 9.15 : 27.85;
      Cn.words.forEach((w, i) => {
        const p = E.outX(seg(t, t0 + i * 0.075, t0 + i * 0.075 + 0.65));
        w.style.transform = `translateY(${(22 * (1 - p)).toFixed(2)}px)`;
        w.style.opacity = p.toFixed(4);
        w.style.filter = p < 0.99 ? `blur(${(7 * (1 - p)).toFixed(2)}px)` : 'none';
      });
      const out = t < 20 ? E.inC(seg(t, 10.85, 11.2)) : 0;
      put(Cn.tag, 960, 842 - 22 * out, { o: 1 - out, b: 8 * out });
    }
    // 모서리 표식 글자
    if (t > 11.3 && t < 27.1) {
      const p = E.outX(seg(t, 11.35, 11.85)), q = E.inC(seg(t, 26.7, 27.0));
      put(Cn.mark, 150 + 14 * (1 - p), 98, { ax: 0, o: seg(t, 11.35, 11.6) * (1 - q), b: 5 * (1 - p) + 6 * q });
    } else hide(Cn.mark);
    if (t > 28.25) {
      const p = E.outX(seg(t, 28.3, 29.0));
      put(Cn.credit, 960, 912 + 10 * (1 - p), { o: E.outQ(seg(t, 28.3, 28.9)), b: 4 * (1 - p) });
    } else hide(Cn.credit);
  }

  // ═════════ 장면 D (11~17초) 자료가 모인다: 점 하나 = 자료 하나 ═════════
  const T = M.totals;
  const COLS = 28, P = 8, BASE = 830;
  const bars = [
    { n: T.findings, c: C.find, css: 'var(--find)', lab: '행감 지적', unit: '건', sub: `${T.findingYears[0]}~${T.findingYears[1]}`, st: 11.8, du: 2.3 },
    { n: T.recurring, c: C.rec, css: 'var(--rec)', lab: '되풀이', unit: '줄기', sub: '여러 해에 다시 나온 지적', st: 12.95, du: 0.9 },
    { n: T.promises, c: C.prom, css: 'var(--prom)', lab: '답변 속 약속', unit: '건', sub: '시정질문 답변요지서', st: 13.25, du: 1.45 },
    { n: T.depts, c: C.exec, css: 'var(--exec)', lab: '부서', unit: '곳', sub: `예산 ${T.budgetYears[0]}~${T.budgetYears[1]}`, st: 13.65, du: 1.2 },
  ];
  bars.forEach((b, i) => {
    b.cx = 960 + (i - 1.5) * 400;
    const R = rng(101 + i);
    b.dots = [];
    for (let j = 0; j < b.n; j++) {
      const col = j % COLS, row = Math.floor(j / COLS);
      const tl = b.st + b.du * (j / b.n) + R() * 0.07;
      const F = 0.62 + R() * 0.22;
      b.dots.push({ tx: b.cx - ((COLS - 1) * P) / 2 + col * P, ty: BASE - row * P, tl, ts: tl - F,
        x0: b.cx + (R() - 0.5) * 620, y0: -20 - R() * 240, sp: R() });
    }
    b.firstLand = Math.min(...b.dots.map(d => d.tl));
    b.eLab = el('col-lab', stage, b.lab);
    b.eNum = el('col-num num', stage);
    b.eNum.style.color = b.css;
    b.eSub = el('col-sub', stage, b.sub);
  });
  const D = { h: el('h2', stage, '공개자료가 한곳에 모입니다'), sub: el('h2-sub', stage, '행감 결과보고서 · 시정질문 답변요지서 · 세출 공개자료') };
  function dotPos(d, t) {
    const q = seg(t, d.ts, d.tl);
    let x = lerp(d.x0, d.tx, E.outC(q)), y = lerp(d.y0, d.ty, E.inQ(q));
    if (t > d.tl) y -= 7 * Math.exp(-14 * (t - d.tl)) * Math.abs(Math.sin(22 * (t - d.tl)));
    return [x, y, q];
  }
  function drawDots(t) {
    if (t < 10.6 || t > 17.2) return;
    const ex = E.inC(seg(t, 16.45, 17.0));
    const lineA = E.outX(seg(t, 11.2, 12.0)) * (1 - ex);
    if (lineA > 0) {
      fx.fillStyle = `rgba(255,255,255,${0.16 * lineA})`;
      const w = 1620 * lineA;
      fx.fillRect(960 - w / 2, BASE + 8, w, 1.5);
    }
    const wave = seg(t, 15.55, 16.45);
    const waveX = lerp(80, 1840, E.ioC(wave));
    for (const b of bars) {
      for (const d of b.dots) {
        if (t < d.ts) continue;
        const [x, y0, q] = dotPos(d, t);
        const y = y0 + 70 * ex;
        let a = (q < 1 ? 0.55 + 0.45 * q : 0.95) * (1 - ex) * seg(t, d.ts, d.ts + 0.1);
        if (a <= 0) continue;
        let c = b.c;
        if (wave > 0 && wave < 1 && q >= 1) {
          const w = Math.exp(-Math.pow((x - waveX) / 70, 2));
          c = [lerp(c[0], 255, w * 0.7), lerp(c[1], 255, w * 0.7), lerp(c[2], 255, w * 0.7)];
        }
        if (q < 1) {
          const [px, py] = dotPos(d, t - 0.04);
          fx.strokeStyle = rgba(c, 0.32 * a);
          fx.lineWidth = 3;
          fx.beginPath(); fx.moveTo(px, py + 70 * ex); fx.lineTo(x, y); fx.stroke();
        }
        fx.fillStyle = rgba(c, a);
        fx.beginPath(); fx.arc(x, y, 2.9, 0, Math.PI * 2); fx.fill();
      }
    }
  }
  function sceneD(t) {
    const all = [D.h, D.sub, ...bars.flatMap(b => [b.eLab, b.eNum, b.eSub])];
    if (t < 11.2 || t > 17.1) { all.forEach(hide); return; }
    const ex = E.inC(seg(t, 16.45, 16.95)), exo = 1 - ex, exb = 10 * ex, exy = -26 * ex;
    const hp = E.outX(seg(t, 11.4, 12.1));
    put(D.h, 960, 196 + 26 * (1 - hp) + exy, { o: seg(t, 11.4, 11.65) * exo, b: 8 * (1 - hp) + exb });
    const sp = E.outX(seg(t, 15.2, 15.9));
    put(D.sub, 960, 262 + 14 * (1 - sp) + exy, { o: seg(t, 15.2, 15.45) * exo, b: 6 * (1 - sp) + exb });
    bars.forEach((b, i) => {
      const lp = E.outX(seg(t, 11.7 + i * 0.1, 12.4 + i * 0.1));
      put(b.eLab, b.cx, 874 + 16 * (1 - lp) - exy * 0, { o: seg(t, 11.7 + i * 0.1, 11.95 + i * 0.1) * exo, b: 6 * (1 - lp) + exb });
      let landed = 0;
      for (const d of b.dots) if (d.tl <= t) landed++;
      const np = E.outX(seg(t, b.firstLand - 0.25, b.firstLand + 0.3));
      const done = landed === b.n ? Math.exp(-6 * (t - Math.max(...b.dots.map(d => d.tl)))) : 0;
      setHTML(b.eNum, `${fmt(landed)}<span class="u">${b.unit}</span>`);
      b.eNum.style.textShadow = done > 0.02 ? `0 0 ${(30 * done).toFixed(1)}px ${rgba(b.c, 0.8 * done)}` : 'none';
      put(b.eNum, b.cx, 944 + 14 * (1 - np), { o: seg(t, b.firstLand - 0.25, b.firstLand) * exo, b: 6 * (1 - np) + exb, s: 1 + 0.06 * done });
      const sp2 = E.outX(seg(t, 11.9 + i * 0.1, 12.6 + i * 0.1));
      put(b.eSub, b.cx, 1004 + 10 * (1 - sp2), { o: seg(t, 11.9 + i * 0.1, 12.15 + i * 0.1) * exo, b: 6 * (1 - sp2) + exb });
    });
  }

  // ═════════ 장면 E (17~24초) 실제 사용: 부서 검색 → 카드 → 되풀이 → 프롬프트 복사 → AI 업무비서 ═════════
  const Dp = M.dept;
  const win = el('win', stage);
  win.innerHTML = '<div class="chrome"><b style="left:20px;background:#ff5f57"></b><b style="left:42px;background:#febc2e"></b>' +
    '<b style="left:64px;background:#28c840"></b><div class="fn mono">부서점검표.html</div></div>' +
    `<div class="w-hd"><div class="w-brand">${M.brand}<small>${M.subtitle}</small></div>` +
    '<div class="w-search"><div class="ic"></div><div class="ph">부서 이름을 입력하세요</div><div class="q"></div><div class="caret"></div></div></div>';
  const Wn = {};
  Wn.search = win.querySelector('.w-search');
  Wn.ph = win.querySelector('.ph'); Wn.q = win.querySelector('.q'); Wn.caret = win.querySelector('.caret');
  Wn.drop = el('w-drop', win, `<div class="row">${Dp.name}<span>${Dp.silguk}</span></div>`);
  Wn.empty = el('w-sub', win, '부서를 고르면 지적·되풀이·약속·예산이 한 장에 모입니다');
  Wn.empty.style.color = '#a3a3a3';
  Wn.eb = el('w-eyebrow mono', win, 'DEPARTMENT');
  Wn.title = el('w-title', win, Dp.name);
  Wn.sub = el('w-sub', win, Dp.silguk ? `소속 ${Dp.silguk}` : '');
  const CARD = [
    { t: '행감 지적', v: Dp.findings, u: '건', c: `${T.findingYears[0]}~${T.findingYears[1]}년 행정사무감사`, col: 'var(--l-find)' },
    { t: '되풀이 지적', v: Dp.recurring, u: '줄기', c: '여러 해에 비슷한 지적', col: 'var(--l-rec)' },
    { t: '답변 속 약속', v: Dp.promises, u: '건', c: '부서 추정 — 확인 필요', col: 'var(--l-prom)' },
    { t: '집행률', v: Dp.execRate, u: '%', c: Dp.execYear ? `${Dp.execYear}년 결산 기준` : '결산 자료 없음', col: 'var(--l-exec)', dec: 1 },
  ];
  Wn.cards = CARD.map(cd => {
    const e = el('card', win, `<div class="t">${cd.t}</div><div class="v num"></div><div class="c">${cd.c}</div>`);
    e.style.borderLeftColor = cd.col;
    e.querySelector('.v').style.color = cd.col;
    return { e, v: e.querySelector('.v'), cd };
  });
  Wn.left = el('panel', win); Wn.left.style.width = '830px'; Wn.left.style.height = '312px';
  Wn.right = el('panel', win); Wn.right.style.width = '514px'; Wn.right.style.height = '312px';
  Wn.lEb = el('p-eyebrow mono', Wn.left, 'RECURRING'); Wn.lEb.style.color = 'var(--l-rec)';
  Wn.lTi = el('p-title', Wn.left, '되풀이 지적');
  const chain = Dp.chains[0] || { years: [], title: '' };
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  Wn.chips = chain.years.map(y => el('chip num', Wn.left, String(y)));
  Wn.arrows = chain.years.slice(1).map(() => el('arrow', Wn.left));
  Wn.cTitle = el('r-title', Wn.left, clip(chain.title, 34));
  Wn.more = Dp.chains.slice(1, 3).map(ch => {
    const row = el('', Wn.left, '');
    row.innerHTML = '<div style="display:flex;align-items:center;gap:10px">' + ch.years.map(y => `<span class="chip sm num" style="position:static">${y}</span>`).join('<span style="color:var(--l-rec);font-size:18px">→</span>') +
      `<span class="r-title sm" style="margin-left:8px">${clip(ch.title, 30)}</span></div>`;
    return row;
  });
  Wn.rEb = el('p-eyebrow mono', Wn.right, 'PROMPT'); Wn.rEb.style.color = 'var(--l-prom)';
  Wn.rTi = el('p-title', Wn.right, 'AI 업무비서에 붙여 넣을 프롬프트');
  Wn.seg = el('seg', Wn.right, '<span class="on">행감 대비</span><span>업무보고 대비</span><span>답변서 초안</span>');
  Wn.pv = el('pv', Wn.right, '<i style="top:16px;width:400px"></i><i style="top:36px;width:350px"></i><i style="top:56px;width:250px"></i>');
  Wn.pv.style.width = '458px'; Wn.pv.style.height = '80px';
  Wn.btn = el('btn', Wn.right, '프롬프트 복사');
  Wn.btn2 = el('btn', Wn.right, '<span class="ck">✓</span>복사했습니다');
  Wn.btn2.style.background = 'var(--l-ok)';
  Wn.btn.style.width = Wn.btn2.style.width = '458px';
  Wn.btn.style.height = Wn.btn2.style.height = '58px';
  const cursor = el('cursor', stage, '<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 32 L11 25 L16.5 37 L22 34.5 L16.6 23 L27 23 Z" fill="#fff" stroke="#111" stroke-width="2.2" stroke-linejoin="round"/></svg>');
  const ripple = el('ripple', stage);
  const fly = [0, 1, 2, 3, 4].map(() => el('fly', stage, '<b>프롬프트</b><i style="top:50px;width:110px"></i><i style="top:70px;width:96px"></i><i style="top:90px;width:114px"></i><i style="top:110px;width:80px"></i><i style="top:130px;width:104px"></i><i style="top:150px;width:70px"></i>'));
  const ai = el('ai', stage, '<svg width="80" height="80" viewBox="0 0 80 80"><path d="M40 6 C43 26 54 37 74 40 C54 43 43 54 40 74 C37 54 26 43 6 40 C26 37 37 26 40 6 Z" fill="#fff"/><circle cx="64" cy="16" r="6" fill="#fff" opacity=".8"/></svg>');
  const aiLab = el('ai-lab', stage, 'AI 업무비서');
  const pulses = [0, 1].map(() => el('pulse', stage));
  const aiCk = el('', stage, '<div style="width:46px;height:46px;border-radius:50%;background:#177a36;border:3px solid #09090b;color:#fff;font-size:24px;font-weight:900;line-height:40px;text-align:center">✓</div>');
  // 한글 입력처럼 자모가 붙어 가는 순서(ㅈ → 주 → 주ㅌ → …)를 부서 이름에서 만든다
  const TYPING = (() => {
    const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', out = [];
    let done = '';
    for (const ch of Dp.name) {
      const c = ch.charCodeAt(0) - 0xAC00;
      if (c < 0 || c > 11171) { done += ch; out.push(done); continue; }
      const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28);
      out.push(done + CHO[cho]);
      out.push(done + String.fromCharCode(0xAC00 + cho * 588 + jung * 28));
      if (c % 28) out.push(done + ch);
      done += ch;
    }
    return out;
  })();
  const WIN_W = 1440, WIN_H = 840;
  let LAY = null;   // 글꼴을 읽은 뒤 잰 칩 너비

  function cam(t) {
    let x = 960, y = 565, s = 1, rx = 0, o = 1, b = 0;
    const pin = seg(t, 16.75, 17.6);
    y += 170 * (1 - E.outX(pin)); rx = 22 * (1 - E.outC(pin)); s = lerp(0.86, 1, E.outX(pin)); o = seg(t, 16.75, 17.05); b = 10 * (1 - E.outX(seg(t, 16.75, 17.3)));
    const z = E.ioC(seg(t, 20.1, 21.0)) * (1 - E.ioC(seg(t, 21.5, 22.3)));
    s *= 1 + 0.07 * z; x += 144 * z; y -= 124 * z;
    const m = E.ioC(seg(t, 21.5, 22.3));
    s *= lerp(1, 0.88, m); x += -190 * m;
    const ex = E.inC(seg(t, 23.9, 24.35));
    s *= 1 - 0.14 * ex; o *= 1 - ex; b += 12 * ex;
    return { x, y, s, rx, o, b };
  }
  const toStage = (c, wx, wy) => [c.x + (wx - WIN_W / 2) * c.s, c.y + (wy - WIN_H / 2) * c.s];
  // 요소 위치(창 좌표, 왼쪽 위 기준)
  const PAN_L = [36, 496], PAN_R = [890, 496], BTN = [PAN_R[0] + 28 + 229, PAN_R[1] + 236 + 29];
  const SEARCH = [820 + 300, 46 + 18 + 26], ROW = [820 + 290, 124 + 8 + 28];

  function sceneE(t) {
    const parts = [win, cursor, ripple, ai, aiLab, aiCk, ...fly, ...pulses];
    if (t < 16.7 || t > 24.4) { parts.forEach(hide); return; }
    const c = cam(t);
    put(win, c.x, c.y, { s: c.s, o: c.o, b: c.b, pre: `perspective(1800px) rotateX(${c.rx.toFixed(3)}deg)` });
    // 검색창
    const typeSeq = TYPING;
    const ti = Math.floor((t - 18.2) / 0.085);
    const q = t < 18.2 ? '' : typeSeq[Math.min(typeSeq.length - 1, ti)];
    setHTML(Wn.q, q);
    Wn.ph.style.opacity = q ? 0 : 1;
    const focus = t > 18.12;
    Wn.search.style.borderColor = focus ? '#1b5fc9' : '#d9d9d9';
    Wn.search.style.boxShadow = focus ? `0 0 0 ${(4 * E.outX(seg(t, 18.12, 18.4))).toFixed(2)}px rgba(27,95,201,.18)` : 'none';
    const caretOn = focus && t < 19.25 && (Math.floor((t - 18.12) / 0.5) % 2 === 0 || (t > 18.15 && t < 18.8));
    Wn.caret.style.opacity = caretOn ? 1 : 0;
    Wn.caret.style.left = (54 + Wn.q.offsetWidth + 2) + 'px';
    // 드롭다운
    const dIn = E.outX(seg(t, 18.8, 19.15)), dOut = E.inC(seg(t, 19.22, 19.38));
    put(Wn.drop, 820, 124 + 10 * (1 - dIn), { ax: 0, ay: 0, o: seg(t, 18.8, 18.95) * (1 - dOut) });
    const row = Wn.drop.firstChild;
    row.style.background = t > 19.18 ? '#dce8fc' : '#f0f5fe';
    // 빈 화면 안내
    put(Wn.empty, WIN_W / 2, 470, { o: seg(t, 17.3, 17.6) * (1 - seg(t, 19.15, 19.35)) });
    // 부서 머리
    const hp = i => E.outX(seg(t, 19.3 + i * 0.06, 19.9 + i * 0.06));
    [[Wn.eb, 176], [Wn.title, 222], [Wn.sub, 272]].forEach(([e, y], i) => put(e, 36 + 24 * (1 - hp(i)), y, { ax: 0, o: seg(t, 19.3 + i * 0.06, 19.45 + i * 0.06), b: 6 * (1 - hp(i)) }));
    // 카드 넷
    Wn.cards.forEach((k, i) => {
      const t0 = 19.45 + i * 0.1, u = t - t0;
      const s = lerp(0.8, 1, spring(u, 2.2, 0.5));
      put(k.e, 36 + i * 350, 300 + 30 * (1 - E.outX(seg(u, 0, 0.5))), { ax: 0, ay: 0, s, o: seg(u, 0, 0.12), b: 6 * (1 - seg(u, 0, 0.2)) });
      k.e.style.transformOrigin = '50% 100%';
      const cp = E.outX(seg(u, 0.05, 0.85));
      const v = k.cd.v == null ? '—' : k.cd.dec ? (k.cd.v * cp).toFixed(1) : String(Math.round(k.cd.v * cp));
      setHTML(k.v, `${v}<span class="u">${k.cd.u}</span>`);
    });
    // 되풀이 패널
    const lp = E.outX(seg(t, 19.95, 20.5));
    put(Wn.left, PAN_L[0], PAN_L[1] + 26 * (1 - lp), { ax: 0, ay: 0, o: seg(t, 19.95, 20.15), b: 6 * (1 - lp) });
    put(Wn.lEb, 28, 30, { ax: 0, ay: 0 });
    put(Wn.lTi, 28, 56, { ax: 0, ay: 0 });
    if (LAY) {
      let x = 28;
      Wn.chips.forEach((ch, i) => {
        const t0 = 20.3 + i * 0.3, u = t - t0;
        put(ch, x, 116, { ax: 0, ay: 0, s: lerp(0.5, 1, spring(u, 2.6, 0.45)), o: seg(u, 0, 0.08) });
        ch.style.transformOrigin = '50% 50%';
        const w = LAY.chips[i];
        if (i < Wn.arrows.length) {
          const a = Wn.arrows[i], ap = E.ioC(seg(t, t0 + 0.12, t0 + 0.32));
          a.style.width = '44px';
          put(a, x + w + 10, 137, { ax: 0, ay: -50, sx: ap, sy: 1, o: ap > 0 ? 1 : 0 });
        }
        x += w + 64;
      });
    }
    const tp = E.outX(seg(t, 21.05, 21.6));
    put(Wn.cTitle, 28 + 16 * (1 - tp), 186, { ax: 0, ay: 0, o: seg(t, 21.05, 21.25), b: 5 * (1 - tp) });
    Wn.more.forEach((r, i) => {
      const p = E.outX(seg(t, 21.3 + i * 0.12, 21.8 + i * 0.12));
      put(r, 28, 232 + i * 36 + 10 * (1 - p), { ax: 0, ay: 0, o: seg(t, 21.3 + i * 0.12, 21.45 + i * 0.12) * 0.95 });
    });
    // 프롬프트 패널
    const rp = E.outX(seg(t, 20.1, 20.65));
    put(Wn.right, PAN_R[0], PAN_R[1] + 26 * (1 - rp), { ax: 0, ay: 0, o: seg(t, 20.1, 20.3), b: 6 * (1 - rp) });
    put(Wn.rEb, 28, 30, { ax: 0, ay: 0 });
    put(Wn.rTi, 28, 56, { ax: 0, ay: 0 });
    put(Wn.seg, 28, 106, { ax: 0, ay: 0 });
    put(Wn.pv, 28, 146, { ax: 0, ay: 0 });
    const press = t > 22.45 && t < 22.62 ? 0.955 : 1;
    const sw = E.ioC(seg(t, 22.55, 22.72));
    put(Wn.btn, 28, 236, { ax: 0, ay: 0, s: press, o: 1 - sw });
    put(Wn.btn2, 28, 236, { ax: 0, ay: 0, s: press * lerp(0.96, 1, spring(t - 22.55, 3, 0.5)), o: sw });
    // AI 업무비서
    const AIX = 1690, AIY = 540;
    const au = t - 22.05;
    const arrive = t - 23.5;
    let as = lerp(0.4, 1, spring(au, 2.2, 0.5));
    if (arrive > 0) as *= 1 + 0.13 * Math.exp(-6 * arrive) * Math.sin(17 * arrive);
    const aex = E.inC(seg(t, 23.95, 24.35));
    put(ai, AIX, AIY, { s: as * (1 - 0.1 * aex), o: seg(au, 0, 0.12) * (1 - aex), b: 8 * (1 - seg(au, 0, 0.2)) + 10 * aex });
    const lpA = E.outX(seg(t, 22.2, 22.7));
    put(aiLab, AIX, 650 + 14 * (1 - lpA), { o: seg(t, 22.2, 22.4) * (1 - aex), b: 6 * (1 - lpA) + 10 * aex });
    pulses.forEach((pe, i) => {
      const u = arrive - i * 0.16;
      if (u < 0 || u > 0.8) { hide(pe); return; }
      put(pe, AIX, AIY, { s: 1 + 0.9 * E.outC(u / 0.8), o: 0.85 * (1 - u / 0.8) });
    });
    put(aiCk, AIX + 58, AIY - 58, { s: lerp(0.2, 1, spring(t - 23.62, 2.8, 0.45)), o: seg(t, 23.62, 23.7) * (1 - aex) });
    // 날아가는 프롬프트
    const [bx, by] = toStage(c, PAN_R[0] + BTN[0] - PAN_R[0], BTN[1]);
    const flyAt = tt => {
      const p = E.ioC(seg(tt, 22.72, 23.5));
      const cxp = (bx + AIX) / 2 + 40, cyp = Math.min(by, AIY) - 300;
      const x = (1 - p) * (1 - p) * bx + 2 * (1 - p) * p * cxp + p * p * AIX;
      const y = (1 - p) * (1 - p) * by + 2 * (1 - p) * p * cyp + p * p * AIY;
      const s = lerp(0.25, 0.62, spring(tt - 22.72, 2.4, 0.5)) * (1 - 0.6 * E.inC(p));
      const r = Math.sin(p * Math.PI) * 14 - 6 * (1 - p);
      return { x, y, s, r, p };
    };
    fly.forEach((f, k) => {
      const tt = t - k * 0.028;
      if (tt < 22.72 || t > 23.56) { hide(f); return; }
      const st = flyAt(tt);
      const o = (k === 0 ? 1 : 0.13 / k) * (1 - seg(st.p, 0.93, 1)) * seg(tt, 22.72, 22.78);
      put(f, st.x, st.y, { s: st.s, r: st.r, o, b: k ? 3 + k : 0 });
    });
    // 가짜 커서
    let cp = null, click = -1;
    const S0 = toStage(c, ...SEARCH), R1 = toStage(c, ...ROW), B1 = toStage(c, ...BTN);
    if (t >= 17.65 && t < 20.05) {
      const m1 = E.ioC(seg(t, 17.7, 18.1)), m2 = E.ioC(seg(t, 18.85, 19.15)), m3 = E.ioC(seg(t, 19.35, 19.95));
      let x = lerp(1560, S0[0], m1), y = lerp(1000, S0[1], m1);
      x = lerp(x, R1[0], m2); y = lerp(y, R1[1], m2);
      x = lerp(x, 1580, m3); y = lerp(y, 1040, m3);
      cp = [x, y, seg(t, 17.65, 17.8) * (1 - seg(t, 19.75, 20.0))];
      if (t < 18.9) click = 18.12; else click = 19.2;
    } else if (t >= 21.6 && t < 23.2) {
      const m = E.ioC(seg(t, 21.75, 22.38)), dr = E.ioC(seg(t, 22.62, 23.1));
      cp = [lerp(1500, B1[0], m) + 150 * dr, lerp(1010, B1[1], m) + 90 * dr, seg(t, 21.6, 21.75) * (1 - seg(t, 22.95, 23.2))];
      click = 22.45;
    }
    if (cp && cp[2] > 0) {
      const pr = click > 0 && t > click && t < click + 0.12 ? 0.86 : 1;
      put(cursor, cp[0], cp[1], { ax: -9, ay: -5, o: cp[2], s: pr });
    } else hide(cursor);
    const ru = click > 0 ? t - click : -1;
    if (ru >= 0 && ru < 0.45 && cp) put(ripple, cp[0], cp[1], { s: 0.3 + 1.2 * E.outC(ru / 0.45), o: 0.9 * (1 - ru / 0.45) });
    else hide(ripple);
  }

  // ═════════ 장면 F (24~27초) 결과: 2~3일 → 약 2분, 세 줄 도장 ═════════
  const F = {};
  F.eb = el('res-eb', stage, '자료 찾기');
  F.wrap = el('', stage); F.wrap.style.width = '900px'; F.wrap.style.height = '300px';
  const SH_W = 900, SH_H = 300, IMP = [520, 150];
  F.shards = (() => {
    const R = rng(77), cols = 6, rows = 3, pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      pts.push([(i * SH_W) / cols + (edge ? 0 : (R() - 0.5) * 90), (j * SH_H) / rows + (edge ? 0 : (R() - 0.5) * 60)]);
    }
    const P_ = (i, j) => pts[j * (cols + 1) + i];
    const tris = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = P_(i, j), b = P_(i + 1, j), c = P_(i + 1, j + 1), d = P_(i, j + 1);
      if ((i + j) % 2) { tris.push([a, b, c], [a, c, d]); } else { tris.push([a, b, d], [b, c, d]); }
    }
    return tris.map(tr => {
      const e = el('shard', F.wrap, '<span class="num">2~3</span><span class="u">일</span>');
      e.style.clipPath = `polygon(${tr.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`;
      const cx = (tr[0][0] + tr[1][0] + tr[2][0]) / 3, cy = (tr[0][1] + tr[1][1] + tr[2][1]) / 3;
      let dx = cx - IMP[0], dy = cy - IMP[1];
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const v = 650 + R() * 900;
      return { e, vx: dx * v, vy: dy * v - 380, w: (R() - 0.5) * 540, z: (R() - 0.35) * 1.3, tr };
    });
  })();
  F.after = el('after num', stage, '<span class="pre">약</span><span class="n">2</span><span class="u">분</span>');
  F.pill = el('pill mono', stage, '시연 측정');
  F.stamps = ['공개자료만', '설치 없이 HTML 한 장', '첨부 파일은 브라우저 밖으로 나가지 않음'].map(s => el('stamp', stage, `<span class="ck"></span><span>${s}</span>`));
  const TS = 24.85;
  function sceneF(t) {
    const all = [F.eb, F.wrap, F.after, F.pill, ...F.stamps];
    if (t < 24.05 || t > 27.3) { all.forEach(hide); return; }
    const ex = E.inC(seg(t, 26.85, 27.2)), exo = 1 - ex, exb = 12 * ex, exy = -24 * ex;
    const ep = E.outX(seg(t, 24.1, 24.6));
    put(F.eb, 960, 290 + 16 * (1 - ep) + exy, { o: seg(t, 24.1, 24.3) * exo, b: 6 * (1 - ep) + exb });
    // 2~3일 등장 → 금 → 산산이
    const u = t - 24.15;
    const shake = t > 24.6 && t < TS ? Math.sin(t * 95) * 5 * seg(t, 24.6, TS) : 0;
    put(F.wrap, 960 + shake, 470, { s: lerp(0.75, 1, spring(u, 2.2, 0.5)), o: seg(u, 0, 0.1), b: 10 * (1 - seg(u, 0, 0.2)) });
    const cr = E.outX(seg(t, 24.58, 24.8));
    for (const s of F.shards) {
      const d = t - TS;
      s.e.style.display = '';
      if (d <= 0) {
        // 금: 조각이 충격점에서 몇 px 벌어진다(글자에 금이 간다)
        const gap = 4 * cr;
        s.e.style.transform = `translate(${(s.vx / 1500 * gap).toFixed(2)}px,${((s.vy + 380) / 1500 * gap).toFixed(2)}px)`;
        s.e.style.opacity = 1; s.e.style.filter = 'none'; continue;
      }
      const x = s.vx * d, y = s.vy * d + 1500 * d * d, r = s.w * d, sc = 1 + s.z * d;
      s.e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      s.e.style.opacity = (1 - seg(d, 0.18, 0.55)).toFixed(3);
      s.e.style.filter = `blur(${(4 * seg(d, 0, 0.35)).toFixed(2)}px)`;
    }
    // 약 2분
    const au = t - 25.0;
    if (au > 0) {
      put(F.after, 960, 470 + exy, { s: lerp(0.6, 1, spring(au, 2.1, 0.5)), o: seg(au, 0, 0.12) * exo, b: 10 * (1 - seg(au, 0, 0.22)) + exb });
      F.after.style.textShadow = `0 0 ${(50 * Math.exp(-2.5 * au)).toFixed(1)}px rgba(63,208,182,0.55)`;
    } else hide(F.after);
    const pp = E.outX(seg(t, 25.3, 25.8));
    put(F.pill, 960, 620 + 12 * (1 - pp) + exy, { o: seg(t, 25.3, 25.5) * exo, b: 5 * (1 - pp) + exb });
    // 도장 세 줄
    F.stamps.forEach((e, i) => {
      const su = t - (25.62 + i * 0.34);
      if (su < 0) { hide(e); return; }
      const s = lerp(1.55, 1, E.outX(seg(su, 0, 0.24)));
      const jolt = 4 * Math.exp(-18 * su) * Math.sin(55 * su);
      put(e, 960 + jolt, 728 + i * 76 + exy, { s, o: seg(su, 0, 0.07) * exo, b: 3 * (1 - seg(su, 0, 0.12)) + exb });
    });
  }
  function drawFlash(t) {
    const d = t - TS;
    if (d < 0 || d > 0.6) return;
    const a = Math.exp(-9 * d) * 0.3;
    const x = 960 - SH_W / 2 + IMP[0], y = 470 - SH_H / 2 + IMP[1];
    const g = fx.createRadialGradient(x, y, 0, x, y, 380);
    g.addColorStop(0, `rgba(255,150,180,${a})`); g.addColorStop(1, 'rgba(255,150,180,0)');
    fx.fillStyle = g; fx.fillRect(0, 0, W, H);
  }

  // ───────── 결(grain) — 맨 위 ─────────
  const gr = canvas('grain');
  const noise = [0, 1, 2].map(k => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), im = g.createImageData(256, 256), R = rng(300 + k);
    for (let i = 0; i < im.data.length; i += 4) { const v = (R() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    return gr.createPattern(c, 'repeat');
  });
  function drawGrain(t) {
    const f = Math.round(t * 60);
    gr.clearRect(0, 0, W, H);
    gr.save();
    gr.globalAlpha = 0.085;
    gr.translate(-((f * 37) % 256), -((f * 91) % 256));
    gr.fillStyle = noise[f % 3]; gr.fillRect(0, 0, W + 256, H + 256);
    gr.restore();
  }

  function seek(t) {
    t = clamp(t, 0, DUR);
    drawBg(t);
    fx.clearRect(0, 0, W, H);
    if (t < 3.4) drawDocs(t);
    drawSwirl(t);
    drawRadar(t);
    drawDots(t);
    drawFlash(t);
    sceneA(t); sceneB(t); sceneC(t); sceneD(t); sceneE(t); sceneF(t);
    drawGrain(t);
    return t;
  }

  async function ready() {
    await document.fonts.ready;
    await Promise.all(['800 136px KR', '700 56px KR', '500 44px KR', '700 78px Geist', '400 22px "Geist Mono"']
      .map(f => document.fonts.load(f, '질문예보가0123456789').catch(() => null)));
    // 칩 너비를 잰다(화살표 자리)
    const tmp = [win, Wn.left, ...Wn.chips];
    tmp.forEach(e => { e.style.display = ''; e.style.visibility = 'hidden'; });
    LAY = { chips: Wn.chips.map(c => c.offsetWidth) };
    tmp.forEach(e => { e.style.display = 'none'; e.style.visibility = ''; });
    window.SCENE_FONTS = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight);
    seek(0);
    window.SCENE_READY = true;
  }
  window.seek = seek;
  window.SCENE_DUR = DUR;
  ready();
})();
