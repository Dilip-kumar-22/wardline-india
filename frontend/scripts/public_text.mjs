import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const decoder = new TextDecoder('utf-8', { fatal: true });
const damagedText = /\u00c2[\u00a0\u00b7]|\u00c3\u00b1|\u00e2\u20ac[\u2010-\u203f\u02dc\u009d]|\ufffd/u;
const licenses = {
  'Anton-OFL.txt': '@fontsource/anton',
  'Archivo-OFL.txt': '@fontsource/archivo',
  'React-MIT.txt': 'react',
  'React-DOM-MIT.txt': 'react-dom',
  'Scheduler-MIT.txt': 'scheduler',
  'Three-MIT.txt': 'three',
};

export function decodePublicText(bytes, label) {
  let text;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    throw new Error(`${label}: invalid UTF-8`, { cause: error });
  }
  assert.ok(text.trim(), `${label}: empty public document`);
  const match = damagedText.exec(text);
  assert.ok(!match, `${label}: probable mojibake or replacement character ${JSON.stringify(match?.[0])}`);
  return text;
}

async function sourceDocuments() {
  const markdown = (entry) => entry.isFile() && entry.name.endsWith('.md');
  const entries = await Promise.all([
    readdir(root, { withFileTypes: true }),
    readdir(join(root, 'docs'), { withFileTypes: true, recursive: true }),
  ]);
  return [
    ...entries.flat().filter(markdown).map((entry) => join(entry.parentPath, entry.name)),
    join(root, 'CITATION.cff'),
    join(root, 'scripts/generate_handbook.py'),
    join(root, 'handbook/COMPLETE_HANDBOOK.md'),
  ].sort();
}

export async function verifyPublicText(base) {
  const docs = await sourceDocuments();
  assert.ok(docs.some((path) => /[\\/]THIRD_PARTY_NOTICES\.md$/.test(path)));
  for (const path of docs) decodePublicText(await readFile(path), relative(root, path));

  const notices = {
    'handbook.html': 'frontend/public/handbook.html',
    'licenses/THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
    ...Object.fromEntries(Object.entries(licenses).map(([notice, dependency]) => [
      `licenses/${notice}`, `frontend/node_modules/${dependency}/LICENSE`,
    ])),
  };
  const served = [];
  for (const [path, source] of Object.entries(notices)) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, path);
    const contentType = response.headers.get('content-type');
    assert.match(contentType ?? '', path.endsWith('.html')
      ? /^text\/html\s*;\s*charset=utf-8$/i
      : /^text\/(?:plain|markdown)\s*;\s*charset=utf-8$/i, path);
    const bytes = Buffer.from(await response.arrayBuffer());
    decodePublicText(bytes, path);
    assert.deepEqual(bytes, await readFile(join(root, source)), `${path}: served bytes differ from source`);
    served.push({ path, contentType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return { status: 'PASS', sourceDocuments: docs.length, served };
}
