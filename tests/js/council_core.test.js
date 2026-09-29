const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../site/js/core.js');
const cc = require('../../site/js/council_core.js');
const DATA = require('./fixture_data.js');
const CFG = { exec_low: 60, exec_high: 100 };

test('counts: pending not in total, unfixed from actions', () => {
  const ix = core.index(DATA, 2026);
  const s = core.summarize(ix, { kind: 'dept', name: '예산법무과' });
  const ids = s.findings.map(f => f.id);
  const none = cc.counts(ix, '예산법무과', {}, CFG);
  assert.equal(none.unfixed, 0);
  assert.equal(none.pending, ids.length);
  const acts = { [ids[0]]: { status: '미조치' } };
  if (ids[1]) acts[ids[1]] = { status: '완료' };
  const c = cc.counts(ix, '예산법무과', acts, CFG);
  assert.equal(c.unfixed, 1);
  assert.equal(c.pending, ids.length - Object.keys(acts).length);
  assert.equal(c.total, c.unfixed + c.recurring + c.promises + c.exec);
});

test('exec anomaly boundaries', () => {
  assert.equal(cc._execFlag(59.9, CFG), 1);
  assert.equal(cc._execFlag(60, CFG), 0);
  assert.equal(cc._execFlag(100, CFG), 0);
  assert.equal(cc._execFlag(100.1, CFG), 1);
  assert.equal(cc._execFlag(null, CFG), 0);
});

test('rows sorted by total desc then name; sortRows', () => {
  const ix = core.index(DATA, 2026);
  const r = cc.rows(ix, '기획행정위원회', {}, CFG);
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1].total > r[i].total || (r[i - 1].total === r[i].total && r[i - 1].name.localeCompare(r[i].name, 'ko') <= 0));
  }
  const byName = cc.sortRows(r, 'name', 'asc').map(x => x.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, 'ko')));
});

test('candidates carry kind and evidence', () => {
  const ix = core.index(DATA, 2026);
  const s = core.summarize(ix, { kind: 'dept', name: '예산법무과' });
  const acts = { [s.findings[0].id]: { status: '장기검토', text: '검토 중' } };
  const cs = cc.candidates(ix, '예산법무과', acts, CFG);
  const u = cs.find(c => c.kind === 'unfixed');
  assert.equal(u.id, s.findings[0].id);
  assert.match(u.evidence, /장기검토/);
  for (const c of cs) assert.ok(['unfixed', 'recurring', 'promise', 'exec'].includes(c.kind));
});

test('committeeTotals sums rows', () => {
  const ix = core.index(DATA, 2026);
  const t = cc.committeeTotals(ix, {}, CFG);
  const r = cc.rows(ix, '기획행정위원회', {}, CFG);
  assert.equal(t[0].total, r.reduce((n, x) => n + x.total, 0));
  assert.equal(t[0].depts, r.length);
});

test('promptText fills slots, masks names, respects LIMIT', () => {
  const prompts = require('../../site/js/prompts.js');
  const picked = [{ kind: 'unfixed', id: 'F1', title: '홍길동 과장 관련 지적', year: 2025, evidence: 'e' }];
  const t = cc.promptText('대상={{대상}}\n{{자료}}', { dept: '주택과', committee: '도시교통위원회', picked });
  assert.match(t, /대상=도시교통위원회 소관 주택과\n/);
  assert.match(t, /Q1 \[조치 안 됨\]/);
  // 상임위 밖 묶음(구청·동)·소관 미확인은 부서 이름만
  assert.match(cc.promptText('대상={{대상}}.', { dept: '가나1동', committee: '구청·동 행정복지센터', group: true, picked }), /대상=가나1동\./);
  assert.match(cc.promptText('대상={{대상}}.', { dept: '옛과', committee: null, picked }), /대상=옛과\./);
  assert.doesNotMatch(t, /홍길동/);
  const many = Array.from({ length: 400 }, (_, i) => ({ kind: 'promise', id: 'P' + i, title: 'x'.repeat(60), year: 2024, evidence: 'y'.repeat(60) }));
  const long = cc.promptText('{{자료}}', { dept: 'd', committee: 'c', picked: many });
  assert.ok(long.length <= prompts.LIMIT);
  assert.match(long, /외 \d+건 생략/);
});

test('csvText quotes fields', () => {
  const s = cc.csvText({ picked: [{ kind: 'exec', id: 'E', title: '집행률 "낮음", 확인', year: 2025, evidence: 'a,b' }] });
  const lines = s.split('\n');
  assert.equal(lines[0], '번호,종류,제목,연도,근거');
  assert.equal(lines[1], '1,집행 이상,"집행률 ""낮음"", 확인",2025,"a,b"');
});

test('promptText: $ patterns in data are inserted literally', () => {
  const picked = [{ kind: 'exec', id: 'E', title: "A $' B $& C $$ D $` E", year: 2025, evidence: '' }];
  const t = cc.promptText('앞\n{{자료}}\n뒤', { dept: 'd', committee: 'c', picked });
  assert.match(t, /A \$' B \$& C \$\$ D \$` E/);
  assert.match(t, /^앞\n/);
  assert.match(t, /\n뒤$/);
});

test('csvText: formula-leading cells are neutralised (= + - @ tab CR)', () => {
  const titles = ['=1+2', '+1', '-1+2', '@SUM(A1)', '\t=1', '\r=1', '정상'];
  const s = cc.csvText({ picked: titles.map((t, i) => ({ kind: 'exec', id: 'E' + i, title: t, year: 2025, evidence: t })) });
  const lines = s.split('\n');
  assert.equal(lines[1], "1,집행 이상,'=1+2,2025,'=1+2");
  assert.equal(lines[2], "2,집행 이상,'+1,2025,'+1");
  assert.equal(lines[3], "3,집행 이상,'-1+2,2025,'-1+2");
  assert.equal(lines[4], "4,집행 이상,'@SUM(A1),2025,'@SUM(A1)");
  assert.ok(lines[5].startsWith("5,집행 이상,'\t=1,"));
  assert.ok(s.includes('6,집행 이상,"\'\r=1"'));
  assert.ok(s.includes('7,집행 이상,정상,2025,정상'));
});

test('both-구 finding counts once under each 구 dept (spec §7)', () => {
  const data = {
    generated: '2026-09-25', sources: [], recurring: [], promises: [], expenditure: {},
    findings: [
      { id: 'F-공통', year: 2025, com: '도시건설', no: 1, title: '두 구 공통 지적', dept: '가람구 건축과', depts: ['가람구 건축과', '나래구 건축과'], uid: 1, recurring: null },
      { id: 'F-가람', year: 2025, com: '도시건설', no: 2, title: '가람구만', dept: '가람구 건축과', uid: 1, recurring: null },
    ],
    depts: [
      { name: '가람구 건축과', silguk: '가람구', aliases: [], current: true },
      { name: '나래구 건축과', silguk: '나래구', aliases: [], current: true },
    ],
    committees: [{ name: '도시건설위원회', depts: ['가람구 건축과', '나래구 건축과'] }],
    unassigned: [],
  };
  const ix = core.index(data, 2026);
  const man = cc.counts(ix, '가람구 건축과', {}, CFG), dong = cc.counts(ix, '나래구 건축과', {}, CFG);
  assert.equal(man.pending, 2);
  assert.equal(dong.pending, 1);
  const acts = { 'F-공통': { status: '미조치' } };
  assert.equal(cc.counts(ix, '가람구 건축과', acts, CFG).unfixed, 1);
  assert.equal(cc.counts(ix, '나래구 건축과', acts, CFG).unfixed, 1);
  const t = cc.committeeTotals(ix, acts, CFG)[0];
  assert.equal(t.unfixed, 2);
  assert.equal(t.pending, 1);
  assert.equal(t.total, 2);
  assert.ok(cc.candidates(ix, '나래구 건축과', acts, CFG).some(c => c.id === 'F-공통' && c.kind === 'unfixed'));
});

test('groups (상임위 밖 묶음) get rows and totals after committees, flagged group', () => {
  const data = Object.assign({}, DATA, { groups: [{ name: '구청·동 행정복지센터', depts: ['홍보기획관'] }] });
  const ix = core.index(data, 2026);
  const r = cc.rows(ix, '구청·동 행정복지센터', {}, CFG);
  assert.deepEqual(r.map(x => x.name), ['홍보기획관']);
  const t = cc.committeeTotals(ix, {}, CFG);
  assert.deepEqual(t.map(x => [x.name, !!x.group]), [['기획행정위원회', false], ['구청·동 행정복지센터', true]]);
  assert.equal(t[1].depts, 1);
  assert.deepEqual(cc.units(data).map(u => u.name), ['기획행정위원회', '구청·동 행정복지센터']);
  assert.deepEqual(cc.units({ committees: [] }), []);
});

// 날씨(2026-09-29): 물을 거리 합계만으로, config/council.json 「weather」 구간(max 이하)을 따른다.
test('weather thresholds come from cfg.weather (max inclusive, last open-ended)', () => {
  const cfg = { exec_low: 60, exec_high: 100, weather: [{ max: 0, icon: '맑음' }, { max: 4, icon: '구름 조금' }, { max: 9, icon: '흐림' }, { icon: '비' }] };
  const at = n => cc.weather(n, cfg);
  assert.equal(at(0).icon, '맑음');
  assert.equal(at(1).icon, '구름 조금');
  assert.equal(at(4).icon, '구름 조금');
  assert.equal(at(5).icon, '흐림');
  assert.equal(at(9).icon, '흐림');
  assert.equal(at(10).icon, '비');
  assert.equal(at(250).icon, '비');
  assert.equal(at(5).label, '흐림 — 물을 거리 5~9건');
  assert.equal(at(0).label, '맑음 — 물을 거리 0건');
  assert.equal(at(12).label, '비 — 물을 거리 10건 이상');
  assert.deepEqual(cc.weatherScale(cfg).map(w => w.key), ['sun', 'partly', 'cloud', 'rain']);
  // 다른 구간을 주면 그대로 따른다(모양 key 는 모르는 이름이면 순서로).
  const alt = { weather: [{ max: 2, icon: '맑음' }, { icon: '소나기' }] };
  assert.equal(cc.weather(2, alt).icon, '맑음');
  assert.equal(cc.weather(3, alt).icon, '소나기');
  assert.equal(cc.weather(3, alt).key, 'partly');
  // 없으면 기본 구간
  assert.equal(cc.weather(7, CFG).icon, '흐림');
  assert.deepEqual(cc.weatherScale({}).map(w => w.icon), cc.DEFAULT_WEATHER.map(w => w.icon));
});

test('weather follows counts total (attachment raises it)', () => {
  const ix = core.index(DATA, 2026);
  const cfg = { exec_low: 60, exec_high: 100, weather: [{ max: 0, icon: '맑음' }, { max: 1, icon: '구름 조금' }, { icon: '비' }] };
  const s = core.summarize(ix, { kind: 'dept', name: '예산법무과' });
  const before = cc.counts(ix, '예산법무과', {}, cfg).total;
  const after = cc.counts(ix, '예산법무과', { [s.findings[0].id]: { status: '미조치' } }, cfg).total;
  assert.equal(after, before + 1);
  assert.equal(cc.weather(after, cfg).icon, after === 0 ? '맑음' : after === 1 ? '구름 조금' : '비');
});

test('exec candidate evidence names the dept', () => {
  const ix = core.index(DATA, 2026);
  const cs = cc.candidates(ix, '청년정책관', {}, { exec_low: 101, exec_high: 200 });
  const e = cs.find(c => c.kind === 'exec');
  assert.ok(e);
  assert.match(e.evidence, /^청년정책관 예산 /);
});
