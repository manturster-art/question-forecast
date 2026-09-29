// 역할: 모션그래픽(tools/motion)에 들어갈 숫자를 자료(out/site_data.json)에서 뽑는다.
// 부서 카드 숫자는 화면과 같은 계산(site/js/core.js 의 summarize)을 그대로 불러 쓴다 — 영상과 도구가 어긋나지 않게.
// 쓰임: node tools/motion/stats.mjs <site_data.json> <부서 이름>   → 표준 출력에 JSON
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../site/js/core.js');

const [dataPath, deptName] = process.argv.slice(2);
if (!dataPath || !deptName) {
  console.error('쓰임: node stats.mjs <site_data.json> <부서 이름>');
  process.exit(2);
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const ix = core.index(data);
const dept = ix.depts.get(deptName);
if (!dept) { console.error('부서를 찾지 못했습니다: ' + deptName); process.exit(3); }
const s = core.summarize(ix, { kind: 'dept', name: deptName });

const years = data.findings.map(f => f.year);
const budgetYears = Object.values(data.expenditure).flat().map(e => e.year);
const byId = new Map(data.findings.map(f => [f.id, f]));
// 되풀이 줄기마다 가장 최근 지적 제목을 대표 제목으로 쓴다(화면의 요약 카드와 같은 방식).
const chains = s.recurring.map(r => {
  const fs = r.finding_ids.map(id => byId.get(id)).filter(Boolean).sort((a, b) => a.year - b.year);
  return { years: r.years, title: fs.length ? fs[fs.length - 1].title : '' };
});
const closed = s.expenditure.filter(e => e.year < ix.now && e.budget > 0);

const out = {
  generated: data.generated,
  totals: {
    findings: data.findings.length,
    recurring: data.recurring.length,
    promises: data.promises.length,
    depts: data.depts.length,
    findingYears: [Math.min(...years), Math.max(...years)],
    budgetYears: [Math.min(...budgetYears), Math.max(...budgetYears)],
  },
  dept: {
    name: dept.name,
    silguk: dept.silguk || '',
    findings: s.counts.findings,
    recurring: s.counts.recurring,
    promises: s.counts.guessedPromises,
    execRate: s.counts.execRate,
    execYear: closed.length ? closed[closed.length - 1].year : null,
    chains,
  },
};
process.stdout.write(JSON.stringify(out));
