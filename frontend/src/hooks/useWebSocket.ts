import { useEffect, useState, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface WebSocketMessage {
  type: 'progress' | 'log' | 'completed' | 'failed' | 'job-update';
  data: unknown;
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
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
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.warn('🔌 WebSocket connected');
      setConnected(true);
      setServerAvailable(true);
    });

    socket.on('disconnect', (reason) => {
      console.warn('🔌 WebSocket disconnected:', reason);
      setConnected(false);
      // mark server as unavailable when transport closes or io server disconnects
      if (reason === 'transport close' || reason === 'io server disconnect') {
        setServerAvailable(false);
      }
    });

    socket.on('connect_error', (error) => {
      // downgrade noise and mark server as down
      console.warn('🔌 WebSocket connection error:', (error as Error)?.message || String(error));
      setConnected(false);
      setServerAvailable(false);
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
      // Avoid disconnecting a socket that hasn't established yet to prevent noisy errors
      if (socket.connected) {
        socket.disconnect();
      } else {
        // clean up listeners to avoid leaks; the transport will close itself
        socket.removeAllListeners();
        socket.close();
      }
    };
  }, [url]);

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
