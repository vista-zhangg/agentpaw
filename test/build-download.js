'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-build-download-'));
  const previousCache = process.env.ELECTRON_BUILDER_CACHE;
  process.env.ELECTRON_BUILDER_CACHE = path.join(temp, 'builder-cache');
  const payload = Buffer.from('AgentPaw build download fixture\n');
  const checksum = crypto.createHash('sha256').update(payload).digest('hex');
  const requests = [];
  const sockets = new Set();
  let proxyRequests = 0;
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': payload.length });
    response.end(payload);
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, socket, head) => {
    if (request.url !== 'build-download.invalid:80') return socket.destroy();
    proxyRequests++;
    const upstream = net.connect(server.address().port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.once('close', () => upstream.destroy());
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const { download } = require('app-builder-lib/out/binDownload');
    const { downloadElectronArtifactZip } = require('app-builder-lib/out/util/electronGet');

    const target = path.join(temp, 'valid.bin');
    await download(`${base}/valid.bin`, target, checksum);
    assert.deepStrictEqual(fs.readFileSync(target), payload, 'builder tool download preserves the verified payload');

    await download(`${base}/valid.bin`, path.join(temp, 'cached.bin'), checksum);
    assert.strictEqual(requests.filter(url => url === '/valid.bin').length, 1,
      'a second download reuses the isolated artifact cache');

    const rejectedTarget = path.join(temp, 'rejected.bin');
    await assert.rejects(download(`${base}/invalid.bin`, rejectedTarget, '0'.repeat(64)), /checksum/i);
    assert(!fs.existsSync(rejectedTarget), 'checksum failure must not install the downloaded file');

    // Exercise the separate Electron archive path, including the builder's
    // progress/download options, with a fresh cache and a local HTTP fixture.
    const artifactName = 'ffmpeg-v99.0.0-win32-x64.zip';
    const archive = await downloadElectronArtifactZip({
      version: '99.0.0',
      artifactName: 'ffmpeg',
      platformName: 'win32',
      arch: 'x64',
      cacheDir: path.join(temp, 'electron-cache'),
      electronDownload: {
        mirrorOptions: { resolveAssetURL: async () => `${base}/${artifactName}` },
        checksums: { [artifactName]: checksum },
      },
    });
    assert.deepStrictEqual(fs.readFileSync(archive), payload, 'Electron archive downloads retain checksum verification');
    assert(requests.includes(`/${artifactName}`), 'the archive test must exercise a fresh download');

    // A fresh process lets @electron/get initialize its supported proxy mode.
    // The destination cannot resolve; success requires the local CONNECT proxy.
    const proxyEnv = { ...process.env };
    for (const key of Object.keys(proxyEnv)) if (/^(https?_proxy|no_proxy)$/i.test(key)) delete proxyEnv[key];
    Object.assign(proxyEnv, { HTTP_PROXY: base, HTTPS_PROXY: base, NO_PROXY: '', ELECTRON_GET_USE_PROXY: '1' });
    const proxyTarget = path.join(temp, 'proxy.bin');
    await new Promise((resolve, reject) => {
      execFile(process.execPath, ['-e',
        "require('app-builder-lib/out/binDownload').download(process.argv[1], process.argv[2], process.argv[3]).catch(e => { console.error(e); process.exitCode = 1; })",
        'http://build-download.invalid/proxy.bin', proxyTarget, checksum],
      { env: proxyEnv, timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
        if (error) reject(new Error(`Proxy download failed: ${stderr || error.message}`));
        else resolve();
      });
    });
    assert(proxyRequests > 0, 'the configured proxy must receive the download');
    assert.deepStrictEqual(fs.readFileSync(proxyTarget), payload, 'proxy downloads retain checksum verification');
  } finally {
    for (const socket of sockets) socket.destroy();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
    if (previousCache === undefined) delete process.env.ELECTRON_BUILDER_CACHE;
    else process.env.ELECTRON_BUILDER_CACHE = previousCache;
    if (fs.realpathSync(path.dirname(temp)) !== fs.realpathSync(os.tmpdir())) throw new Error('Unexpected cleanup directory');
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log('Build downloads, proxy, isolated cache and checksum rejection checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
