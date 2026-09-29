const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../site/js/core.js');
const DATA = require('./fixture_data.js');
const NOW = 2026;

test('searchDepts matches name, alias and silguk, current first', () => {
  const ix = core.index(DATA, NOW);
  assert.equal(core.searchDepts(ix, '청년')[0].name, '청년정책관');
  const byAlias = core.searchDepts(ix, '예산과');
  assert.equal(byAlias[0].name, '예산법무과');
  assert.equal(byAlias[0].matchedAlias, '예산과');
  assert.deepEqual(core.searchDepts(ix, '부시장').map(d => d.name).sort(), ['청년정책관', '홍보기획관']);
  const all = core.searchDepts(ix, '');
  assert.equal(all[all.length - 1].name, '가족여성과');   // 현행 아닌 부서는 뒤
});

test('searchDepts ranks exact, then prefix, then contains, then 실·국 match', () => {
  const data = { findings: [], sources: [], depts: [
    { name: '건축과', silguk: '도시주택국', aliases: [], current: true },
    { name: '공동주택과', silguk: '도시주택국', aliases: [], current: true },
    { name: '주택정책과', silguk: '도시주택국', aliases: [], current: true },
    { name: '주택과', silguk: '도시주택국', aliases: [], current: true }] };
  const ix = core.index(data, NOW);
  assert.deepEqual(core.searchDepts(ix, '주택').map(d => d.name), ['주택과', '주택정책과', '공동주택과', '건축과']);
  assert.equal(core.searchDepts(ix, '주택과')[0].name, '주택과');
  assert.equal(core.searchDepts(ix, '정책')[0].name, '주택정책과');
});

test('summarize dept: recurring first, guessed promises only for that dept, no 미상', () => {
  const ix = core.index(DATA, NOW);
  const s = core.summarize(ix, { kind: 'dept', name: '청년정책관' });
  assert.equal(s.counts.findings, 2);
  assert.equal(s.counts.recurring, 1);
  assert.deepEqual(s.findings.map(f => f.id), ['F2025-총무경제-001', 'F2023-총무경제-001']);
  assert.deepEqual(s.promises.guessed.map(p => p.id), ['P309-01-01-01']);
  assert.equal(s.counts.execRate, 75.0);            // 2025 = 마지막 마감 해(2026 은 진행 중)
  assert.deepEqual(s.coverage.map(c => c.uid).sort(), [1, 2]);
  assert.equal(s.now, NOW);                         // prompts.js 가 마감연도 판정에 쓴다
});

test('summarize silguk sums departments', () => {
  const ix = core.index(DATA, NOW);
  const s = core.summarize(ix, { kind: 'silguk', name: '부시장 직속' });
  assert.equal(s.counts.findings, 3);
  const y2025 = s.expenditure.find(e => e.year === 2025);
  assert.deepEqual([y2025.budget, y2025.spent], [250, 200]);
  assert.equal(s.expenditure.find(e => e.year === 2024).mended, true);
});

test('silguks orders catch-all groups last', () => {
  const names = core.silguks(core.index(DATA, NOW)).map(g => g.name);
  assert.deepEqual(names, ['기획경제실', '부시장 직속', '기타']);
});

test('no ranking helpers exported', () => {
  assert.equal(Object.keys(core).some(k => /rank|top/i.test(k)), false);
});

// 최종 검토 수정 1: 마감 연도는 보는 PC 의 시계가 아니라 자료 생성일(generated)에서 온다.
test('dataYear comes from data.generated, falls back to the clock only when missing', () => {
  assert.equal(core.dataYear({ generated: '2026-09-25' }, 2027), 2026);
  assert.equal(core.dataYear({}, 2027), 2027);
  assert.equal(core.dataYear({ generated: '' }, 2027), 2027);
});

test('index without nowYear treats the data year as open even when the clock says 2027', () => {
  const ix = core.index(DATA, core.dataYear(DATA, 2027));
  assert.equal(ix.now, 2026);
  const s = core.summarize(ix, { kind: 'dept', name: '청년정책관' });
  assert.equal(s.counts.execRate, 75.0);            // 2026 은 진행 중 → 2025 가 마지막 마감 해
  assert.equal(core.index(DATA).now, 2026);         // nowYear 를 안 주면 자료 연도
});

// 3차 Task 0 (b): 예산현액을 넘는 집행(집행률 100% 초과)이 있는 해를 따로 돌려준다(화면 설명 한 줄용).
test('summarize reports years whose spending exceeds the budget', () => {
  const data = JSON.parse(JSON.stringify(DATA));
  data.expenditure['청년정책관'].push({ year: 2023, budget: 100, spent: 120, mended: true });
  const s = core.summarize(core.index(data, NOW), { kind: 'dept', name: '청년정책관' });
  assert.deepEqual(s.overYears, [2023]);
  const plain = core.summarize(core.index(DATA, NOW), { kind: 'dept', name: '청년정책관' });
  assert.deepEqual(plain.overYears, []);
});

// 3차 Task 0 (c): 국 단위 공통 지적(group 이 실·국 이름, dept 가 「여러 부서 공통」)은 그 실·국 화면에 따로 보인다.
test('summarize silguk returns common findings whose group is the silguk name', () => {
  const data = JSON.parse(JSON.stringify(DATA));
  data.findings.push({ id: 'F2025-총무경제-004', year: 2025, com: '총무경제', group: '기획경제실', no: 4, title: '국 공통 당부', body: '', dept_raw: '공통', dept: '여러 부서 공통', silguk: '기타', uid: 1, recurring: null });
  data.findings.push({ id: 'F2025-총무경제-005', year: 2025, com: '총무경제', group: '부시장 직속', no: 5, title: '다른 국 공통', body: '', dept_raw: '공통', dept: '여러 부서 공통', silguk: '기타', uid: 1, recurring: null });
  const ix = core.index(data, NOW);
  const s = core.summarize(ix, { kind: 'silguk', name: '기획경제실' });
  assert.deepEqual(s.common.map(f => f.id), ['F2025-총무경제-004']);
  assert.equal(s.findings.some(f => f.id === 'F2025-총무경제-004'), false);   // 본 지적 목록·건수에는 섞지 않는다
  assert.deepEqual(core.summarize(ix, { kind: 'dept', name: '예산법무과' }).common, []);
});

// Task 4f: 구청 지적을 가람구·나래구로 나눈다.
test('index ignores aliases that equal a dept name or point at two depts (Bug A)', () => {
  const data = { findings: [
    { id: 'F1', year: 2024, dept: '가람구 건설과', uid: 1, no: 1 },
    { id: 'F2', year: 2024, dept: '건설과', uid: 1, no: 2 }], sources: [], recurring: [], promises: [], expenditure: {},
  depts: [
    { name: '가람구 건설과', silguk: '가람구', aliases: ['건설과', '가람 건설과'], current: true },
    { name: '나래구 건설과', silguk: '나래구', aliases: ['건설과'], current: true },
    { name: '건축과', silguk: '도시주택국', aliases: [], current: true },
    { name: '가람구 건축과', silguk: '가람구', aliases: ['건축과'], current: true }] };
  const ix = core.index(data, NOW);
  assert.equal(ix.alias.has('건설과'), false);       // 두 부서에 걸림
  assert.equal(ix.alias.has('건축과'), false);       // 다른 부서 이름과 같음
  assert.equal(ix.alias.get('가람 건설과'), '가람구 건설과');
  assert.deepEqual((ix.byDept.get('가람구 건설과') || []).map(f => f.id), ['F1']);
});

test('joint finding (depts) counts once under each district dept and once in a silguk sum', () => {
  const f = { id: 'FJ', year: 2025, com: '총무경제', no: 1, dept: '행정지원과', depts: ['가람구 행정지원과', '나래구 행정지원과'],
    silguk: '가람구·나래구', uid: 1, recurring: 'R001' };
  const data = { findings: [f], sources: [], promises: [], expenditure: {},
    recurring: [{ id: 'R001', dept: '행정지원과', depts: ['가람구 행정지원과', '나래구 행정지원과'], years: [2024, 2025], finding_ids: ['FJ'] }],
    depts: [
      { name: '가람구 행정지원과', silguk: '가람구', aliases: [], current: true },
      { name: '나래구 행정지원과', silguk: '나래구', aliases: [], current: true }] };
  const ix = core.index(data, NOW);
  for (const name of ['가람구 행정지원과', '나래구 행정지원과']) {
    const s = core.summarize(ix, { kind: 'dept', name });
    assert.equal(s.counts.findings, 1);
    assert.equal(s.counts.recurring, 1);
  }
  assert.equal(core.summarize(ix, { kind: 'silguk', name: '가람구' }).counts.findings, 1);
  assert.equal(core.silguks(ix).some(g => g.name === '구청'), false);
});

test('silguk common findings also match a group header naming exactly one 구 (data.gu)', () => {
  const mk = (id, group) => ({ id, year: 2024, com: '도시건설', group, no: 1, title: 't', dept: '여러 부서 공통', silguk: '기타', uid: 1 });
  const data = { gu: ['가람', '나래'], sources: [], promises: [], expenditure: {}, recurring: [],
    findings: [mk('A', '가람구 및 14개동'), mk('B', '가람구 및 14개동, 나래구 및 17개동'), mk('C', '나래구청 및 동'), mk('D', '가람구')],
    depts: [{ name: '가람구 건설과', silguk: '가람구', aliases: [], current: true }, { name: '나래구 건설과', silguk: '나래구', aliases: [], current: true }] };
  const ix = core.index(data, NOW);
  assert.deepEqual(core.summarize(ix, { kind: 'silguk', name: '가람구' }).common.map(f => f.id).sort(), ['A', 'D']);
  assert.deepEqual(core.summarize(ix, { kind: 'silguk', name: '나래구' }).common.map(f => f.id), ['C']);
});


test('silguk common: a 보건소 header does not land in the plain 구 box', () => {
  const mk = (id, group) => ({ id, year: 2024, com: '보사환경', group, no: 1, title: 't', dept: '여러 부서 공통', silguk: '기타', uid: 1 });
  const data = { gu: ['가람', '나래'], sources: [], promises: [], expenditure: {}, recurring: [],
    findings: [mk('H', '가람구보건소'), mk('G', '가람구 및 14개동')],
    depts: [{ name: '가람구 건설과', silguk: '가람구', aliases: [], current: true },
      { name: '가람구보건소 건강증진과', silguk: '가람구보건소', aliases: [], current: true }] };
  const ix = core.index(data, NOW);
  assert.deepEqual(core.summarize(ix, { kind: 'silguk', name: '가람구' }).common.map(f => f.id), ['G']);
  assert.deepEqual(core.summarize(ix, { kind: 'silguk', name: '가람구보건소' }).common.map(f => f.id), ['H']);
});


// 2026-09-28 사용자 요청: 구 실·국 목록은 구청 부서(가나다순)를 먼저, 동(가나다순)을 뒤에. 동 판정은 자료의 dong(region.json).
test('구 silguk lists district-office depts first, then 동 (from data.dong)', () => {
  const d = (name, current = true) => ({ name, silguk: '가람구', aliases: [], current });
  const data = { gu: ['가람'], dong: { 가람: ['가나', '새솔', '다온'] }, sources: [], promises: [], expenditure: {}, recurring: [], findings: [],
    depts: [d('가나1동'), d('가람구 행정지원과'), d('다온동'), d('가람구'), d('새솔2동'), d('가람구 건설과'), d('가람구 동행정복지센터'), d('가나10동')] };
  const ix = core.index(data, NOW);
  assert.deepEqual(core.silguks(ix).find(g => g.name === '가람구').depts,
    ['가람구', '가람구 건설과', '가람구 동행정복지센터', '가람구 행정지원과', '가나10동', '가나1동', '다온동', '새솔2동']);
  assert.equal(core.isDong(ix, '가나1동'), true);
  assert.equal(core.isDong(ix, '가람구 동행정복지센터'), false);
  // 동 앞말이 없는 자료(다른 지자체·옛 자료)는 그냥 가나다순
  const plain = core.index({ ...data, dong: undefined }, NOW);
  assert.deepEqual(core.silguks(plain).find(g => g.name === '가람구').depts.slice(0, 4), ['가나10동', '가나1동', '가람구', '가람구 건설과']);
  assert.equal(core.isDong(plain, '가나1동'), false);
});

// 시작 화면 「전체 예보」 띠: 자료 전체의 수(부서별 아님).
test('overview counts whole dataset', () => {
  const o = core.overview(DATA);
  assert.deepEqual(o, { findings: 4, recurring: 1, promises: 2, from: 2023, to: 2025, committees: 1 });
  assert.deepEqual(core.overview({}), { findings: 0, recurring: 0, promises: 0, from: null, to: null, committees: 0 });
});
