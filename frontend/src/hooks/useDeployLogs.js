import { useState, useEffect, useRef } from 'react';

/**
 * WebSocket hook for streaming deploy logs in real-time.
 */
export function useDeployLogs(projectId, deployId, onComplete) {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!projectId || !deployId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/projects/${projectId}/deploys/${deployId}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        if (log.warning) {
          console.warn('Log stream:', log.warning);
          return;
        }
        setLogs((prev) => [...prev, log]);
      } catch (e) {
        console.error('Failed to parse log:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (onCompleteRef.current) onCompleteRef.current();
    };
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, [projectId, deployId]);

  return { logs, connected };
}
