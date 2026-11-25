import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { verifyRuntimeBundle } from './runtime_bundle.mjs';

const data = new URL('../public/data/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', data), 'utf8'));
const bytes = await readFile(new URL(manifest.bundle_file, data));

test('checks the delivered official runtime bundle against its publication manifest', () => {
  const result = verifyRuntimeBundle(200, 'application/json; charset=utf-8', bytes, manifest);
  assert.equal(result.source.states_count, 34);
  assert.equal(result.source.normalized_rows, 22848);
});

test('rejects an unrelated listener returning an HTML document with HTTP 200', () => {
  assert.throws(
    () => verifyRuntimeBundle(200, 'text/html', Buffer.from('<!doctype html>'), manifest),
    /expected application\/json/,
  );
});

test('rejects malformed JSON, wrong HTTP status, and a valid but changed bundle', () => {
  assert.throws(() => verifyRuntimeBundle(404, 'application/json', bytes, manifest), /expected HTTP 200/);
  assert.throws(() => verifyRuntimeBundle(200, 'application/json', Buffer.from('{'), manifest), /invalid JSON/);
  assert.throws(() => verifyRuntimeBundle(200, 'application/json', Buffer.concat([bytes, Buffer.from(' ')]), manifest), /checksum/);
});

test('rejects a matching manifest for JSON that lacks the official bundle structure', () => {
  const wrong = Buffer.from('{"schema_version":"1.1.0","mode":"official"}');
  const falseManifest = { ...manifest, bundle_sha256: createHash('sha256').update(wrong).digest('hex') };
  assert.throws(() => verifyRuntimeBundle(200, 'application/json', wrong, falseManifest), /schema/);
});
