import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLines } from '../web/model.mjs';
test('trims, removes blanks and preserves first-seen order', () => {
  assert.deepEqual(cleanLines('  Halifax\nLangley\nHalifax\n\nVancouver  '), {
    text: 'Halifax\nLangley\nVancouver', count: 3, removed: 1,
  });
});
test('supports Windows and old Mac line endings', () => {
  assert.equal(cleanLines('a\r\nb\ra').text, 'a\nb');
});
test('empty text and whitespace produce an empty result', () => {
  assert.deepEqual(cleanLines(' \n\t'), { text: '', count: 0, removed: 0 });
});
test('preserves case and Unicode', () => {
  assert.equal(cleanLines('Québec\nquébec\n東京\nQuébec').text, 'Québec\nquébec\n東京');
});
test('treats markup as ordinary text', () => {
  assert.equal(cleanLines('<script>alert(1)</script>\n<script>alert(1)</script>').text, '<script>alert(1)</script>');
});
test('rejects non-text input', () => { assert.throws(() => cleanLines(null), TypeError); });
