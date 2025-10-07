import { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface WebSocketMessage {
  type: 'progress' | 'log' | 'completed' | 'failed' | 'job-update';
  data: unknown;
}

export function useWebSocket(url: string, enabled = true) {
  const [connected, setConnected] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const probeTimerRef = useRef<number | null>(null);
  const probeDelayRef = useRef(1500); // backoff in ms
  const probeLoggedRef = useRef(false);

  const probeHealth = async (baseUrl: string): Promise<boolean> => {
    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 1200);
    try {
      const res = await fetch(new URL('/health', baseUrl).toString(), { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(t);
    }
  };

  const scheduleProbe = useCallback((socket: Socket, baseUrl: string) => {
    if (probeTimerRef.current) return; // already scheduled
    const delay = Math.min(probeDelayRef.current, 8000);
    probeTimerRef.current = window.setTimeout(async () => {
      probeTimerRef.current = null;
      const ok = await probeHealth(baseUrl);
      if (ok) {
        setServerAvailable(true);
        try { socket.connect(); } catch { /* ignore */ }
      } else {
        setServerAvailable(false);
        // increase backoff and schedule again
        probeDelayRef.current = Math.min(delay * 1.5, 8000);
        scheduleProbe(socket, baseUrl);
      }
    }, delay) as unknown as number;
  }, []);

  useEffect(() => {
    if (!enabled) {
      // If disabled, ensure any existing socket is torn down and do nothing else
      if (socketRef.current) {
        try { socketRef.current.removeAllListeners(); } catch { /* noop */ }
        try { socketRef.current.disconnect(); } catch { /* noop */ }
        try { socketRef.current.close(); } catch { /* noop */ }
        socketRef.current = null;
      }
      // Also clear any pending probe timer
      if (probeTimerRef.current) {
        window.clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
      setConnected(false);
      return;
    }
    // Initialize WebSocket connection
    const baseUrl = url || (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';
    const socketPath = (import.meta.env.VITE_SOCKET_IO_PATH as string) || '/socket.io';
    const socket = io(baseUrl, {
      transports: ['websocket'],
      path: socketPath,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5,
      autoConnect: false, // we'll probe the server first to avoid noisy errors when down
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.warn('🔌 WebSocket connected');
      setConnected(true);
      setServerAvailable(true);
      probeDelayRef.current = 1500; // reset backoff
      probeLoggedRef.current = false;
    });

    socket.on('disconnect', (reason) => {
      console.warn('🔌 WebSocket disconnected:', reason);
      setConnected(false);
      // mark server as unavailable when transport closes or io server disconnects
      if (reason === 'transport close' || reason === 'io server disconnect') {
        setServerAvailable(false);
      }
      // start probing to reconnect without spamming websocket errors
      scheduleProbe(socket, baseUrl);
    });

    socket.on('connect_error', (error) => {
      // downgrade noise and mark server as down
      if (!probeLoggedRef.current) {
        console.warn('🔌 WebSocket connection error (muted):', (error as Error)?.message || String(error));
        probeLoggedRef.current = true; // log first occurrence only
      }
      setConnected(false);
      setServerAvailable(false);
      // stop trying immediately; probing will decide when to reconnect
      try { socket.disconnect(); } catch { /* noop */ }
      scheduleProbe(socket, baseUrl);
    });

    // Listen for all job-related events
    socket.on('progress', (data) => {
      setLastMessage({ type: 'progress', data });
    });

    socket.on('log', (data) => {
      setLastMessage({ type: 'log', data });
    });

    socket.on('completed', (data) => {
      setLastMessage({ type: 'completed', data });
    });

    socket.on('failed', (data) => {
      setLastMessage({ type: 'failed', data });
    });

    socket.on('job-update', (data) => {
      setLastMessage({ type: 'job-update', data });
    });

    return () => {
      // cleanup probe timer
      if (probeTimerRef.current) {
        window.clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
      // Avoid disconnecting a socket that hasn't established yet to prevent noisy errors
      if (socket.connected) {
        try { socket.disconnect(); } catch { /* noop */ }
      } else {
        // clean up listeners to avoid leaks; the transport will close itself
        try { socket.removeAllListeners(); socket.close(); } catch { /* noop */ }
      }
    };
  }, [url, scheduleProbe, enabled]);


  const joinJob = useCallback((jobId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-job', { jobId });
    }
  }, []);

  const leaveJob = useCallback((jobId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-job', { jobId });
    }
  }, []);

  return {
    connected,
    serverAvailable,
    lastMessage,
    joinJob,
    leaveJob,
  };
}
