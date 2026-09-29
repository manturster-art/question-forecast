const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../site/js/attach.js');

const MD = [
  '# 2025년도 행정사무감사 지적사항 처리결과',
  '| 연번 | 지적사항 | 처리결과 | 소관부서 |',
  '| --- | --- | --- | --- |',
  '| 1 | 청년정책실무위원회 재가동 검토 | 완 료 | 청년정책관 |',
  '| 2 | 시정홍보종합계획 수립 | 추진중 | 홍보기획관 |',
  '<table><tr><td>3</td><td>예산 불용 최소화 방안 마련</td><td>장기검토</td><td>예산법무과</td></tr></table>',
  '| 목차 | 쪽 |',
].join('\n');

test('tableRows reads pipe and html rows, skips separators', () => {
  const rows = A.tableRows(MD);
  assert.equal(rows.length, 5);                               // 머리줄·1·2·html 1·목차
  assert.deepEqual(rows[2], ['2', '시정홍보종합계획 수립', '추진중', '홍보기획관']);
  assert.deepEqual(rows[3], ['3', '예산 불용 최소화 방안 마련', '장기검토', '예산법무과']);
});

test('extractActions finds status cell ignoring letter spacing', () => {
  const acts = A.extractActions(A.tableRows(MD));
  assert.equal(acts.length, 3);
  assert.deepEqual([acts[0].no, acts[0].status, acts[0].dept], [1, '완료', '청년정책관']);
  assert.equal(acts[2].title, '예산 불용 최소화 방안 마련');
});

test('guessYear prefers 년도 over dates in parentheses', () => {
  assert.equal(A.guessYear('(2026.04.30.)2025년도 행정사무감사 지적사항 처리결과.pdf', ''), 2025);
  assert.equal(A.guessYear('처리결과.hwp', '# 2024년도 행정사무감사'), 2024);
  assert.equal(A.guessYear('x.pdf', 'nothing'), null);
});

test('match picks best same-year finding above threshold', () => {
  const F = [
    { id: 'a', year: 2025, dept: '청년정책관', title: '청년정책실무위원회 재가동 검토' },
    { id: 'b', year: 2025, dept: '예산법무과', title: '예산 불용 최소화' },
    { id: 'c', year: 2024, dept: '청년정책관', title: '청년정책실무위원회 재가동 검토' },
  ];
  const r = A.match(A.extractActions(A.tableRows(MD)), F, { year: 2025 });
  assert.equal(r[0].best.id, 'a');
  assert.equal(r[2].best.id, 'b');
  assert.equal(r[1].best, null);           // 짝 없는 줄은 사람이 고른다
  assert.ok(r[0].candidates.every(c => c.finding.year === 2025));
});

test('match handles nominalized 처리결과 titles that shorten the original 지적 sentence', () => {
  // 실물 문서 확인 결과: 처리결과 표의 제목은 지적 원문을 명사형으로 줄인 꼴이라
  // 순수 2-gram 자카드만으로는 임계값(0.45)을 못 넘는 사례가 많았다(부서 일치인데도).
  const actions = [{ no: null, title: '차량 정수 관리 철저', status: '완료', dept: '회계과', text: '' }];
  const F = [
    { id: 'z', year: 2025, dept: '회계과', title: '차량 정수 관리에 철저를 기하여 주시기 바랍니다.' },
    { id: 'y', year: 2025, dept: '건축과', title: '공개공지 관리 철저' },
  ];
  const r = A.match(actions, F, { year: 2025 });
  assert.equal(r[0].best.id, 'z');
});

test('match refuses to guess between near-tied candidates (ambiguous)', () => {
  // 리뷰 지적 A: 실물 확인에서 "위원회 운영 철저" 류 짧은 제목이 서로 다른 두 지적에 동점(0.85)을
  // 내는 사례를 봤다. Task 7 화면은 best 가 있으면 「반영」을 자동 체크하므로, 점수차가 0.05
  // 미만인 1·2위는 사람이 고르게 best 를 비우고 ambiguous 를 세운다.
  const actions = [{ no: null, title: '위원회 정기 운영 관리 철저', status: '완료', dept: '', text: '' }];
  const F = [
    { id: 'p', year: 2025, dept: '청년정책관', title: '청년정책위원회 정기 운영 관리 철저를 기하여 주시기 바랍니다.' },
    { id: 'q', year: 2025, dept: '안전정책과', title: '안전관리위원회 정기 운영 관리 철저를 기하여 주시기 바랍니다.' },
  ];
  const r = A.match(actions, F, { year: 2025 });
  assert.equal(r[0].best, null);
  assert.equal(r[0].ambiguous, true);
});

test('match sets ambiguous false when a candidate clearly leads', () => {
  const r = A.match(A.extractActions(A.tableRows(MD)),
    [{ id: 'a', year: 2025, dept: '청년정책관', title: '청년정책실무위원회 재가동 검토' }], { year: 2025 });
  assert.equal(r[0].ambiguous, false);
});

test('extractActions drops exact duplicate rows (summary table repeats detail table)', () => {
  const DUP = [
    '| 연번 | 지적사항 | 처리결과 | 소관부서 |',
    '| --- | --- | --- | --- |',
    '| 1 | 청년정책실무위원회 재가동 검토 | 완료 | 청년정책관 |',
    '| 2 | 시정홍보종합계획 수립 | 추진중 | 홍보기획관 |',
    '## 상세',
    '| 연번 | 지적사항 | 처리결과 | 소관부서 |',
    '| --- | --- | --- | --- |',
    '| 1 | 청년정책실무위원회 재가동 검토 | 완료 | 청년정책관 |',
    '| 2 | 시정홍보종합계획 수립 | 추진중 | 홍보기획관 |',
  ].join('\n');
  const acts = A.extractActions(A.tableRows(DUP));
  assert.equal(acts.length, 2);
  assert.equal(acts.duplicates, 2);
});

test('csv round trip', () => {
  const F = [{ id: 'a', year: 2025, com: '총무경제', dept: '청년정책관', no: 1, title: '청년정책실무위원회 재가동, 검토' }];
  const t = A.templateCsv(F);
  assert.ok(t.startsWith('﻿연도,위원회,부서,지적번호,지적제목,조치상태,조치내용'));
  const filled = t.replace(/,,\s*$/m, ',완료,재구성 완료');
  const acts = A.fromCsv(filled);
  assert.deepEqual([acts[0].status, acts[0].text, acts[0].title], ['완료', '재구성 완료', '청년정책실무위원회 재가동, 검토']);
  const out = A.exportCsv(F, { a: { status: '완료', text: '재구성 완료', source: 'x.csv' } });
  assert.ok(out.includes('완료') && out.includes('재구성 완료'));
});

// 최종 검토 수정 2: 견본 CSV 는 (연도·위원회·지적번호·제목) 이 그대로 적혀 오므로 그 넷이 맞는 지적을
// 먼저 찾아 점수 1.0 · 애매함 없음으로 돌려준다(같은 제목의 다른 번호 지적과 동점이 되지 않게).
test('fromCsv keeps 위원회 and 지적번호; match prefers an exact (year, com, no, title) hit', () => {
  const F = [
    { id: 'n1', year: 2025, com: '총무경제', dept: '청년정책관', no: 1, title: '위원회 운영 철저' },
    { id: 'n2', year: 2025, com: '총무경제', dept: '청년정책관', no: 2, title: '위원회 운영 철저' },
  ];
  const acts = A.fromCsv(A.templateCsv(F).replace(/\n(2025,총무경제,청년정책관,2,[^\n]*),,/, '\n$1,완료,반영'));
  assert.equal(acts.length, 1);
  assert.deepEqual([acts[0].com, acts[0].no, acts[0].year], ['총무경제', 2, 2025]);
  const r = A.match(acts, F, { dept: '청년정책관' });
  assert.equal(r[0].best.id, 'n2');
  assert.equal(r[0].score, 1);
  assert.equal(r[0].ambiguous, false);
});

test('exact hit ignores spacing and punctuation in the title but needs the same 지적번호', () => {
  const F = [{ id: 'n1', year: 2025, com: '총무경제', dept: 'A과', no: 1, title: '위원회 운영 철저.' },
             { id: 'n2', year: 2025, com: '총무경제', dept: 'A과', no: 2, title: '위원회 운영 철저.' }];
  const r = A.match([{ year: 2025, com: '총무경제', no: 3, title: '위원회운영 철저', status: '완료', dept: '' }], F, {});
  assert.equal(r[0].best, null);                   // 번호가 다르면 정확히 맞는 것이 없다 → 동점이라 애매
  assert.equal(r[0].ambiguous, true);
  const r2 = A.match([{ year: 2025, com: '총무경제', no: 1, title: '위원회운영 철저', status: '완료', dept: '' }], F, {});
  assert.equal(r2[0].best.id, 'n1');
});
