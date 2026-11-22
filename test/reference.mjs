// test/reference.mjs — NAIVE reference implementation, written directly
// from the competition description, one character at a time. It is the
// semantic authority for the differential tests: solve.js must agree with
// it on every input. It is deliberately slow and simple (no fast paths,
// no indexOf/regex scanning, string building by slicing only at field
// boundaries) so that a bug in the optimised parser shows up as a
// mismatch here.
//
// Semantics implemented (see README.md for the corner-case decisions):
//  BOM at the very start dropped; record ends at LF/CRLF; empty line is
//  no record; lone CR outside quotes dropped + stray_cr; quoted field to
//  the next non-doubled quote ("" -> ", CRLF/lone CR inside -> LF);
//  junk after the closing quote appended + quote_junk; a never-closing
//  quote is literal and the rest is re-read as unquoted +
//  unterminated_quote; quote inside an unquoted field is literal;
//  header -> columns = first record, rows padded/cut to its width with
//  short_row {fields} / long_row {extra}; errors {code,line,row} in the
//  order met, short/long reported at record end with the record's start
//  line and its index in rows (null for the header).

export function runReference(input) {
  const text = input.text;
  const header = !!input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  const errors = [];
  const rows = [];
  let columns = null;
  let line = 1;
  // Oracle semantics: every error is attributed to the line its record
  // starts on (recordLine), and columns is [] for header=true with no record.
  let recLine = 1;
  let width = -1;
  let first = true;
  const rowOf = () => (first && header ? null : rows.length);

  // Unquoted field scan starting at k; returns [value, endIndex] where
  // endIndex is at ',' / '\n' / CRLF '\r' / EOF. Lone CRs are dropped.
  function scanUnquoted(k) {
    let parts = null;
    let start = k;
    while (k < n) {
      const ch = text.charCodeAt(k);
      if (ch === 44 || ch === 10) break;
      if (ch === 13) {
        if (text.charCodeAt(k + 1) === 10) break;
        errors.push({ code: 'stray_cr', line: recLine, row: rowOf() });
        if (parts === null) parts = [text.slice(start, k)];
        else parts.push(text.slice(start, k));
        k++;
        start = k;
        continue;
      }
      k++;
    }
    let value;
    if (parts === null) value = text.slice(start, k);
    else {
      parts.push(text.slice(start, k));
      value = parts.join('');
    }
    return [value, k];
  }

  while (i < n) {
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
    // A lone CR here belongs to the record starting here (see solve.js):
    // the first field's parser drops it as stray_cr and the field stays
    // unquoted, so a quote after it is literal.

    const recStartLine = line;
    recLine = line;
    const firstQuoted = text.charCodeAt(i) === 34;
    const rec = [];
    for (;;) {
      let field;
      if (i < n && text.charCodeAt(i) === 34) {
        // Quoted field: scan for the closing quote.
        let j = i + 1;
        let seg = j;
        let parts = null;
        let delta = 0;
        let closed = -1;
        while (j < n) {
          const ch = text.charCodeAt(j);
          if (ch === 34) {
            if (text.charCodeAt(j + 1) === 34) {
              if (parts === null) parts = [];
              parts.push(text.slice(seg, j));
              parts.push('"');
              j += 2;
              seg = j;
              continue;
            }
            closed = j;
            break;
          }
          if (ch === 13) {
            if (parts === null) parts = [];
            parts.push(text.slice(seg, j));
            parts.push('\n');
            delta++;
            j += text.charCodeAt(j + 1) === 10 ? 2 : 1;
            seg = j;
            continue;
          }
          if (ch === 10) {
            delta++;
            j++;
            continue;
          }
          j++;
        }
        if (closed !== -1) {
          if (parts === null) field = text.slice(seg, closed);
          else {
            parts.push(text.slice(seg, closed));
            field = parts.join('');
          }
          line += delta;
          // Junk after the closing quote.
          const [junk, junkEnd] = scanUnquoted(closed + 1);
          if (junk.length > 0) {
            field += junk;
            errors.push({ code: 'quote_junk', line: recLine, row: rowOf() });
          }
          i = junkEnd;
        } else {
          // Unterminated: opening quote is literal, rest re-read unquoted.
          errors.push({ code: 'unterminated_quote', line: recLine, row: rowOf() });
          const [tail, tailEnd] = scanUnquoted(i + 1);
          field = '"' + tail;
          i = tailEnd;
        }
      } else {
        const [value, end] = scanUnquoted(i);
        field = value;
        i = end;
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
      i += 2;
      line++;
    }
    if (rec.length === 1 && rec[0] === '' && !firstQuoted) continue; // no record
    if (first) {
      width = rec.length;
      if (header) columns = rec;
      else rows.push(rec);
      first = false;
    } else if (rec.length < width) {
      errors.push({ code: 'short_row', line: recStartLine, row: rows.length, fields: rec.length });
      const padded = rec.slice();
      while (padded.length < width) padded.push('');
      rows.push(padded);
    } else if (rec.length > width) {
      errors.push({ code: 'long_row', line: recStartLine, row: rows.length, extra: rec.slice(width) });
      rows.push(rec.slice(0, width));
    } else {
      rows.push(rec);
    }
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
