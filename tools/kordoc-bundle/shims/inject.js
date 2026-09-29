import { Buffer } from 'buffer';
export { Buffer };
export const process = { env: {}, platform: 'browser', versions: {}, cwd: () => '/',
  nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)) };
