// solve.js — fast drop-in for csv-reader 1.0.0 (make.fun).
//
// run({ text, header }) -> { columns, rows, errors }
//
// Semantics (from the competition description; see README.md for the
// corner-case decisions where the prose leaves room):
//  * A U+FEFF at the very start is dropped.
//  * A record ends at LF or CRLF; a line left with no characters is no record.
//  * Outside quotes a CR not followed by LF is dropped (error stray_cr).
//  * A field that opens with a quote runs to the next quote that is not
//    doubled ("" inside is one quote); CRLF / lone CR inside it read as LF.
//    What follows the closing quote, up to the next comma or line break, is
//    appended as it stands (error quote_junk, when the field ends).
//  * A quote that never closes is a literal character and the text after it
//    is read again as unquoted (error unterminated_quote).
//  * A quote inside an unquoted field is a literal character.
//  * Fields stay strings, never trimmed or converted.
//  * columns is the first record when header is true, else null; rows are
//    the records after it, each padded (short_row, with fields: its field
//    count) or cut (long_row, with extra: the cut fields) to the first
//    record's width.
//  * Each error is { code, line, row } in the order met; a record's
//    short_row / long_row is reported when the record ends, with line the
//    1-based line its record starts on (counting every LF, CRLF and lone CR
//    inside quotes) and row its record's index in rows, null for the header.
//
// Speed strategy (no dependencies, no caching between cases — all state is
// local to one run() call):
//  * Fast line path: a record whose line contains no '"' is parsed with
//    native String.split(',') after stripping one trailing CRLF and dropping
//    stray CRs (each reported). This covers the bulk of real CSV data.
//  * General path (only for records whose first line contains a quote):
//    most fields are parsed INLINE in the record loop — a quoted field
//    (walking its closing quote and folding doubled quotes, with no
//    embedded line break and a plain terminator) and an unquoted field
//    (ending at the first of a comma, an LF or a CRLF) — using indexOf
//    plus monotonic peek cursors for the next LF / CR (each byte is
//    scanned at most once overall). Only the awkward fields (embedded
//    line breaks, junk after a closing quote, stray CRs, unterminated
//    quotes) fall back to parseQuoted()/parseUnquoted(), which keep the
//    full correctness machinery. Field values are slices, never built
//    character by character; quoted values are assembled with join()
//    only when they actually contain "" escapes or CR/LF normalisation.
//  * Line numbers are maintained incrementally; a quoted field's embedded
//    line breaks are counted locally and applied only once the field is
//    known to be terminated.
//  * main.ts serialises the answers per section (columns, rows, errors
//    handed to the native stringifier separately) instead of one
//    top-level JSON.stringify, which is measurably faster for this shape
//    and produces byte-identical output.

export function run(input) {
  const text = input.text;
  const header = !!input.header;
  const n = text.length;

  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  const errors = [];
  const rows = [];
  let columns = null;
  let line = 1; // 1-based line of the character at i
  // The oracle (kit vendor csv-reader) attributes EVERY error to the line
  // its record STARTS on (recordLine), not the line the parser happens to
  // be on when it meets the breakage: a stray CR, quote junk or an
  // unterminated quote inside a multi-line record is reported at the
  // record's start line. recLine holds that line for the record in
  // progress; short_row/long_row already used recStartLine.
  let recLine = 1;
  let width = -1;
  let first = true;

  // Monotonic cursors: the next LF / CR at or after a position, or n when
  // there is none left. Positions only move forward while parsing (the
  // single exception, the unterminated-quote re-read, resets them), so a
  // stored position stays valid for every later, larger position: each
  // byte is scanned at most once across all peek calls. This makes the
  // delimiter search in the general path O(n) overall instead of
  // O(fields x line length).
  let nextLF = -1;
  let nextCR = -1;
  const peekLF = (from) => {
    if (nextLF < from) {
      const k = text.indexOf('\n', from);
      nextLF = k === -1 ? n : k;
    }
    return nextLF;
  };
  const peekCR = (from) => {
    if (nextCR < from) {
      const k = text.indexOf('\r', from);
      nextCR = k === -1 ? n : k;
    }
    return nextCR;
  };

  // Row index of the record currently being parsed (null for the header).
  const rowOf = () => (first && header ? null : rows.length);

  function finish(rec, recStartLine) {
    if (first) {
      width = rec.length;
      if (header) columns = rec;
      else rows.push(rec);
      first = false;
      return;
    }
    if (rec.length < width) {
      errors.push({ code: 'short_row', line: recStartLine, row: rows.length, fields: rec.length });
      const padded = rec.slice();
      for (let k = rec.length; k < width; k++) padded.push('');
      rows.push(padded);
    } else if (rec.length > width) {
      errors.push({ code: 'long_row', line: recStartLine, row: rows.length, extra: rec.slice(width) });
      rows.push(rec.slice(0, width));
    } else {
      rows.push(rec);
    }
  }

  // Unquoted field starting at i. Leaves i at the next ',' / LF / CRLF / EOF.
  // Lone CRs are dropped (stray_cr each) and the field continues past them.
  function parseUnquoted() {
    let parts = null;
    const start = i;
    let p = i;
    for (;;) {
      const ci = text.indexOf(',', p);
      const lf = peekLF(p);
      const cr = peekCR(p);
      let d = ci;
      let kind = 44; // 44 ',' | 10 LF | 13 CR
      if (lf < d || (d === -1 && lf !== n)) {
        d = lf;
        kind = 10;
      }
      if (cr < d || (d === -1 && cr !== n)) {
        d = cr;
        kind = 13;
      }
      if (d === -1 || d === n) {
        // EOF: no comma and no line break left.
        if (parts === null) {
          i = n;
          return text.slice(start);
        }
        parts.push(text.slice(p));
        i = n;
        return parts.join('');
      }
      if (kind === 13) {
        if (text.charCodeAt(d + 1) === 10) {
          // CRLF ends the field (and the record).
          if (parts === null) {
            i = d;
            return text.slice(start, d);
          }
          parts.push(text.slice(p, d));
          i = d;
          return parts.join('');
        }
        errors.push({ code: 'stray_cr', line: recLine, row: rowOf() });
        if (parts === null) parts = [text.slice(start, d)];
        else parts.push(text.slice(p, d));
        p = d + 1;
        continue;
      }
      // ',' or '\n' ends the field.
      if (parts === null) {
        i = d;
        return text.slice(start, d);
      }
      parts.push(text.slice(p, d));
      i = d;
      return parts.join('');
    }
  }

  // Quoted field starting at i (text[i] === '"'). Leaves i at the next
  // ',' / LF / CRLF / EOF, after any quote_junk has been consumed.
  function parseQuoted() {
    const start = i;
    let j = i + 1;
    let segStart = j; // start of the not-yet-flushed raw region
    let parts = null; // flushed pieces (already normalised)
    let delta = 0; // line breaks inside the quotes, applied only if closed
    let closed = -1;
    for (;;) {
      const q = text.indexOf('"', j);
      if (q === -1) break; // no closing quote: unterminated
      if (q > j) {
        // Line breaks inside the quotes: count them (delta) and normalise
        // CRs to LF. The peek cursors tell us whether any break exists in
        // [j, q) at all; the common case (none) needs no slice or regex.
        if (peekLF(j) < q || peekCR(j) < q) {
          const segText = text.slice(j, q);
          const br = segText.match(/\r\n|\n|\r/g);
          delta += br.length;
          if (parts === null) parts = [];
          parts.push(segText.indexOf('\r') !== -1 ? segText.replace(/\r\n?/g, '\n') : segText);
          segStart = q;
        }
      }
      if (text.charCodeAt(q + 1) === 34) {
        // Doubled quote: one literal quote.
        if (parts === null) parts = [];
        if (segStart < q) parts.push(text.slice(segStart, q));
        parts.push('"');
        j = q + 2;
        segStart = j;
        continue;
      }
      closed = q;
      break;
    }

    if (closed === -1) {
      // Unterminated: the opening quote is literal and the rest is read
      // again as unquoted. The error's line is the line the quote opened on.
      // The re-read moves backwards, so the peek cursors must be reset.
      errors.push({ code: 'unterminated_quote', line: recLine, row: rowOf() });
      nextLF = -1;
      nextCR = -1;
      i = start + 1;
      return '"' + parseUnquoted();
    }

    let value;
    if (parts === null) value = text.slice(segStart, closed);
    else {
      if (segStart < closed) parts.push(text.slice(segStart, closed));
      value = parts.join('');
    }
    line += delta;

    // Junk after the closing quote, up to the next comma or line break.
    // A lone CR inside junk is dropped (stray_cr) and the junk continues.
    // The common case — the very next character already ends the field —
    // needs no scan at all.
    let junk = '';
    let p = closed + 1;
    const nc = p < n ? text.charCodeAt(p) : -1;
    if (nc !== 44 && nc !== 10 && nc !== -1 && !(nc === 13 && text.charCodeAt(p + 1) === 10)) {
      let junkParts = null;
      let junkStart = p;
      for (;;) {
        const ci = text.indexOf(',', p);
        const lf = peekLF(p);
        const cr = peekCR(p);
        let d = ci;
        let kind = 44;
        if (lf < d || (d === -1 && lf !== n)) {
          d = lf;
          kind = 10;
        }
        if (cr < d || (d === -1 && cr !== n)) {
          d = cr;
          kind = 13;
        }
        if (d === -1) {
          if (junkParts === null) junk = text.slice(junkStart);
          else {
            junkParts.push(text.slice(junkStart));
            junk = junkParts.join('');
          }
          p = n;
          break;
        }
        if (kind === 13 && text.charCodeAt(d + 1) !== 10) {
          errors.push({ code: 'stray_cr', line: recLine, row: rowOf() });
          if (junkParts === null) junkParts = [text.slice(junkStart, d)];
          else junkParts.push(text.slice(junkStart, d));
          p = d + 1;
          junkStart = p;
          continue;
        }
        if (junkParts === null) junk = text.slice(junkStart, d);
        else {
          junkParts.push(text.slice(junkStart, d));
          junk = junkParts.join('');
        }
        p = d;
        break;
      }
    }
    if (junk.length > 0) {
      value += junk;
      errors.push({ code: 'quote_junk', line: recLine, row: rowOf() });
    }
    i = p;
    return value;
  }

  while (i < n) {
    // Record start: empty lines (LF or CRLF) are no record. A lone CR
    // here is NOT dropped by this loop: it belongs to the record that
    // starts here. The oracle reads it as the first field's stray_cr, and
    // the field then continues as unquoted — so a quote after it is a
    // literal character, not the opening of a quoted field. Dropping it
    // here first would wrongly open a quoted field after it (the
    // unterminated_quote the oracle never reports).
    const c = text.charCodeAt(i);
    if (c === 10) {
      i++;
      line++;
      continue;
    }
    if (c === 13 && text.charCodeAt(i + 1) === 10) {
      i += 2;
      line++;
      continue;
    }

    const recStartLine = line;
    recLine = line;

    // Fast path: this line has no quote, so the record cannot span lines.
    const lineEnd = text.indexOf('\n', i);
    const le = lineEnd === -1 ? n : lineEnd;
    const seg = text.slice(i, le);
    if (seg.indexOf('"') === -1) {
      let content = seg;
      // One trailing CR before the LF is the CRLF record ending.
      if (lineEnd !== -1 && content.length > 0 && content.charCodeAt(content.length - 1) === 13) {
        content = content.slice(0, -1);
      }
      let fieldText = content;
      if (content.indexOf('\r') !== -1) {
        const crParts = content.split('\r');
        for (let k = 1; k < crParts.length; k++) {
          errors.push({ code: 'stray_cr', line: recLine, row: rowOf() });
        }
        fieldText = crParts.join('');
      }
      if (fieldText.length === 0) {
        // Line left with no characters (only stray CRs): no record.
        if (lineEnd !== -1) {
          i = lineEnd + 1;
          line++;
        } else {
          i = n;
        }
        continue;
      }
      const rec = fieldText.split(',');
      if (lineEnd !== -1) {
        i = lineEnd + 1;
        line++;
      } else {
        i = n;
      }
      finish(rec, recStartLine);
      continue;
    }

    // General path: the record contains a quote (it may span lines).
    // Whether the first field opened with a quote: the oracle drops a
    // record that is a single empty UNQUOTED field (a line left with only
    // stray CRs), but keeps a single empty quoted field ("" is a record).
    //
    // Most fields are simple, so each is tried inline first and only the
    // awkward ones (doubled quotes, embedded line breaks, junk, stray CRs,
    // unterminated quotes) fall back to parseQuoted()/parseUnquoted(),
    // which keep the full correctness machinery. The inline attempts use
    // the same monotonic peek cursors, so a fallback sees them already
    // advanced and still valid.
    const firstQuoted = text.charCodeAt(i) === 34;
    const rec = [];
    for (;;) {
      let field;
      if (text.charCodeAt(i) === 34) {
        // Quoted field, tried inline: walk the closing quote, folding
        // each doubled quote ("") into one literal quote. Only the
        // no-embedded-line-break + plain-terminator (comma / LF / CRLF /
        // EOF) case is handled here; embedded breaks, junk after the
        // closing quote and unterminated quotes fall back to parseQuoted().
        // Leaves i at the terminator, as parseQuoted() does.
        const j = i + 1;
        if (nextLF < j) {
          const k = text.indexOf('\n', j);
          nextLF = k === -1 ? n : k;
        }
        if (nextCR < j) {
          const k = text.indexOf('\r', j);
          nextCR = k === -1 ? n : k;
        }
        let segStart = j;
        let parts = null;
        let closed = -1;
        let cur = j;
        for (;;) {
          const q = text.indexOf('"', cur);
          if (q === -1) break; // unterminated: fall back
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: one literal quote.
            if (parts === null) parts = [text.slice(segStart, q), '"'];
            else {
              parts.push(text.slice(segStart, q));
              parts.push('"');
            }
            cur = q + 2;
            segStart = cur;
            continue;
          }
          closed = q;
          break;
        }
        if (closed !== -1 && nextLF >= closed && nextCR >= closed) {
          const c = closed + 1 < n ? text.charCodeAt(closed + 1) : -1;
          if (c === 44 || c === 10 || c === -1 || (c === 13 && text.charCodeAt(closed + 2) === 10)) {
            if (parts === null) field = text.slice(segStart, closed);
            else {
              if (segStart < closed) parts.push(text.slice(segStart, closed));
              field = parts.join('');
            }
            i = closed + 1;
          }
        }
        if (field === undefined) field = parseQuoted();
      } else {
        // Unquoted field, tried inline: it ends at the first of a comma,
        // an LF or a CRLF — whichever comes first, with no stray CR
        // before it. A stray CR (or anything else awkward) falls back to
        // parseUnquoted(). Leaves i AT the terminator, as parseUnquoted()
        // does. Also the tail case: no comma and no line break left, so
        // the rest of the text is the field.
        const ci = text.indexOf(',', i);
        if (nextLF < i) {
          const k = text.indexOf('\n', i);
          nextLF = k === -1 ? n : k;
        }
        if (nextCR < i) {
          const k = text.indexOf('\r', i);
          nextCR = k === -1 ? n : k;
        }
        if (ci !== -1 && ci < nextLF && ci < nextCR) {
          field = text.slice(i, ci);
          i = ci;
        } else if (nextLF !== n && nextLF < nextCR && (ci === -1 || nextLF < ci)) {
          field = text.slice(i, nextLF);
          i = nextLF;
        } else if (nextCR !== n && nextCR < nextLF && (ci === -1 || nextCR < ci) && text.charCodeAt(nextCR + 1) === 10) {
          field = text.slice(i, nextCR);
          i = nextCR;
        } else if (ci === -1 && nextLF === n && nextCR === n) {
          field = text.slice(i);
          i = n;
        }
        if (field === undefined) field = parseUnquoted();
      }
      rec.push(field);
      if (i < n && text.charCodeAt(i) === 44) {
        i++;
        continue;
      }
      break;
    }
    if (i < n && text.charCodeAt(i) === 10) {
      i++;
      line++;
    } else if (i < n && text.charCodeAt(i) === 13) {
      i += 2; // CRLF (a lone CR cannot be left here: the field parsers drop it)
      line++;
    }
    if (rec.length === 1 && rec[0] === '' && !firstQuoted) continue; // no record
    finish(rec, recStartLine);
  }

  // The oracle returns columns [] (not null) when header is true but the
  // text holds no record at all.
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

export default run;
