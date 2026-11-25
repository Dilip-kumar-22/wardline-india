import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { bundlePath, readBundleManifest, verifyRuntimeBundle } from './runtime_bundle.mjs';

const stages = process.argv.slice(2);
if (!stages.length) stages.push('local_browser_qa.mjs', 'spatial_acceptance.mjs');
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const listener = server.httpServer.address();
let failed = false;
try {
  if (!listener || typeof listener === 'string' || listener.address !== '127.0.0.1') {
    throw new Error('Expected preview server bound exclusively to IPv4 loopback');
  }
  const origin = new URL(`http://${listener.address}:${listener.port}/`);
  const manifest = await readBundleManifest();
  const response = await fetch(new URL(bundlePath, origin), { signal: AbortSignal.timeout(10_000) });
  verifyRuntimeBundle(response.status, response.headers.get('content-type'), Buffer.from(await response.arrayBuffer()), manifest);
  console.log(`READY ${origin} | ${manifest.bundle_bytes} verified bytes | SHA-256 ${manifest.bundle_sha256}`);

  for (const stage of stages) {
    if (!/^[\w-]+\.mjs$/.test(stage)) throw new Error(`Invalid browser stage: ${stage}`);
    const entry = fileURLToPath(new URL(stage, import.meta.url));
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [entry], {
        stdio: 'inherit',
        env: { ...process.env, WARDLINE_URL: origin.href },
      });
      child.once('error', (error) => resolve(error.message));
      child.once('exit', (code, signal) => resolve(code ?? signal));
    });
    console.log(`${result === 0 ? 'PASS' : 'FAIL'} ${stage} (${result})`);
    failed ||= result !== 0;
  }
} finally {
  const closed = new Promise((resolve, reject) => {
    server.httpServer.close((error) => error ? reject(error) : resolve());
  });
  server.httpServer.closeAllConnections?.();
  await closed;
}
if (failed) process.exitCode = 1;
