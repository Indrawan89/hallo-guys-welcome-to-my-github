// transducer.ts — WASM SIMD CSV transducer for csv-reader-speed-01-run-20261121.
//
// Written by hand in AssemblyScript (this session), compiled with:
//   asc transducer.ts --outFile solver.wasm --runtime stub --enable simd --optimize
//   --initialMemory 1664 --maximumMemory 4096
// (see build.mjs in the entry root for the exact command).
//
// Semantics: an exact port of test/reference.mjs (the naive oracle), verified
// differentially against it. The transducer reads UTF-16 code units (JS string
// semantics, including lone surrogates) and emits the answer JSON text directly.
//
// Memory layout (byte offsets; AS static data lives below 1 MiB):
//   INPUT   1 MiB .. 25 MiB   input text, UTF-16 (max 12M code units)
//   RECBUF 25 MiB .. 49 MiB   per-record field values, UTF-16
//   SPAN   49 MiB .. 57 MiB   span table, 8 bytes/field (byteOff, lenUnits), max 1M fields
//   COLS   57 MiB .. 59 MiB   columns JSON array
//   ERR    59 MiB .. 67 MiB   errors JSON array content (8 MiB; error-heavy sets need it)
//   OUT    67 MiB .. 102 MiB  final answer JSON (UTF-16)
//   NUMBUF 102 MiB            scratch for number formatting
// If any region overflows, the module traps (unreachable) and the JS driver
// falls back to the JS solver for that case — correctness over speed.
//
// ABI: run(inLen: i32, header: i32): i32 — input already written at INPUT as
// UTF-16; returns output length in code units; output at outBase() (bytes).

const MIB: usize = 1024 * 1024;
const IN_BASE: usize = 1 * MIB;
const REC_BASE: usize = 25 * MIB;
const SPAN_BASE: usize = 49 * MIB;
const COLS_BASE: usize = 57 * MIB;
const COLS_END: usize = 59 * MIB;
const ERR_BASE: usize = 59 * MIB;
const ERR_END: usize = 67 * MIB;
const OUT_BASE: usize = 67 * MIB;
const OUT_END: usize = 147 * MIB;
const NUMBUF: usize = 147 * MIB;
const MAX_SPANS: i32 = 1000000;

// SIMD splats (hoisted constants)
const SPLAT_COMMA = i16x8.splat(44);
const SPLAT_QUOTE = i16x8.splat(34);
const SPLAT_LF = i16x8.splat(10);
const SPLAT_CR = i16x8.splat(13);
const SPLAT_BSLASH = i16x8.splat(92);
const SPLAT_FFE0 = i16x8.splat(-32); // 0xFFE0 as i16
const SPLAT_ZERO = i16x8.splat(0);

// ---- parser state ----
let INLEN: i32 = 0;
let I: i32 = 0;            // cursor, code units
let LINE: i32 = 1;
let RECLINE: i32 = 1;
let WIDTH: i32 = -1;
let FIRST: bool = true;
let HEADER: bool = false;
let ROWCOUNT: i32 = 0;     // rows emitted so far
let OUTP: usize = 0;
let COLSP: usize = 0;
let ERRP: usize = 0;
let RECP: usize = 0;       // RECBUF append cursor (bytes)
let NSPAN: i32 = 0;
let ROWS_EMITTED: i32 = 0;
let ERRS_EMITTED: i32 = 0;

// ---- low-level emit helpers (cursor in, new cursor out) ----
function eU(p: usize, c: i32): usize {
  store<u16>(p, c);
  return p + 2;
}
function eRaw(p: usize, src: usize, len: i32): usize {
  if (len > 0) memory.copy(p, src, <usize>(len << 1));
  return p + <usize>(len << 1);
}
function eLit(p: usize, s: string): usize {
  for (let k = 0; k < s.length; k++) p = eU(p, s.charCodeAt(k));
  return p;
}
function eNum(p: usize, v: i32): usize {
  if (v == 0) return eU(p, 48);
  let q = NUMBUF + 32;
  let x = v;
  while (x > 0) {
    q -= 2;
    store<u16>(q, 48 + (x % 10));
    x = (x / 10) | 0;
  }
  const len = <i32>((NUMBUF + 32 - q) >> 1);
  return eRaw(p, q, len);
}
function hexDigit(d: i32): i32 {
  return "0123456789abcdef".charCodeAt(d);
}

// ---- SIMD finders: first interesting unit at/after p, or INLEN ----
function findDelim(p: i32): i32 {
  // ',' | LF | CR
  let q = p;
  const lim = INLEN - 8;
  while (q <= lim) {
    const v = v128.load(IN_BASE + <usize>(q << 1));
    const m = v128.or(v128.or(i16x8.eq(v, SPLAT_COMMA), i16x8.eq(v, SPLAT_LF)), i16x8.eq(v, SPLAT_CR));
    const b = i16x8.bitmask(m);
    if (b != 0) return q + ctz<i32>(b);
    q += 8;
  }
  while (q < INLEN) {
    const c = load<u16>(IN_BASE + <usize>(q << 1));
    if (c == 44 || c == 10 || c == 13) return q;
    q++;
  }
  return INLEN;
}
function findQuote(p: i32): i32 {
  // '"' | LF | CR
  let q = p;
  const lim = INLEN - 8;
  while (q <= lim) {
    const v = v128.load(IN_BASE + <usize>(q << 1));
    const m = v128.or(v128.or(i16x8.eq(v, SPLAT_QUOTE), i16x8.eq(v, SPLAT_LF)), i16x8.eq(v, SPLAT_CR));
    const b = i16x8.bitmask(m);
    if (b != 0) return q + ctz<i32>(b);
    q += 8;
  }
  while (q < INLEN) {
    const c = load<u16>(IN_BASE + <usize>(q << 1));
    if (c == 34 || c == 10 || c == 13) return q;
    q++;
  }
  return INLEN;
}

// ---- JSON string emission from a RECBUF span (byteOff, lenUnits) ----
function needsEscape(byteOff: usize, len: i32): bool {
  let q = 0;
  const lim = len - 8;
  while (q <= lim) {
    const v = v128.load(byteOff + <usize>(q << 1));
    let m = v128.or(i16x8.eq(v, SPLAT_QUOTE), i16x8.eq(v, SPLAT_BSLASH));
    m = v128.or(m, i16x8.eq(v128.and(v, SPLAT_FFE0), SPLAT_ZERO));
    if (i16x8.bitmask(m) != 0) return true;
    q += 8;
  }
  while (q < len) {
    const c = load<u16>(byteOff + <usize>(q << 1));
    if (c == 34 || c == 92 || c < 0x20) return true;
    q++;
  }
  return false;
}
function eJsonStr(p: usize, byteOff: usize, len: i32): usize {
  p = eU(p, 34); // "
  if (len > 0) {
    if (!needsEscape(byteOff, len)) {
      p = eRaw(p, byteOff, len);
    } else {
      let q = byteOff;
      const end = byteOff + <usize>(len << 1);
      while (q < end) {
        const c = load<u16>(q);
        q += 2;
        if (c == 34) { p = eU(p, 92); p = eU(p, 34); }
        else if (c == 92) { p = eU(p, 92); p = eU(p, 92); }
        else if (c == 10) { p = eU(p, 92); p = eU(p, 110); }
        else if (c == 13) { p = eU(p, 92); p = eU(p, 114); }
        else if (c == 9) { p = eU(p, 92); p = eU(p, 116); }
        else if (c == 8) { p = eU(p, 92); p = eU(p, 98); }
        else if (c == 12) { p = eU(p, 92); p = eU(p, 102); }
        else if (c < 0x20) {
          p = eLit(p, "\\u00");
          p = eU(p, hexDigit(c >> 4));
          p = eU(p, hexDigit(c & 15));
        } else p = eU(p, c);
      }
    }
  }
  p = eU(p, 34); // "
  return p;
}

// ---- errors (row = -1 means null) ----
function rowOf(): i32 {
  if (FIRST && HEADER) return -1;
  return ROWCOUNT;
}
function emitErr(code: string, line: i32, row: i32): void {
  if (ERRP >= ERR_END - 512) unreachable(); // region full -> JS fallback
  if (ERRS_EMITTED > 0) ERRP = eU(ERRP, 44);
  ERRS_EMITTED++;
  ERRP = eLit(ERRP, '{"code":"');
  ERRP = eLit(ERRP, code);
  ERRP = eLit(ERRP, '","line":');
  ERRP = eNum(ERRP, line);
  ERRP = eLit(ERRP, ',"row":');
  if (row < 0) ERRP = eLit(ERRP, 'null');
  else ERRP = eNum(ERRP, row);
  ERRP = eU(ERRP, 125);
}

// ---- field parsing: sets F_OFF/F_LEN (absolute byte address + length in code
// units of the transformed value), leaves I at the terminator.
// Clean fields point straight into the input (no copy); only transformed
// fields (stray CRs dropped, "" folded, CR/LF normalised, junk appended)
// materialise in RECBUF. ----
let F_OFF: usize = 0;
let F_LEN: i32 = 0;

function appendUnquoted(p: i32): i32 {
  // Appends an unquoted field value starting at p to RECBUF (dropping stray
  // CRs, each reported); returns the end position (at ',' / LF / CRLF / EOF).
  let q = p;
  for (;;) {
    const d = findDelim(q);
    if (d >= INLEN) {
      RECP = eRaw(RECP, IN_BASE + <usize>(q << 1), INLEN - q);
      return INLEN;
    }
    const c = load<u16>(IN_BASE + <usize>(d << 1));
    if (c == 44 || c == 10) {
      RECP = eRaw(RECP, IN_BASE + <usize>(q << 1), d - q);
      return d;
    }
    if (c == 13 && d + 1 < INLEN && load<u16>(IN_BASE + <usize>((d + 1) << 1)) == 10) {
      RECP = eRaw(RECP, IN_BASE + <usize>(q << 1), d - q);
      return d;
    }
    emitErr("stray_cr", RECLINE, rowOf());
    RECP = eRaw(RECP, IN_BASE + <usize>(q << 1), d - q);
    q = d + 1;
  }
  return -1; // unreachable
}

function parseUnquotedField(): void {
  let p = I;
  let segStart = I;
  let dirty = false;
  let outStart: usize = 0;
  for (;;) {
    const d = findDelim(p);
    if (d >= INLEN) {
      if (!dirty) { F_OFF = IN_BASE + <usize>(segStart << 1); F_LEN = INLEN - segStart; }
      else { RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), INLEN - segStart); F_OFF = outStart; F_LEN = <i32>((RECP - outStart) >> 1); }
      I = INLEN;
      return;
    }
    const c = load<u16>(IN_BASE + <usize>(d << 1));
    if (c == 44 || c == 10) {
      if (!dirty) { F_OFF = IN_BASE + <usize>(segStart << 1); F_LEN = d - segStart; }
      else { RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), d - segStart); F_OFF = outStart; F_LEN = <i32>((RECP - outStart) >> 1); }
      I = d;
      return;
    }
    if (c == 13 && d + 1 < INLEN && load<u16>(IN_BASE + <usize>((d + 1) << 1)) == 10) {
      if (!dirty) { F_OFF = IN_BASE + <usize>(segStart << 1); F_LEN = d - segStart; }
      else { RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), d - segStart); F_OFF = outStart; F_LEN = <i32>((RECP - outStart) >> 1); }
      I = d;
      return;
    }
    // stray CR: error + drop, field continues; value materialises in RECBUF
    emitErr("stray_cr", RECLINE, rowOf());
    if (!dirty) { dirty = true; outStart = RECP; }
    RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), d - segStart);
    p = d + 1;
    segStart = p;
  }
}

function parseQuotedField(): void {
  // I is at the opening '"'. Leaves I at ',' / LF / CRLF / EOF.
  const fStart = RECP;
  const contentStart = I + 1;
  let p = I + 1;
  let segStart = p;
  let delta = 0;
  let dirty = false;
  let closed = -1;
  for (;;) {
    const q = findQuote(p);
    if (q >= INLEN) break; // unterminated
    const c = load<u16>(IN_BASE + <usize>(q << 1));
    if (c == 34) {
      if (q + 1 < INLEN && load<u16>(IN_BASE + <usize>((q + 1) << 1)) == 34) {
        // doubled quote: one literal quote
        if (!dirty) dirty = true;
        RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), q - segStart);
        RECP = eU(RECP, 34);
        p = q + 2;
        segStart = p;
        continue;
      }
      // closing quote
      if (dirty) RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), q - segStart);
      closed = q;
      break;
    }
    if (c == 10) {
      // LF inside quotes: kept as \n, counts as a line
      if (!dirty) dirty = true;
      RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), q - segStart + 1);
      delta++;
      p = q + 1;
      segStart = p;
      continue;
    }
    // CR inside quotes -> single \n
    if (!dirty) dirty = true;
    RECP = eRaw(RECP, IN_BASE + <usize>(segStart << 1), q - segStart);
    RECP = eU(RECP, 10);
    delta++;
    if (q + 1 < INLEN && load<u16>(IN_BASE + <usize>((q + 1) << 1)) == 10) p = q + 2;
    else p = q + 1;
    segStart = p;
  }
  if (closed == -1) {
    // Unterminated: opening quote is literal, rest re-read as unquoted.
    emitErr("unterminated_quote", RECLINE, rowOf());
    RECP = fStart; // discard what was written for this field
    RECP = eU(RECP, 34); // literal "
    I = I + 1;
    I = appendUnquoted(I);
    F_OFF = fStart;
    F_LEN = <i32>((RECP - fStart) >> 1);
    return;
  }
  LINE += delta;
  // Junk after the closing quote?
  const nc = closed + 1 < INLEN ? load<u16>(IN_BASE + <usize>((closed + 1) << 1)) : -1;
  const hasJunk = nc != -1 && nc != 44 && nc != 10 && !(nc == 13 && closed + 2 < INLEN && load<u16>(IN_BASE + <usize>((closed + 2) << 1)) == 10);
  if (hasJunk) {
    if (!dirty) {
      // materialise the clean content in RECBUF so junk can append to it
      RECP = eRaw(RECP, IN_BASE + <usize>(contentStart << 1), closed - contentStart);
      dirty = true;
    }
    const junkStart = RECP;
    I = appendUnquoted(closed + 1);
    if (RECP > junkStart) emitErr("quote_junk", RECLINE, rowOf());
    F_OFF = fStart;
    F_LEN = <i32>((RECP - fStart) >> 1);
    return;
  }
  I = closed + 1;
  if (!dirty) {
    F_OFF = IN_BASE + <usize>(contentStart << 1);
    F_LEN = closed - contentStart;
  } else {
    F_OFF = fStart;
    F_LEN = <i32>((RECP - fStart) >> 1);
  }
}

function parseField(): void {
  if (I < INLEN && load<u16>(IN_BASE + <usize>(I << 1)) == 34) {
    parseQuotedField();
  } else {
    parseUnquotedField();
  }
  // record span (absolute byte address, length in code units)
  if (NSPAN >= MAX_SPANS) unreachable();
  store<u32>(SPAN_BASE + <usize>(NSPAN * 8), <u32>F_OFF);
  store<u32>(SPAN_BASE + <usize>(NSPAN * 8) + 4, <u32>F_LEN);
  NSPAN++;
}

// ---- record parsing: fills spans, returns false for a skipped (single empty unquoted) record ----
function parseRecordSpans(): bool {
  RECLINE = LINE;
  const firstQuoted = load<u16>(IN_BASE + <usize>(I << 1)) == 34;
  NSPAN = 0;
  RECP = REC_BASE;
  let more = true;
  while (more) {
    parseField();
    if (I < INLEN && load<u16>(IN_BASE + <usize>(I << 1)) == 44) {
      I++;
    } else {
      more = false;
    }
  }
  if (I < INLEN && load<u16>(IN_BASE + <usize>(I << 1)) == 10) {
    I++;
    LINE++;
  } else if (I < INLEN && load<u16>(IN_BASE + <usize>(I << 1)) == 13) {
    I += 2; // CRLF (a lone CR cannot be left here)
    LINE++;
  }
  if (NSPAN == 1) {
    const len0 = load<u32>(SPAN_BASE + 4);
    if (len0 == 0 && !firstQuoted) return false; // no record
  }
  return true;
}

// ---- record emission ----
function emitFields(p: usize, from: i32, count: i32, end: usize): usize {
  p = eU(p, 91); // [
  for (let k = 0; k < count; k++) {
    if (k > 0) p = eU(p, 44);
    if (p >= end - 4096) unreachable(); // region full -> JS fallback
    const off = load<u32>(SPAN_BASE + <usize>((from + k) * 8));
    const len = load<u32>(SPAN_BASE + <usize>((from + k) * 8) + 4);
    p = eJsonStr(p, <usize>off, <i32>len);
  }
  p = eU(p, 93); // ]
  return p;
}
function emitRow(p: usize, from: i32, count: i32, pad: i32): usize {
  if (ROWS_EMITTED > 0) p = eU(p, 44);
  p = eU(p, 91);
  const total = count + pad;
  for (let k = 0; k < total; k++) {
    if (k > 0) p = eU(p, 44);
    if (p >= OUT_END - 4096) unreachable(); // region full -> JS fallback
    if (k < count) {
      const off = load<u32>(SPAN_BASE + <usize>((from + k) * 8));
      const len = load<u32>(SPAN_BASE + <usize>((from + k) * 8) + 4);
      p = eJsonStr(p, <usize>off, <i32>len);
    } else {
      p = eU(p, 34);
      p = eU(p, 34); // ""
    }
  }
  p = eU(p, 93);
  ROWS_EMITTED++;
  ROWCOUNT++;
  return p;
}
function finishRecord(): void {
  if (ERRP >= ERR_END - 4096) unreachable(); // errors region full -> JS fallback
  if (NSPAN < WIDTH) {
    // short_row
    if (ERRS_EMITTED > 0) ERRP = eU(ERRP, 44);
    ERRS_EMITTED++;
    ERRP = eLit(ERRP, '{"code":"short_row","line":');
    ERRP = eNum(ERRP, RECLINE);
    ERRP = eLit(ERRP, ',"row":');
    ERRP = eNum(ERRP, ROWCOUNT);
    ERRP = eLit(ERRP, ',"fields":');
    ERRP = eNum(ERRP, NSPAN);
    ERRP = eU(ERRP, 125);
    OUTP = emitRow(OUTP, 0, NSPAN, WIDTH - NSPAN);
  } else if (NSPAN > WIDTH) {
    // long_row: extra = cut fields
    if (ERRS_EMITTED > 0) ERRP = eU(ERRP, 44);
    ERRS_EMITTED++;
    ERRP = eLit(ERRP, '{"code":"long_row","line":');
    ERRP = eNum(ERRP, RECLINE);
    ERRP = eLit(ERRP, ',"row":');
    ERRP = eNum(ERRP, ROWCOUNT);
    ERRP = eLit(ERRP, ',"extra":');
    ERRP = emitFields(ERRP, WIDTH, NSPAN - WIDTH, ERR_END);
    ERRP = eU(ERRP, 125);
    OUTP = emitRow(OUTP, 0, WIDTH, 0);
  } else {
    OUTP = emitRow(OUTP, 0, NSPAN, 0);
  }
}
function parseRest(): void {
  while (I < INLEN) {
    const c = load<u16>(IN_BASE + <usize>(I << 1));
    if (c == 10) { I++; LINE++; continue; }
    if (c == 13 && I + 1 < INLEN && load<u16>(IN_BASE + <usize>((I + 1) << 1)) == 10) { I += 2; LINE++; continue; }
    if (!parseRecordSpans()) continue;
    finishRecord();
  }
}

// ---- entry point ----
export function outBase(): i32 {
  return <i32>OUT_BASE;
}
export function inBase(): i32 {
  return <i32>IN_BASE;
}
export function run(inLen: i32, header: i32): i32 {
  INLEN = inLen;
  HEADER = header != 0;
  I = 0;
  LINE = 1;
  WIDTH = -1;
  FIRST = true;
  ROWCOUNT = 0;
  ROWS_EMITTED = 0;
  ERRS_EMITTED = 0;
  OUTP = OUT_BASE;
  COLSP = COLS_BASE;
  ERRP = ERR_BASE;
  if (INLEN > 0 && load<u16>(IN_BASE) == 0xFEFF) I = 1;

  OUTP = eLit(OUTP, '{"columns":');
  // find the first record
  let have = false;
  while (I < INLEN) {
    const c = load<u16>(IN_BASE + <usize>(I << 1));
    if (c == 10) { I++; LINE++; continue; }
    if (c == 13 && I + 1 < INLEN && load<u16>(IN_BASE + <usize>((I + 1) << 1)) == 10) { I += 2; LINE++; continue; }
    if (parseRecordSpans()) { have = true; break; }
  }
  if (!have) {
    OUTP = HEADER ? eLit(OUTP, '[]') : eLit(OUTP, 'null');
    OUTP = eLit(OUTP, ',"rows":[],"errors":[');
    if (OUTP + (ERRP - ERR_BASE) >= OUT_END) unreachable();
    OUTP = eRaw(OUTP, ERR_BASE, <i32>((ERRP - ERR_BASE) >> 1));
    OUTP = eLit(OUTP, ']}');
    return <i32>((OUTP - OUT_BASE) >> 1);
  }
  WIDTH = NSPAN;
  FIRST = false;
  if (HEADER) {
    COLSP = emitFields(COLSP, 0, NSPAN, COLS_END);
    OUTP = eRaw(OUTP, COLS_BASE, <i32>((COLSP - COLS_BASE) >> 1));
    OUTP = eLit(OUTP, ',"rows":[');
  } else {
    OUTP = eLit(OUTP, 'null,"rows":[');
    OUTP = emitRow(OUTP, 0, NSPAN, 0);
  }
  parseRest();
  OUTP = eLit(OUTP, '],"errors":[');
  if (OUTP + (ERRP - ERR_BASE) >= OUT_END) unreachable();
  OUTP = eRaw(OUTP, ERR_BASE, <i32>((ERRP - ERR_BASE) >> 1));
  OUTP = eLit(OUTP, ']}');
  return <i32>((OUTP - OUT_BASE) >> 1);
}

