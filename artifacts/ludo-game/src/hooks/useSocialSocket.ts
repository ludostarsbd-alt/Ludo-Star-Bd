import { useAuth } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export type SocialMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  content: string;
  createdAt: string;
};

export type SpectatorGameState = {
  roomId?: string;
  players?: Array<{ displayName: string; color: string; tokens?: unknown[] }>;
  phase?: string;
  currentColorIndex?: number;
  diceValue?: number | null;
  [key: string]: unknown;
};

export type SocialNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
};

type Options = {
  enabled: boolean;
  onMessage?: (message: SocialMessage) => void;
  onFriendRequest?: () => void;
  onFriendChange?: () => void;
  onPresence?: (payload: { userId: string; isOnline: boolean; lastSeenAt?: string }) => void;
  onNotification?: (notification: SocialNotification) => void;
  onSpectatorCount?: (roomId: string, count: number) => void;
  onSpectatorGameState?: (roomId: string, game: SpectatorGameState) => void;
  onError?: (message: string) => void;
};

export function useSocialSocket({
  enabled,
  onMessage,
  onFriendRequest,
  onFriendChange,
  onPresence,
  onNotification,
  onSpectatorCount,
  onSpectatorGameState,
  onError,
}: Options) {
  const { getToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef({
    onMessage,
    onFriendRequest,
    onFriendChange,
    onPresence,
    onNotification,
    onSpectatorCount,
    onSpectatorGameState,
    onError,
  });
  const [connected, setConnected] = useState(false);

  // Event handlers are allowed to change as screens re-render, but changing
  // their identity must not tear down an authenticated Socket.IO connection.
  // In particular, selecting another live match changes the game callback.
  callbacksRef.current = {
    onMessage,
    onFriendRequest,
    onFriendChange,
    onPresence,
    onNotification,
    onSpectatorCount,
    onSpectatorGameState,
    onError,
  };

  useEffect(() => {
    if (!enabled) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      socket = io(window.location.origin, {
        path: `${basePath}/api/ws/socket.io`,
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: { token },
      });
      socketRef.current = socket;
      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => callbacksRef.current.onError?.('Social connection unavailable. Retrying…'));
      socket.on('social:error', (payload: { message?: string }) => callbacksRef.current.onError?.(payload.message ?? 'Social action failed.'));
      socket.on('social:dm_received', (payload: { message?: SocialMessage; notification?: SocialNotification }) => {
        if (payload.message) callbacksRef.current.onMessage?.(payload.message);
        if (payload.notification) callbacksRef.current.onNotification?.(payload.notification);
      });
      socket.on('social:dm_sent', (payload: { message?: SocialMessage }) => {
        if (payload.message) callbacksRef.current.onMessage?.(payload.message);
      });
      socket.on('social:friend_request', () => callbacksRef.current.onFriendRequest?.());
      socket.on('social:friend_accepted', () => callbacksRef.current.onFriendChange?.());
      socket.on('social:friend_declined', () => callbacksRef.current.onFriendChange?.());
      socket.on('social:presence', (payload) => callbacksRef.current.onPresence?.(payload));
      socket.on('social:notification', (payload: { notification?: SocialNotification }) => {
        if (payload.notification) callbacksRef.current.onNotification?.(payload.notification);
      });
      socket.on('spectator:count', (payload: { roomId?: string; count?: number }) => {
        if (payload.roomId && typeof payload.count === 'number') callbacksRef.current.onSpectatorCount?.(payload.roomId, payload.count);
      });
      const spectatorGameHandler = (payload: { roomId?: string; game?: SpectatorGameState }) => {
        if (payload.roomId && payload.game) callbacksRef.current.onSpectatorGameState?.(payload.roomId, payload.game);
      };
      socket.on('spectator:game_state', spectatorGameHandler);
      socket.on('spectator:match_state', spectatorGameHandler);
    })().catch(() => callbacksRef.current.onError?.('Social connection could not be started.'));

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled, getToken]);

  const sendMessage = useCallback((recipientId: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new Error('Social connection unavailable. Retrying…'));
        return;
      }

      socket.timeout(8000).emit(
        'social:dm_send',
        { recipientId, content },
        (timeoutError: Error | null, response?: { ok?: boolean; error?: string }) => {
          if (timeoutError) {
            reject(new Error('Message could not be sent. Please try again.'));
            return;
          }
          if (response?.error || response?.ok !== true) {
            reject(new Error(response?.error ?? 'Message could not be sent.'));
            return;
          }
          resolve();
        },
      );
    });
  }, []);
  const markRead = useCallback((otherUserId: string) => {
      socketRef.current?.emit('social:dm_read', { otherUserId });
  }, []);
  const joinSpectator = useCallback((roomId: string) => {
      socketRef.current?.emit('spectator:join', { roomId });
  }, []);
  const leaveSpectator = useCallback((roomId: string) => {
      socketRef.current?.emit('spectator:leave', { roomId });
  }, []);

  return useMemo(() => ({
    connected,
    sendMessage,
    markRead,
    joinSpectator,
    leaveSpectator,
  }), [connected, sendMessage, markRead, joinSpectator, leaveSpectator]);
}