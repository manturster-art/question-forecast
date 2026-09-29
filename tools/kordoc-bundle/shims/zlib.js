import pako from 'pako'; import { Buffer } from 'buffer';
const B = u => Buffer.from(u.buffer, u.byteOffset, u.byteLength);
export const inflateRawSync = d => B(pako.inflateRaw(d));
export const inflateSync = d => B(pako.inflate(d));
export const deflateRawSync = d => B(pako.deflateRaw(d));
export const deflateSync = d => B(pako.deflate(d));
export default { inflateRawSync, inflateSync, deflateRawSync, deflateSync };
