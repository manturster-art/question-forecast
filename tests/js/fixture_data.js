// 공개 원문 모양을 흉내 낸 작은 자료. 이름은 넣지 않는다.
module.exports = {
  generated: '2026-09-25',
  sources: [
    { kind: '결과보고서', year: 2025, com: '총무경제', uid: 1, url: 'https://council.example.invalid/viewer/pdf.do?group=bbs&uid=1', declared: 3, parsed: 3 },
    { kind: '결과보고서', year: 2023, com: '총무경제', uid: 2, url: 'https://council.example.invalid/viewer/pdf.do?group=bbs&uid=2', declared: 1, parsed: 1 },
    { kind: '답변요지서', session: 309, date: '2026-03-09', uid: 3, url: 'https://council.example.invalid/viewer/pdf.do?group=bbs&uid=3' },
  ],
  findings: [
    { id: 'F2025-총무경제-001', year: 2025, com: '총무경제', group: 'g', no: 1, title: '청년정책실무위원회 재가동 검토', body: '재가동하여 주시기 바랍니다.', dept_raw: '청년정책관', dept: '청년정책관', silguk: '부시장 직속', uid: 1, recurring: 'R001' },
    { id: 'F2025-총무경제-002', year: 2025, com: '총무경제', group: 'g', no: 2, title: '시정홍보종합계획 수립', body: '수립하여 주시기 바랍니다.', dept_raw: '홍보기획관', dept: '홍보기획관', silguk: '부시장 직속', uid: 1, recurring: null },
    { id: 'F2025-총무경제-003', year: 2025, com: '총무경제', group: 'g', no: 3, title: '예산 불용 최소화', body: '불용을 줄여 주시기 바랍니다.', dept_raw: '예산법무과', dept: '예산법무과', silguk: '기획경제실', uid: 1, recurring: null },
    { id: 'F2023-총무경제-001', year: 2023, com: '총무경제', group: 'g', no: 7, title: '청년정책실무위원회 재가동 요구', body: '운영하여 주시기 바람.', dept_raw: '청년정책관', dept: '청년정책관', silguk: '부시장 직속', uid: 2, recurring: 'R001' },
  ],
  recurring: [{ id: 'R001', dept: '청년정책관', years: [2023, 2025], finding_ids: ['F2023-총무경제-001', 'F2025-총무경제-001'], common: ['재가동', '청년정책실무위원회'] }],
  promises: [
    { id: 'P309-01-01-01', session: 309, date: '2026-03-09', topic: '청년정책', question: '청년정책실무위원회 재가동 계획은?', commitments: ['하반기 중 재구성하여 운영할 계획임.'], uid: 3, dept: '청년정책관', dept_basis: ['청년정책'], dept_guess: true },
    { id: 'P309-01-01-02', session: 309, date: '2026-03-09', topic: '기타', question: '날씨는?', commitments: ['노력하겠음.'], uid: 3, dept: '미상', dept_basis: [], dept_guess: true },
  ],
  expenditure: {
    '청년정책관': [{ year: 2024, budget: 100, spent: 80, mended: true }, { year: 2025, budget: 200, spent: 150, mended: false }, { year: 2026, budget: 300, spent: 10, mended: false }],
    '홍보기획관': [{ year: 2025, budget: 50, spent: 50, mended: false }],
  },
  depts: [
    { name: '청년정책관', silguk: '부시장 직속', aliases: ['청년정책담당관'], current: true },
    { name: '홍보기획관', silguk: '부시장 직속', aliases: [], current: true },
    { name: '예산법무과', silguk: '기획경제실', aliases: ['예산과'], current: true },
    { name: '가족여성과', silguk: '기타', aliases: [], current: false },
  ],
  committees: [{ name: '기획행정위원회', depts: ['예산법무과', '청년정책관'] }],
  unassigned: [],
  council: { exec_low: 60, exec_high: 100 },
};
