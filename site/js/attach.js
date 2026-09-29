// 역할: 사용자가 넣은 처리결과 문서(kordoc 이 마크다운으로 바꾼 것)나 견본 CSV 에서 조치 줄을 뽑아
// 공개 지적과 짝을 지어 「제안」한다. 반영은 사람이 확인한 것만 한다(spec §3.2).
// 앞선 점검 도구(비공개)의 cells()·DONE 규칙을 JS 로 옮겼다.
(function (root) {
  const STATUSES = ['완료', '추진중', '장기검토', '미조치', '계속추진', '기타'];
  const DONE = /^(완료|추진중|장기검토|미조치|계속추진|기타)$/;
  const CSV_HEAD = ['연도', '위원회', '부서', '지적번호', '지적제목', '조치상태', '조치내용'];

  const clean = s => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

  function tableRows(md) {
    const rows = [];
    for (const line of md.split('\n')) {
      if (/<tr/i.test(line)) {
        for (const tr of line.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [])
          rows.push((tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(clean));
      } else if (line.trim().startsWith('|')) {
        const c = line.trim().replace(/^\||\|$/g, '').split('|').map(clean);
        if (c.every(x => /^:?-{3,}:?$/.test(x) || x === '')) continue;
        rows.push(c);
      }
    }
    return rows;
  }

  function extractActions(rows) {
    // 총괄 문서는 요약표·상세표가 같은 줄을 반복해 싣는 경우가 있다(실물 확인 2026-09-26에서
    // 조치 줄이 공개 지적의 약 1.9배로 나와 확인함) — (연번,제목,상태,부서) 가 같으면 처음 것만
    // 남긴다. 몇 줄을 걸렀는지는 반환 배열의 `duplicates` 속성으로 알린다(화면에서 「중복 N줄
    // 제외」로 보이도록).
    const out = [];
    const seen = new Set();
    let duplicates = 0;
    for (const c of rows) {
      const di = c.findIndex(v => DONE.test(v.replace(/\s/g, '')));
      if (di <= 0) continue;
      const titleCells = c.slice(0, di).filter(v => !/^\d+$/.test(v));
      const title = titleCells.sort((a, b) => b.length - a.length)[0] || '';
      if (title.length < 6) continue;
      const no = /^\d+$/.test(c[0]) ? Number(c[0]) : null;
      const headIdx = c.findIndex(v => /^(조치|처리내용)/.test(v));
      const status = c[di].replace(/\s/g, '');
      const dept = c.slice(di + 1).join(' ').trim();
      const key = no + '\u0001' + title + '\u0001' + status + '\u0001' + dept;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      out.push({ no, title, status, dept, text: headIdx >= 0 ? c[headIdx] : '' });
    }
    out.duplicates = duplicates;
    return out;
  }

  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    const t = text.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  function fromCsv(text) {
    const rows = parseCsv(text);
    const h = rows.shift() || [];
    const at = k => h.indexOf(k);
    return rows.map(r => ({
      no: r[at('지적번호')] ? Number(r[at('지적번호')]) : null, title: r[at('지적제목')] || '',
      com: (r[at('위원회')] || '').trim(),
      status: (r[at('조치상태')] || '').replace(/\s/g, ''), dept: r[at('부서')] || '', text: r[at('조치내용')] || '',
      year: r[at('연도')] ? Number(r[at('연도')]) : null,
    })).filter(a => a.title && DONE.test(a.status));
  }

  function guessYear(fileName, md) {
    for (const s of [fileName || '', md || '']) {
      const m = s.match(/(20\d\d)\s*년도/);
      if (m) return Number(m[1]);
    }
    const m = (fileName || '').replace(/\([^)]*\)/g, ' ').match(/20\d\d/);
    return m ? Number(m[0]) : null;
  }

  const norm = s => (s || '').replace(/[^가-힣0-9]/g, '');
  const grams = s => { const t = norm(s); const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
  function jaccard(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }
  // 처리결과 표 제목은 지적 원문 문장을 명사형으로 줄인 꼴이 많아(예: "…철저" ↔ "…철저를 기하여
  // 주시기 바랍니다."), 순수 자카드는 분모(전체 글자 수)가 커져 점수가 낮게 나온다. 짧은 쪽이
  // 긴 쪽에 포함되는 정도(overlap 계수)를 함께 보아 실물 문서 확인(2026-09-26)에서 임계값
  // 미달이던 사례들을 살렸다 — 자카드는 그대로 두고 최댓값만 취한다(완전 동일 제목엔 영향 없음).
  // 다만 짧은 제목("위원회 운영 철저" 류)은 무엇에든 잘 「포함」돼 버려 서로 다른 지적끼리
  // 동점을 만든다(리뷰 지적 A) — 정규화(한글·숫자만) 글자 수가 짧은 쪽이 8자 미만이면
  // overlap 항을 끄고 자카드만 쓴다.
  function overlap(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
    let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }
  function titleScore(a, b) {
    const j = jaccard(a, b);
    const shorter = Math.min(norm(a).length, norm(b).length);
    return shorter >= 8 ? Math.max(j, overlap(a, b) * 0.85) : j;
  }

  function match(actions, findings, opts) {
    const o = opts || {};
    return actions.map(action => {
      const year = action.year || o.year;
      // 최종 검토 수정 2: 견본 CSV 처럼 (연도·위원회·지적번호·제목) 이 다 적힌 줄은 그 넷이 맞는
      // 지적이 딱 하나면 유사도를 따지지 않고 그것으로 한다(같은 제목·다른 번호 지적과 동점이 되지 않게).
      if (year && action.com && action.no != null) {
        const t = norm(action.title);
        const hits = findings.filter(f => f.year === year && f.com === action.com && f.no === action.no && norm(f.title) === t);
        if (hits.length === 1) {
          return { action, best: hits[0], score: 1, candidates: [{ finding: hits[0], score: 1 }], ambiguous: false, exact: true };
        }
      }
      const pool = findings.filter(f => !year || f.year === year);
      const scored = pool.map(f => {
        let s = titleScore(action.title, f.title);
        if (o.dept && !action.dept && f.dept === o.dept) s += 0.1;
        if (action.dept && f.dept && action.dept.replace(/\s/g, '').includes(f.dept.replace(/\s/g, ''))) s += 0.05;
        return { finding: f, score: Math.round(s * 100) / 100 };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
      const top = scored[0];
      // 1·2위 점수차가 0.05 미만이면 어느 쪽도 자신 있게 고를 수 없다 — Task 7 화면이 「반영」을
      // 자동 체크하는 기준(best 존재)이므로, 애매한 동점은 best 를 비우고 사람이 고르게 한다.
      const ambiguous = scored.length >= 2 && (scored[0].score - scored[1].score) < 0.05;
      const best = !ambiguous && top && top.score >= 0.45 ? top.finding : null;
      return { action, best, score: top ? top.score : 0, candidates: scored, ambiguous };
    });
  }

  const q = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const line = cells => cells.map(q).join(',');

  function templateCsv(findings) {
    return '﻿' + [line(CSV_HEAD), ...findings.map(f => line([f.year, f.com, f.dept, f.no, f.title, '', '']))].join('\n') + '\n';
  }

  function exportCsv(findings, actions) {
    return '﻿' + [line([...CSV_HEAD, '근거파일']), ...findings.map(f => {
      const a = actions[f.id] || {};
      return line([f.year, f.com, f.dept, f.no, f.title, a.status || '', a.text || '', a.source || '']);
    })].join('\n') + '\n';
  }

  const api = { STATUSES, tableRows, extractActions, fromCsv, guessYear, match, templateCsv, exportCsv };
  root.DCC = root.DCC || {};
  root.DCC.attach = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
