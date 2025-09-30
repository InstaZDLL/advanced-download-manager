import { useEffect, useState, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface WebSocketMessage {
  type: 'progress' | 'log' | 'completed' | 'failed' | 'job-update';
  data: unknown;
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false);
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
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.warn('🔌 WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.warn('🔌 WebSocket disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      setConnected(false);
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
      socket.disconnect();
    };
  }, [url]);

  const joinJob = (jobId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-job', { jobId });
    }
  };

  const leaveJob = (jobId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-job', { jobId });
    }
  };

  return {
    connected,
    lastMessage,
    joinJob,
    leaveJob,
  };
}