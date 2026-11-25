import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const bundlePath = 'data/wardline_india_bundle.json';

export async function readBundleManifest(dir = new URL('../public/data/', import.meta.url)) {
  return JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
}

export function verifyRuntimeBundle(status, contentType, bytes, manifest) {
  assert.equal(status, 200, 'Runtime bundle expected HTTP 200');
  assert.match(contentType ?? '', /^application\/json(?:\s*;|$)/i, 'Runtime bundle expected application/json');
  let bundle;
  try {
    bundle = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('Runtime bundle contains invalid JSON', { cause: error });
  }
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.bundle_sha256, 'Runtime bundle checksum differs from publication manifest');
  assert(
    bundle?.schema_version === manifest.schema_version
      && bundle.mode === 'official'
      && bundle.source?.raw_sha256 === manifest.source_raw_sha256
      && bundle.source?.normalized_rows === 22848
      && bundle.source?.states_count === 34
      && Object.keys(bundle.indicators ?? {}).length === 7
      && bundle.analytics?.national?.inst_del?.monthly?.length === 96
      && !!bundle.forecasts?.inst_del,
    'Runtime bundle schema or official data dimensions are invalid',
  );
  return bundle;
}
