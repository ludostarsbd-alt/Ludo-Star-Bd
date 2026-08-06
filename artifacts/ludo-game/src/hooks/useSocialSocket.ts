import { useAuth } from '@clerk/react';
import { useEffect, useRef, useState } from 'react';
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

type Options = {
  enabled: boolean;
  onMessage?: (message: SocialMessage) => void;
  onFriendRequest?: () => void;
  onFriendChange?: () => void;
  onPresence?: (payload: { userId: string; isOnline: boolean; lastSeenAt?: string }) => void;
  onError?: (message: string) => void;
};

export function useSocialSocket({
  enabled,
  onMessage,
  onFriendRequest,
  onFriendChange,
  onPresence,
  onError,
}: Options) {
  const { getToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

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
      socket.on('connect_error', () => onError?.('Social connection unavailable. Retrying…'));
      socket.on('social:error', (payload: { message?: string }) => onError?.(payload.message ?? 'Social action failed.'));
      socket.on('social:dm_received', (payload: { message?: SocialMessage }) => {
        if (payload.message) onMessage?.(payload.message);
      });
      socket.on('social:dm_sent', (payload: { message?: SocialMessage }) => {
        if (payload.message) onMessage?.(payload.message);
      });
      socket.on('social:friend_request', () => onFriendRequest?.());
      socket.on('social:friend_accepted', () => onFriendChange?.());
      socket.on('social:friend_declined', () => onFriendChange?.());
      socket.on('social:presence', onPresence ?? (() => undefined));
    })().catch(() => onError?.('Social connection could not be started.'));

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled, getToken, onError, onFriendChange, onFriendRequest, onMessage, onPresence]);

  return {
    connected,
    sendMessage: (recipientId: string, content: string) => {
      socketRef.current?.emit('social:dm_send', { recipientId, content });
    },
    markRead: (otherUserId: string) => {
      socketRef.current?.emit('social:dm_read', { otherUserId });
    },
  };
}