// 역할: 모션그래픽 장면(work/motion/scene.html)을 Edge 헤드리스로 열고 CDP 로 window.seek(t) 를 부른 뒤
// 한 프레임씩 PNG 로 받는다. 시계에 기대지 않으므로(결정적) 느린 PC 에서도 같은 영상이 나온다.
// 네트워크는 쓰지 않는다 — 127.0.0.1 디버깅 포트와 file:// 페이지뿐이다.
// 주의: 이 PC 에서는 Git Bash 에서 띄운 헤드리스 Edge 가 아무 일도 하지 않는다. PowerShell 에서 돌린다.
// 쓰임: node tools/motion/capture.mjs <scene.html> <출력 폴더> [--fps 60] [--times 1.2,3.4]
//   --times 가 있으면 그 시각들만 t_<초>.png 로, 없으면 0..SCENE_DUR 전체를 000000.png… 로 받는다.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE_CANDIDATES = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const W = 1920, H = 1080;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const [htmlArg, outArg] = args;
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
if (!htmlArg || !outArg) { console.error('쓰임: node capture.mjs <scene.html> <출력 폴더> [--fps 60] [--times a,b]'); process.exit(2); }
const fps = Number(opt('--fps') || 60);
const times = opt('--times') ? opt('--times').split(',').map(Number) : null;
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });
if (!times) for (const f of readdirSync(outDir)) if (/^\d{6}\.png$/.test(f)) unlinkSync(join(outDir, f));

const edge = process.env.EDGE || EDGE_CANDIDATES.find(p => existsSync(p));
if (!edge) { console.error('Edge 를 찾지 못했습니다'); process.exit(3); }
const profile = mkdtempSync(join(tmpdir(), 'dcc-motion-'));
const proc = spawn(edge, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
  '--disable-background-networking', '--disable-component-update', '--allow-file-access-from-files',
  '--font-render-hinting=none', 'about:blank'], { stdio: 'ignore' });

let ws, nextId = 1;
const waiting = new Map();
function send(method, params, ms = 60000) {
  const id = nextId++;
  const p = new Promise((res, rej) => waiting.set(id, { res, rej, method }));
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  let tm;
  return Promise.race([p, new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('시간 초과: ' + method)), ms); })])
    .finally(() => { clearTimeout(tm); waiting.delete(id); });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('페이지 오류: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text));
  return r.result.value;
}

async function main() {
  const f = join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 200 && !port; i++) {
    if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0].trim()) || undefined;
    if (!port) await sleep(100);
  }
  if (!port) throw new Error('DevToolsActivePort 없음 — Edge 가 뜨지 않았습니다(PowerShell 에서 돌리십시오)');
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    page = list.find(t => t.type === 'page');
    if (!page) await sleep(100);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); if (m.error) w.rej(new Error(w.method + ': ' + m.error.message)); else w.res(m.result); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(resolve(htmlArg)).href });
  let ok = false;
  for (let i = 0; i < 300 && !ok; i++) { ok = await evaluate('!!window.SCENE_READY').catch(() => false); if (!ok) await sleep(100); }
  if (!ok) throw new Error('장면이 준비되지 않았습니다(SCENE_READY)');
  const fonts = await evaluate('window.SCENE_FONTS');
  console.log('글꼴: ' + fonts.join(', '));
  const dur = await evaluate('window.SCENE_DUR');
  const list = times || Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  const t0 = Date.now();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    await evaluate(`window.seek(${t})`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, captureBeyondViewport: false });
    const name = times ? `t_${t.toFixed(2).padStart(5, '0')}.png` : String(i).padStart(6, '0') + '.png';
    writeFileSync(join(outDir, name), Buffer.from(shot.data, 'base64'));
    if (!times && i % 120 === 0) console.log(`${i}/${list.length} 프레임 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  }
  console.log(`끝: ${list.length}장, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  try { await send('Browser.close', {}, 3000); } catch (e) { /* 닫히는 중 */ }
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws && ws.close(); } catch (e) { /* */ }
  try { proc.kill(); } catch (e) { /* */ }
  const until = Date.now() + 1500;
  for (;;) { try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { if (Date.now() > until) break; } }
}
process.on('SIGINT', () => { cleanup(); process.exit(130); });
main().then(() => {}, e => { console.error(e && e.stack || e); process.exitCode = 1; }).finally(async () => { await sleep(300); cleanup(); });
