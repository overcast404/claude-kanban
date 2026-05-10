import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage } from '../../src/types';

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [reconnectKey, setReconnectKey] = useState(0);

  const reconnect = useCallback(() => {
    setReconnectKey(k => k + 1);
  }, []);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        onMessageRef.current(msg);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setTimeout(reconnect, 2000);
    };

    return () => ws.close();
  }, [reconnectKey]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });
}
