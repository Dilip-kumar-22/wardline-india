import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundlePath, readBundleManifest, verifyRuntimeBundle } from './runtime_bundle.mjs';
import { verifyPublicText } from './public_text.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mount = '/wardline-india/';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};
const stageFiles = {
  assets: 'pages_smoke.mjs', browser: 'local_browser_qa.mjs', spatial: 'spatial_acceptance.mjs',
};
const stages = process.argv.length > 2 ? process.argv.slice(2) : ['assets'];
assert(stages.every(stage => Object.hasOwn(stageFiles, stage)), 'Use assets, browser or spatial');
const files = new Map();
for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  const urlPath = relative(root, path).split(/[\\/]/).map(encodeURIComponent).join('/');
  files.set(mount + urlPath, path);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === mount.slice(0, -1)) {
    response.writeHead(308, { Location: mount }).end();
    return;
  }
  const path = files.get(pathname === mount ? mount + 'index.html' : pathname);
  if (!path) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(path)] ?? 'application/octet-stream' }).end(bytes);
  } catch {
    response.writeHead(500).end();
  }
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const listener = server.address();
const base = new URL('http://' + listener.address + ':' + listener.port + mount);
try {
  const response = await fetch(new URL(bundlePath, base));
  const manifest = await readBundleManifest();
  verifyRuntimeBundle(response.status, response.headers.get('content-type'), Buffer.from(await response.arrayBuffer()), manifest);
  console.log('Verified runtime under ' + base.href + ' SHA-256 ' + manifest.bundle_sha256);
  const text = await verifyPublicText(base);
  if (process.env.WARDLINE_EVIDENCE) {
    await mkdir(process.env.WARDLINE_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.WARDLINE_EVIDENCE, 'PUBLIC_TEXT_VERIFICATION.json'), JSON.stringify(text, null, 2) + '\n');
  }
  console.log(`Verified UTF-8 for ${text.sourceDocuments} source documents and ${text.served.length} served texts`);
  for (const stage of stages) {
    const path = fileURLToPath(new URL(stageFiles[stage], import.meta.url));
    const child = spawn(process.execPath, [path], {
      env: { ...process.env, WARDLINE_URL: base.href }, stdio: 'inherit',
    });
    const [code, signal] = await once(child, 'exit');
    console.log(stage + ' exited ' + (code ?? signal));
    if (code !== 0) process.exitCode = 1;
  }
} finally {
  server.close();
  server.closeAllConnections();
  await once(server, 'close');
}
