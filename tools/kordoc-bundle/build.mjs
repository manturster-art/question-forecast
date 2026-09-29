// kordoc 을 브라우저용 IIFE 한 파일로 묶는다. 2026-09-24 스파이크(spec §3.2.1)를 옮긴 것이다.
// 쓰는 법:  cd tools/kordoc-bundle && npm install && node build.mjs
//   청사 망은 npm 이 인증서 오류(SSL 검사)를 낸다. 그때는 청사 밖 망에서 npm install 하거나
//   다른 PC 의 node_modules 를 복사한다. 번들은 저장소에 들어 있으므로 동료 PC 에는 필요 없다.
import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import crypto from 'crypto'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const groot = execSync('npm root -g').toString().trim();
const K = path.join(groot, 'kordoc');
const kver = JSON.parse(fs.readFileSync(path.join(K, 'package.json'), 'utf8')).version;
execSync(`node gen-empty-shim.mjs "${path.join(K, 'dist')}"`, { cwd: here, stdio: 'inherit' });
const S = f => path.join(here, 'shims', f);
const builtins = ['fs', 'fs/promises', 'os', 'path', 'url', 'crypto', 'util', 'events', 'http', 'https', 'worker_threads', 'child_process'];
const alias = { zlib: S('zlib.js'), 'node:zlib': S('zlib.js'), module: S('module.js'), 'node:module': S('module.js'),
  stream: S('stream.js'), 'stream/promises': S('stream.js'), 'node:stream': S('stream.js') };
for (const b of builtins) { alias[b] = S('empty.js'); alias['node:' + b] = S('empty.js'); }
const out = path.resolve(here, '../../vendor/kordoc/kordoc.browser.js');
await esbuild.build({
  entryPoints: [path.join(here, 'entry.js')], bundle: true, format: 'iife', globalName: 'kordoc',
  platform: 'browser', outfile: out, minify: true, logLevel: 'warning',
  nodePaths: [path.join(here, 'node_modules'), path.join(K, 'node_modules'), groot],
  inject: [S('inject.js')], define: { 'import.meta.url': '"file:///kordoc/"' }, alias,
  external: ['@huggingface/transformers', 'onnxruntime-node', 'sharp', '@hyzyla/pdfium', 'puppeteer-core', 'puppeteer', 'canvas', '@napi-rs/canvas'],
});
const buf = fs.readFileSync(out);
const esv = esbuild.version;
fs.writeFileSync(path.resolve(here, '../../vendor/kordoc/VERSION'),
  `kordoc ${kver}\nesbuild ${esv}\nbuilt ${new Date().toISOString().slice(0, 10)}\nsha256 ${crypto.createHash('sha256').update(buf).digest('hex')}\nbytes ${buf.length}\n`);
console.log('wrote', out, buf.length);
