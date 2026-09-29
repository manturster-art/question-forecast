// kordoc dist 가 Node 내장 모듈에서 가져오는 이름을 모아, 부르면 오류를 내는 빈 shim 을 만든다.
// 판이 바뀌면 가져오는 이름이 바뀌므로 손으로 적지 않고 매번 만든다.
import fs from 'fs'; import path from 'path';
const dist = process.argv[2];
const BUILTIN = /^(node:)?(fs|fs\/promises|os|path|url|crypto|util|events|http|https|worker_threads|child_process)$/;
const names = new Set();
for (const f of fs.readdirSync(dist).filter(f => f.endsWith('.js'))) {
  const t = fs.readFileSync(path.join(dist, f), 'utf8');
  for (const m of t.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    if (!BUILTIN.test(m[2])) continue;
    for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/)[0]; if (k) names.add(k); }
  }
}
const special = { existsSync: '()=>false', platform: "()=>'browser'", dirname: 'p=>p',
  join: "(...a)=>a.join('/')", resolve: "(...a)=>a.join('/')", fileURLToPath: 'u=>String(u)',
  homedir: "()=>'/'", tmpdir: "()=>'/'" };
let out = "const T=()=>{throw new Error('node-only')};\n";
for (const n of [...names].sort()) out += `export const ${n}=${special[n] || 'T'};\n`;
out += 'export default {};\n';
fs.writeFileSync(new URL('./shims/empty.js', import.meta.url), out);
console.log('empty shim', names.size, 'names');
