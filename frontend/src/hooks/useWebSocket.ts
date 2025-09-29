import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WebSocketMessage {
  type: 'progress' | 'log' | 'completed' | 'failed' | 'job-update';
  data: any;
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
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