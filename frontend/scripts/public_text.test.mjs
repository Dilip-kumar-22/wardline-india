import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePublicText } from './public_text.mjs';

test('preserves valid UTF-8 names and punctuation', () => {
  const original = 'El Niño · April 2012–March 2020 · Government Open Data License – India';
  assert.equal(decodePublicText(Buffer.from(original), 'notice'), original);
});

test('rejects valid UTF-8 that contains the observed mojibake', () => {
  for (const corruption of ['\u00c2\u00b7', '\u00c3\u00b1', '\u00e2\u20ac\u201c', '\ufffd']) {
    assert.throws(() => decodePublicText(Buffer.from(corruption), 'notice'), /notice: probable mojibake/);
  }
});

test('rejects invalid UTF-8 without substituting a replacement character', () => {
  assert.throws(() => decodePublicText(Buffer.from([0xf1]), 'notice'), /notice: invalid UTF-8/);
});
