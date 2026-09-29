const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../../site/js/core.js');
const P = require('../../site/js/prompts.js');
const DATA = require('./fixture_data.js');
// 굽는 때(dcc/site_build.py)처럼 틀의 {{지자체}} 를 config/region.json 의 지자체명으로 채운다(Task 4b).
const REGION = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/region.json'), 'utf8'));
const T = k => fs.readFileSync(path.join(__dirname, '../../prompts', k + '.md'), 'utf8').split('{{지자체}}').join(REGION.지자체명);

function ctx(extra) {
  const ix = core.index(DATA, 2026);
  const target = { kind: 'dept', name: '청년정책관' };
  const summary = core.summarize(ix, target);
  // 2026-09-29: build 는 고른 id 만 싣는다. 옛 시험은 「모두 고름」으로 돌린다.
  return Object.assign({ target, summary, actions: {}, findingIds: summary.findings.map(f => f.id), promiseIds: new Set(), template: T('행감대비') }, extra);
}
const allIds = s => s.findings.map(f => f.id);

test('행감대비 fills sections with numbered evidence, recurring first', () => {
  const r = P.build('행감대비', ctx());
  assert.ok(r.text.includes('가나시 청년정책관'));
  assert.match(r.text, /\[F1\] 2025 총무경제위원회 · 청년정책관 · 「청년정책실무위원회 재가동 검토」/);
  assert.ok(r.text.includes('되풀이 R001 (2023·2025)'));
  assert.match(r.text, /\[B1\] 2025 예산 0\.0억 · 집행 75(\.0)?%/);
  assert.ok(!r.text.includes('[P1]'));                       // 체크 안 한 약속은 안 넣는다
  assert.equal(r.chars, r.text.length);
});

test('checked promise included and marked as guessed', () => {
  const r = P.build('행감대비', ctx({ promiseIds: new Set(['P309-01-01-01']) }));
  assert.match(r.text, /\[P1\] 2026-03-09 제309회 · 「청년정책실무위원회 재가동 계획은\?」 → 하반기 중 재구성하여 운영할 계획임\. \(부서 추정\)/);
});

test('actions appear on F lines', () => {
  const r = P.build('행감대비', ctx({ actions: { 'F2025-총무경제-001': { status: '추진중', text: '위원 재구성 중', source: 'a.pdf' } } }));
  assert.ok(r.text.includes('조치: 추진중 — 위원 재구성 중'));
});

test('action without text shows status only (no dangling dash)', () => {
  const r = P.build('행감대비', ctx({ actions: { 'F2025-총무경제-001': { status: '완료', text: '', source: 'a.pdf' } } }));
  assert.match(r.text, /· 조치: 완료(\n|$)/);
  assert.ok(!r.text.includes('조치: 완료 —'));
});

test('limit trims F lines from the end and says how many', () => {
  const big = JSON.parse(JSON.stringify(DATA));
  for (let i = 0; i < 200; i++) big.findings.push({ ...big.findings[1], id: 'X' + i, dept: '청년정책관', recurring: null, year: 2019, title: '가'.repeat(60) + i });
  const ix = core.index(big, 2026);
  const s = core.summarize(ix, { kind: 'dept', name: '청년정책관' });
  const r = P.build('행감대비', { ...ctx(), summary: s, findingIds: allIds(s) });
  const data = r.text.split('[자료]')[1].split('[과제]')[0];
  assert.ok(data.length <= P.LIMIT + 200);
  assert.ok(r.omitted.F > 0);
  assert.ok(r.text.includes(`외 ${r.omitted.F}건 생략`));
  assert.ok(r.text.includes('[F1] 2025'));                  // 되풀이·최근 것은 남는다
});

test('actionsIncluded counts F lines that carry an action, after trimming', () => {
  assert.equal(P.build('행감대비', ctx()).actionsIncluded, 0);
  assert.equal(P.build('행감대비', ctx({ actions: { 'F2025-총무경제-001': { status: '완료', text: '', source: 'a.pdf' } } })).actionsIncluded, 1);
  // 다른 대상의 지적에만 조치가 있으면 0
  assert.equal(P.build('행감대비', ctx({ actions: { 'F-다른부서': { status: '완료', text: 'x', source: 'a.pdf' } } })).actionsIncluded, 0);
  // 잘려 나간 지적의 조치는 세지 않는다
  const big = JSON.parse(JSON.stringify(DATA));
  for (let i = 0; i < 200; i++) big.findings.push({ ...big.findings[1], id: 'X' + i, dept: '청년정책관', recurring: null, year: 2019, title: '가'.repeat(60) + i });
  const s = core.summarize(core.index(big, 2026), { kind: 'dept', name: '청년정책관' });
  const r = P.build('행감대비', { ...ctx(), summary: s, findingIds: allIds(s), actions: { X199: { status: '완료', text: 'y', source: 'a.pdf' } } });
  assert.ok(r.omitted.F > 0);
  assert.ok(!r.text.includes('조치: 완료 — y'));
  assert.equal(r.actionsIncluded, 0);
});

test('B lines use summary.now, not just the array\'s last entry', () => {
  const ix = core.index(DATA, 2026);
  const target = { kind: 'dept', name: '청년정책관' };
  const s = core.summarize(ix, target);
  assert.equal(s.now, 2026);
  // fixture 의 청년정책관 지출은 2024·2025·2026(진행 중)까지 있다. now=2026 이면
  // 2026 은 마감 전이라 빠지고 [B1] 은 가장 최근 마감 해인 2025 여야 한다.
  const r = P.build('행감대비', { target, summary: s, actions: {}, findingIds: allIds(s), promiseIds: new Set(), template: T('행감대비') });
  assert.match(r.text, /\[B1\] 2025 예산/);
  assert.ok(!r.text.includes('[B1] 2026'));
});

test('답변서초안 puts the chosen finding first and siblings after', () => {
  const r = P.build('답변서초안', ctx({ template: T('답변서초안'), findingId: 'F2023-총무경제-001',
    findingIds: ['F2023-총무경제-001', 'F2025-총무경제-001'] }));
  assert.match(r.text, /\[F1\] 2023/);
  assert.match(r.text, /\[F2\] 2025/);
});

test('maskNames matches the python rule on samples', () => {
  assert.equal(P.maskNames('김철수 시장님께서'), '○○○ 시장님께서');
  assert.equal(P.maskNames('농수산물도매시장 운영'), '농수산물도매시장 운영');
  assert.equal(P.maskNames('가나시장은'), '가나시장은');
  assert.equal(P.maskNames('하영수 의원이 발언'), '○○○ 의원이 발언');   // SURNAMES 에 '하' 누락 회귀
});

test('maskNames rule tables are structurally identical to dcc/privacy.py', () => {
  assert.equal(typeof P._rules.TITLES, 'string');
  assert.ok(Array.isArray(P._rules.SURNAMES) || P._rules.SURNAMES instanceof Set);
  assert.ok(Array.isArray(P._rules.NOT_NAME_END) || P._rules.NOT_NAME_END instanceof Set);
  assert.ok(Array.isArray(P._rules.NOT_NAME) || P._rules.NOT_NAME instanceof Set);
});

// 최종 검토 수정 4: 약속([P])을 많이 체크해도 지적([F])이 자료 칸의 2/3 이상을 지킨다.
// [P] 는 LIMIT 의 약 1/3 까지만 싣고 넘는 것은 끝에서부터 빼 「외 N건 생략」으로 적는다.
test('many checked promises are capped near LIMIT/3 so F lines keep at least 2/3 of the budget', () => {
  const big = JSON.parse(JSON.stringify(DATA));
  for (let i = 0; i < 200; i++) big.findings.push({ ...big.findings[1], id: 'X' + i, dept: '청년정책관', recurring: null, year: 2019, title: '가'.repeat(60) + i });
  for (let i = 0; i < 80; i++) big.promises.push({ ...big.promises[0], id: 'PX' + i, question: '나'.repeat(50) + i, commitments: ['다'.repeat(80)] });
  const s = core.summarize(core.index(big, 2026), { kind: 'dept', name: '청년정책관' });
  const inc = new Set(s.promises.guessed.map(p => p.id));
  const r = P.build('행감대비', { ...ctx(), summary: s, findingIds: allIds(s), promiseIds: inc });
  const data = r.text.split('[자료]')[1].split('[과제]')[0];
  const fPart = data.split('[P] ')[0];
  const pPart = data.split('[P] ')[1].split('[B] ')[0];
  assert.ok(data.length <= P.LIMIT + 200);
  // [F] 가 아닌 부분([P]·[B]·머리글)이 1/3 이하 → [F] 몫이 2/3 이상. 실제로 채운 [F] 는 줄 단위로
  // 잘리므로 한 줄(≤ 250자) 모자랄 수 있다.
  assert.ok(data.length - fPart.length <= P.LIMIT / 3, '[F] 밖 ' + (data.length - fPart.length));
  assert.ok(fPart.length >= P.LIMIT * 2 / 3 - 250, 'F 부분 ' + fPart.length);
  assert.ok(r.omitted.P > 0);
  assert.ok(pPart.includes(`외 ${r.omitted.P}건 생략`));
  assert.ok(r.text.includes('[P1] '));
});

test('few promises are not trimmed', () => {
  const r = P.build('행감대비', ctx({ promiseIds: new Set(['P309-01-01-01']) }));
  assert.equal(r.omitted.P, 0);
  assert.ok(!/\[P\][^[]*외 \d+건 생략/.test(r.text));
});

// ---------- 2026-09-29 사용자 판정: 집행부 프롬프트도 후보를 골라 싣는다 ----------
test('build carries only the explicitly picked findings and promises', () => {
  const r = P.build('행감대비', ctx({ findingIds: ['F2023-총무경제-001'], promiseIds: new Set(['P309-01-01-01']) }));
  assert.match(r.text, /\[F1\] 2023 /);
  assert.ok(!r.text.includes('[F2]'));
  assert.ok(!r.text.includes('「청년정책실무위원회 재가동 검토」'));
  assert.ok(r.text.includes('[P1] 2026-03-09'));
  assert.equal(r.picked.F, 1);
  assert.equal(r.picked.P, 1);
});

test('build with nothing picked says so; ids of other depts are ignored', () => {
  const r = P.build('행감대비', ctx({ findingIds: [], promiseIds: new Set() }));
  assert.match(r.text, /\[F\] 행감 지적\n\(없음\)/);
  const r2 = P.build('행감대비', ctx({ findingIds: ['F2025-총무경제-002'] }));   // 홍보기획관 지적
  assert.ok(!r2.text.includes('[F1]'));
  assert.equal(r2.picked.F, 0);
  // 지정하지 않으면 아무것도 싣지 않는다(모두 쏟아 넣지 않음)
  const c = ctx(); delete c.findingIds;
  assert.ok(!P.build('행감대비', c).text.includes('[F1]'));
});

test('picked findings keep summary order (되풀이·최근 먼저) and are truncated with 외 N건 생략', () => {
  const big = JSON.parse(JSON.stringify(DATA));
  for (let i = 0; i < 200; i++) big.findings.push({ ...big.findings[1], id: 'X' + i, dept: '청년정책관', recurring: null, year: 2019, title: '가'.repeat(60) + i });
  const s = core.summarize(core.index(big, 2026), { kind: 'dept', name: '청년정책관' });
  const ids = allIds(s).slice().reverse();
  const r = P.build('행감대비', { ...ctx(), summary: s, findingIds: ids });
  assert.ok(r.text.includes('[F1] 2025'));
  assert.ok(r.omitted.F > 0 && r.text.includes(`외 ${r.omitted.F}건 생략`));
});

// 기본 고르기: 자료 연도 2019~2025, 상태가 섞인 부서
function mixed() {
  const d = JSON.parse(JSON.stringify(DATA));
  const base = d.findings[1];
  const mk = (id, year, rec) => ({ ...base, id, year, dept: '청년정책관', recurring: rec || null, title: id });
  d.findings.push(mk('Y2025a', 2025), mk('Y2025b', 2025), mk('Y2024a', 2024), mk('Y2023a', 2023), mk('Y2022a', 2022), mk('Y2019a', 2019),
    mk('Y2019r', 2019, 'R009'), mk('Y2024r', 2024, 'R009'));
  d.recurring.push({ id: 'R009', dept: '청년정책관', years: [2019, 2024], finding_ids: ['Y2019r', 'Y2024r'], common: ['가'] });
  d.promises.push({ ...d.promises[0], id: 'P-extra' });
  const s = core.summarize(core.index(d, 2026), { kind: 'dept', name: '청년정책관' });
  const years = [...new Set(d.findings.map(f => f.year))];
  const actions = {
    Y2025a: { status: '완료', text: '' }, Y2025b: { status: '미조치', text: '' }, Y2024a: { status: '추진중', text: '' },
    Y2022a: { status: '장기검토', text: '' }, Y2019a: { status: '미조치', text: '' },
    Y2019r: { status: '완료', text: '' }, Y2024r: { status: '계속추진', text: '' },
  };
  return { s, years, actions };
}

test('statusOf: 첨부 전은 미첨부', () => {
  assert.equal(P.statusOf({ id: 'a' }, {}), '미첨부');
  assert.equal(P.statusOf({ id: 'a' }, { a: { status: '완료' } }), '완료');
});

test('행감대비 defaults: 최근 3개 자료 연도의 완료 아닌 지적 + 되풀이 줄기(완료 빼고), 약속은 없음', () => {
  const { s, years, actions } = mixed();
  const d = P.defaults('행감대비', s, actions, years);
  const f = [...d.findings].sort();
  // 최근 3개 자료 연도 = 2025·2024·2023
  assert.deepEqual(f, ['F2023-총무경제-001', 'F2025-총무경제-001', 'Y2023a', 'Y2024a', 'Y2024r', 'Y2025b'].sort());
  assert.ok(!d.findings.has('Y2025a'));            // 완료는 뺀다
  assert.ok(!d.findings.has('Y2019r'));            // 되풀이여도 완료는 뺀다
  assert.ok(!d.findings.has('Y2022a'));            // 3년 밖 장기검토(되풀이 아님)
  assert.equal(d.promises.size, 0);
});

test('업무보고대비 defaults: 최근 2개 자료 연도 + 되풀이 줄기 전부 + 약속 전부', () => {
  const { s, years, actions } = mixed();
  const d = P.defaults('업무보고대비', s, actions, years);
  assert.deepEqual([...d.findings].sort(), ['F2023-총무경제-001', 'F2025-총무경제-001', 'Y2019r', 'Y2024a', 'Y2024r', 'Y2025a', 'Y2025b'].sort());
  assert.deepEqual([...d.promises].sort(), s.promises.guessed.map(p => p.id).sort());
  assert.ok(d.promises.size >= 2);
});

test('답변서초안 defaults: nothing; unknown kind: nothing', () => {
  const { s, years, actions } = mixed();
  for (const k of ['답변서초안', '없는종류']) {
    const d = P.defaults(k, s, actions, years);
    assert.equal(d.findings.size, 0);
    assert.equal(d.promises.size, 0);
  }
});

test('defaults without dataYears use the summary own years', () => {
  const { s, actions } = mixed();
  const d = P.defaults('행감대비', s, actions);
  assert.ok(d.findings.has('Y2025b') && d.findings.has('Y2024a') && d.findings.has('Y2023a'));
});

test('draftPick: 고른 지적과 그 되풀이 줄기 형제', () => {
  const { s } = mixed();
  assert.deepEqual([...P.draftPick(s, 'Y2019r')].sort(), ['Y2019r', 'Y2024r']);
  assert.deepEqual([...P.draftPick(s, 'Y2025b')], ['Y2025b']);
  assert.equal(P.draftPick(s, '없음').size, 0);
});

test('답변서초안 template asks for one draft per picked item', () => {
  const t = T('답변서초안');
  assert.ok(t.includes('고른 항목마다'));
  assert.ok(t.includes('[F9] [P9] [B9]'));
});
