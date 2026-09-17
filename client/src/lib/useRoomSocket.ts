import { useEffect, useRef } from 'react';
import { websocketUrl } from '../config';

export interface RoomMessage {
  type: string;
  payload?: any;
}

/**
 * Subscribes to a real-time gateway room and keeps the subscription alive.
 *
 * The gateway is allowed to be down (the API keeps working without it), so a
 * screen must never depend on it alone: the socket reconnects on its own, and
 * `pollMs` re-runs `onResync` as a safety net. `onResync` also runs on every
 * (re)connect, to catch up on whatever was missed while disconnected.
 */
export function useRoomSocket(
  room: string | null,
  onMessage: (message: RoomMessage) => void,
  onResync?: () => void,
  pollMs = 15000,
) {
  const messageRef = useRef(onMessage);
  const resyncRef = useRef(onResync);
  messageRef.current = onMessage;
  resyncRef.current = onResync;

  useEffect(() => {
    if (!room) return;

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let connectedOnce = false;

    const scheduleReconnect = () => {
      if (stopped || retry) return;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, 3000);
    };

    const connect = () => {
      if (stopped) return;
      try {
        socket = new WebSocket(websocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: 'SUBSCRIBE', room }));
        if (connectedOnce) resyncRef.current?.();
        connectedOnce = true;
      };
      socket.onmessage = event => {
        try {
          messageRef.current(JSON.parse(event.data));
        } catch {
          // Ignore frames that are not JSON.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => scheduleReconnect();
    };

    connect();
    const poll = pollMs > 0 ? setInterval(() => resyncRef.current?.(), pollMs) : null;

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (poll) clearInterval(poll);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [room, pollMs]);
}
