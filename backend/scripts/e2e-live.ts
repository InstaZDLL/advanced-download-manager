/*
 E2E manuel: crée un job via POST /downloads puis écoute la room WebSocket `job:{jobId}`
 Usage:
   WS_URL=http://localhost:3000 SOCKET_IO_PATH=/socket.io E2E_TEST_URL=https://speed.hetzner.de/10MB.bin \
   node --loader tsx ./scripts/e2e-live.ts
   
   ou: npm run e2e:live (variables via .env backend chargées si vous utilisez dotenv en amont)
*/

import { io } from 'socket.io-client';

const BASE = process.env.WS_URL || process.env.API_URL || 'http://localhost:3000';
const PATH = process.env.SOCKET_IO_PATH || '/socket.io';
const TEST_URL = process.env.E2E_TEST_URL || 'https://speed.hetzner.de/10MB.bin';

async function main() {
  console.log('[E2E] BASE =', BASE, 'PATH =', PATH);

  // 1) Création du job
  const res = await fetch(new URL('/downloads', BASE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'x-api-key': process.env.API_KEY || '', // si guard activé
    },
    body: JSON.stringify({ url: TEST_URL, type: 'file' }),
  });

  if (!res.ok) {
    console.error('[E2E] Échec création job:', res.status, res.statusText);
    const txt = await res.text().catch(() => '');
    console.error(txt);
    process.exit(1);
  }

  const { jobId } = (await res.json()) as { jobId: string };
  console.log('[E2E] Job créé:', jobId);

  // 2) Connexion Socket.IO (namespace par défaut / clients UI)
  const socket = io(BASE, {
    path: PATH,
    transports: ['websocket'],
    reconnectionAttempts: 5,
  });

  let joined = false;
  socket.on('connect', () => {
    console.log('[E2E] Socket connecté:', socket.id);
    socket.emit('join-job', { jobId });
    joined = true;
  });

  socket.on('connect_error', (err) => {
    console.error('[E2E] connect_error:', err.message);
  });

  const onProgress = (e: any) => {
    if (e.jobId !== jobId) return;
    const pct = e.progress?.toFixed?.(2) ?? e.progress;
    const speed = e.speed ? ` ${e.speed}` : '';
    const eta = e.eta != null ? ` ETA ${e.eta}s` : '';
    const total = e.totalBytes != null ? ` total ${e.totalBytes}` : '';
    console.log(`[E2E] progress ${pct}%${speed}${eta}${total}`);
  };
  const onCompleted = (e: any) => {
    if (e.jobId !== jobId) return;
    console.log('[E2E] completed:', e.filename, e.size);
    cleanup(0);
  };
  const onFailed = (e: any) => {
    if (e.jobId !== jobId) return;
    console.error('[E2E] failed:', e.errorCode, e.message);
    cleanup(1);
  };

  socket.on('progress', onProgress);
  socket.on('completed', onCompleted);
  socket.on('failed', onFailed);

  const timeoutMs = parseInt(process.env.E2E_TIMEOUT || '600000', 10); // 10 min
  const timeout = setTimeout(() => {
    console.error('[E2E] Timeout atteint');
    cleanup(2);
  }, timeoutMs);

  function cleanup(code: number) {
    try {
      if (joined) socket.emit('leave-job', { jobId });
      socket.off('progress', onProgress);
      socket.off('completed', onCompleted);
      socket.off('failed', onFailed);
      socket.close();
      clearTimeout(timeout);
    } finally {
      process.exit(code);
    }
  }
}

main().catch((err) => {
  console.error('[E2E] Erreur:', err);
  process.exit(1);
});
