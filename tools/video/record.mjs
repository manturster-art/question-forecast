// 역할: 녹화판 HTML(work/video/녹화판.html)을 Edge 헤드리스로 열고 CDP(원격 디버깅)로 scenario.json 의
// 장면을 차례로 실행하면서 Page.startScreencast 프레임(jpeg)을 타임스탬프와 함께 저장한다.
// 네트워크는 쓰지 않는다 — 127.0.0.1 의 디버깅 포트와 file:// 페이지뿐이다. 다운로드 단추는 누르지 않는다.
// 「웹 요청은 dcc/http.py(curl.exe)만」 규칙은 바깥 사이트에 대한 것이다. 여기 fetch·WebSocket 은 이 PC 안
// 루프백(127.0.0.1)의 Edge 디버깅 포트에만 붙으므로 그 규칙 밖이다(바깥 주소로는 아무것도 보내지 않는다).
// 멈춤 방지: 모든 CDP 호출에 시간 제한(기본 30초, 장면 단계 120초)을 두어 넘으면 실패시키고, 끝·오류·Ctrl+C
// 어느 경우든 cleanup() 이 Edge 를 끄고 임시 프로필을 지운다.
// 쓰임: node tools/video/record.mjs <녹화판.html> <scenario.json> <출력 폴더>
//   출력: <출력 폴더>/frames/NNNNNN.jpg, <출력 폴더>/frames.json(프레임·장면 시각·잰 분),
//         <출력 폴더>/demo_actions.csv(첨부 장면에 쓴 가짜 조치 CSV — 커밋하지 않음)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync, readdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE_CANDIDATES = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const W = 1280, H = 800;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [htmlArg, scenarioArg, outArg] = process.argv.slice(2);
if (!htmlArg || !scenarioArg || !outArg) {
  console.error('쓰임: node record.mjs <녹화판.html> <scenario.json> <출력 폴더>');
  process.exit(2);
}
// 자막의 {{지자체}} 는 config/region.json 의 지자체명으로 채운다(최종 검토 Minor 7 — 다른 지자체도 대본을 그대로 쓴다).
const REGION = JSON.parse(readFileSync(new URL('../../config/region.json', import.meta.url), 'utf8'));
const scenario = JSON.parse(readFileSync(scenarioArg, 'utf8').replaceAll('{{지자체}}', REGION['지자체명']));
const outDir = resolve(outArg);
const framesDir = join(outDir, 'frames');
// 지난 프레임 지우기. fs.rmSync 는 한글 경로에서 Node 24(Windows)가 조용히 죽어서 파일을 하나씩 지운다.
mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) unlinkSync(join(framesDir, f));

const edge = process.env.EDGE || EDGE_CANDIDATES.find(p => existsSync(p));
if (!edge) { console.error('Edge 를 찾지 못했습니다'); process.exit(3); }
const profile = mkdtempSync(join(tmpdir(), 'dcc-rec-'));
const proc = spawn(edge, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
  '--disable-background-networking', '--disable-component-update', 'about:blank'], { stdio: 'ignore' });

async function devtoolsPort() {
  // --remote-debugging-port=0 이면 Edge 가 고른 포트를 프로필 폴더의 DevToolsActivePort 에 적는다.
  const f = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    if (existsSync(f)) { const p = readFileSync(f, 'utf8').split('\n')[0].trim(); if (p) return Number(p); }
    await sleep(100);
  }
  throw new Error('DevToolsActivePort 를 찾지 못했습니다');
}

let ws, nextId = 1;
const waiting = new Map();
const handlers = {};
const CALL_MS = 30000, STEP_MS = 120000;
function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('시간 초과(' + ms / 1000 + '초): ' + label)), ms); })])
    .finally(() => clearTimeout(t));
}
function send(method, params, ms) {
  const id = nextId++;
  const p = new Promise((res, rej) => waiting.set(id, { res, rej, method }));
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return withTimeout(p, ms || CALL_MS, method).finally(() => waiting.delete(id));
}
async function evaluate(expr, ms) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, ms);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('페이지 실행 오류: ' + ((d.exception && d.exception.description) || d.text));
  }
  return r.result.value;
}

const frames = [];
const writes = [];
let frameNo = 0;

async function main() {
  const port = await devtoolsPort();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    page = list.find(t => t.type === 'page');
    if (!page) await sleep(100);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await withTimeout(new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }), CALL_MS, 'WebSocket 연결');
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id); waiting.delete(m.id);
      if (m.error) w.rej(new Error(w.method + ': ' + m.error.message)); else w.res(m.result);
    } else if (m.method && handlers[m.method]) handlers[m.method](m.params);
  };
  handlers['Page.screencastFrame'] = p => {
    const file = String(++frameNo).padStart(6, '0') + '.jpg';
    frames.push({ file, t: p.metadata.timestamp, w: p.metadata.deviceWidth, h: p.metadata.deviceHeight });
    writes.push(writeFile(join(framesDir, file), Buffer.from(p.data, 'base64')));
    send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: pathToFileURL(resolve(htmlArg)).href });
  for (let i = 0; i < 300; i++) {
    const ok = await evaluate("document.readyState === 'complete' && !!window.REC && document.body.dataset.ready === '0' && !!document.getElementById('dept-q') && !!document.getElementById('start-q')").catch(() => false);
    if (ok) break;
    await sleep(100);
  }
  const theme = await evaluate("matchMedia('(prefers-color-scheme: light)').matches");
  const size = await evaluate('[innerWidth, innerHeight]');

  const scenes = [];
  let started = false;
  for (const sc of scenario.scenes) {
    let minutes = null;
    if (sc.endCard) {
      const a = scenes.find(s => s.no === scenario.measure.from), b = scenes.find(s => s.no === scenario.measure.to);
      minutes = Math.ceil((b.end - a.start) / 60);
    }
    for (const step of sc.pre || []) await evaluate(`(async () => { ${step} })()`, STEP_MS);
    if (!started) {
      // 표지를 먼저 그려 둔 뒤 화면 받기를 시작한다(첫 프레임이 표지).
      await sleep(400);
      await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
      started = true;
    }
    const start = Date.now() / 1000;
    if (sc.caption !== undefined) await evaluate(`REC.caption(${JSON.stringify(sc.caption)}, ${JSON.stringify(sc.sub || '')})`);
    if (sc.endCard) await evaluate(`REC.endCard(${minutes})`);
    for (const step of sc.steps || []) await evaluate(`(async () => { ${step} })()`, STEP_MS);
    const left = sc.seconds * 1000 - (Date.now() / 1000 - start) * 1000;
    if (left > 0) await sleep(left);
    const end = Date.now() / 1000;
    scenes.push({ no: sc.no, name: sc.name, start, end, seconds: Math.round((end - start) * 100) / 100, minutes });
    console.log(`장면 ${sc.no} ${sc.name}: ${(end - start).toFixed(1)}초` + (minutes ? ` (끝 화면 ${minutes}분)` : ''));
  }
  const extra = await evaluate('({ copyMsg: window.__copyMsg || null, stub: !!window.__clipboardStub, csv: window.__demoCsv || null, applied: window.__applied || null })');
  await send('Page.stopScreencast');
  const end = Date.now() / 1000;
  await sleep(200);
  await Promise.all(writes);
  if (extra.csv) writeFileSync(join(outDir, 'demo_actions.csv'), extra.csv, 'utf8');
  const a = scenes.find(s => s.no === scenario.measure.from), b = scenes.find(s => s.no === scenario.measure.to);
  const measured = b.end - a.start;
  const result = { frames, end, scenes, theme, viewport: size, measure: scenario.measure,
    measuredSeconds: Math.round(measured * 100) / 100, minutes: Math.ceil(measured / 60),
    copyMsg: extra.copyMsg, clipboardStub: extra.stub, applied: extra.applied };
  writeFileSync(join(outDir, 'frames.json'), JSON.stringify(result, null, 1), 'utf8');
  console.log(`프레임 ${frames.length}개, 녹화 ${(end - scenes[0].start).toFixed(1)}초, 3~8 장면 ${measured.toFixed(1)}초 → ${result.minutes}분`);
  console.log('복사 안내: ' + extra.copyMsg + (extra.stub ? ' (녹화판 클립보드 대체 사용)' : ''));
  try { await send('Browser.close', {}, 3000); } catch (e) { /* 닫히는 중 */ }
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws && ws.close(); } catch (e) { /* 이미 닫힘 */ }
  try { proc.kill(); } catch (e) { /* 이미 닫힘 */ }
  // Edge 가 프로필 파일을 놓을 때까지 잠깐 기다렸다 지운다(동기 — 종료 신호 처리 안에서도 쓰므로).
  const until = Date.now() + 1500;
  for (;;) {
    try { rmSync(profile, { recursive: true, force: true }); break; } catch (e) { if (Date.now() > until) break; }
  }
}
process.on('SIGINT', () => { console.error('중단(Ctrl+C) — Edge 를 끕니다'); cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('uncaughtException', e => { console.error(e && e.stack || e); cleanup(); process.exit(1); });
process.on('unhandledRejection', e => { console.error(e && e.stack || e); cleanup(); process.exit(1); });

main().then(() => {}, e => { console.error(e && e.stack || e); process.exitCode = 1; })
  .finally(async () => { await sleep(500); cleanup(); });
