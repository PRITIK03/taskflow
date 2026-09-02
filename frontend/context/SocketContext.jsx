'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { accessToken, user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  // Increments every time a (re)connection succeeds — pages watch this
  // value to know when to silently refetch, in case events were missed
  // while disconnected.
  const [connectionEpoch, setConnectionEpoch] = useState(0);

  useEffect(() => {
    // No token (logged out, or auth still loading) — ensure no socket exists.
    if (!accessToken || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Token exists — create the connection.
    const socket = io(BASE_URL, {
      auth: { token: accessToken },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionEpoch((n) => n + 1);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      // Access token expired mid-session — the socket won't self-heal from
      // this alone (unlike REST, there's no automatic refresh-and-retry for
      // socket auth). This is an acceptable, documented gap for now: the
      // next full page load will reconnect with a fresh token.
      console.error('Socket connection error:', err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };

    // Reconnect whenever the access token changes (e.g. after a refresh).
  }, [accessToken, user]);

  return (
    <SocketContext.Provider
      value={{ socket: socketRef.current, isConnected, connectionEpoch }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
