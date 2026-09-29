import * as CFB from 'cfb';
export const createRequire = () => { const r = n => { if (n === 'cfb') return CFB.default || CFB; throw new Error('no ' + n); };
  r.resolve = n => { throw new Error('no resolve ' + n); }; return r; };
export default { createRequire };
