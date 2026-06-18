import { useEffect, useRef, useCallback } from 'react';
import { useAIWarroomStore } from '../store/useAIWarroomStore';

const WS_URL = `ws://${window.location.hostname}:3000/ws/ai-warroom`;
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface WsMessage {
  type: 'connected' | 'agent:status' | 'match:event' | 'prediction:result';
  data: any;
}

/**
 * useAIWarroomSocket - AI 战情室 WebSocket Hook
 * 连接后端 WebSocket，自动重连，分发消息到 Zustand Store
 */
export function useAIWarroomSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateAgentStatus = useAIWarroomStore((s) => s.updateAgentStatus);
  const updatePrediction = useAIWarroomStore((s) => s.updatePrediction);
  const updateTacticalData = useAIWarroomStore((s) => s.updateTacticalData);

  const handleMessage = useCallback(
    (message: WsMessage) => {
      switch (message.type) {
        case 'agent:status': {
          const { id, status, progress } = message.data;
          updateAgentStatus(id, { status, progress });
          break;
        }
        case 'prediction:result': {
          updatePrediction(message.data);
          break;
        }
        case 'match:event': {
          // 比赛事件可能触发战术数据更新
          // 后续阶段可根据事件类型细化处理
          const event = message.data;
          if (event.tacticalData) {
            updateTacticalData(event.tacticalData);
          }
          break;
        }
        case 'connected': {
          console.log('[AI WarRoom] WebSocket connected');
          reconnectCountRef.current = 0;
          break;
        }
      }
    },
    [updateAgentStatus, updatePrediction, updateTacticalData]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[AI WarRoom] WebSocket connection opened');
        reconnectCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('[AI WarRoom] Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[AI WarRoom] WebSocket connection closed');
        wsRef.current = null;

        // 自动重连
        if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectCountRef.current++;
          console.log(
            `[AI WarRoom] Reconnecting in ${RECONNECT_INTERVAL / 1000}s (attempt ${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_INTERVAL);
        }
      };

      ws.onerror = (err) => {
        console.error('[AI WarRoom] WebSocket error:', err);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[AI WarRoom] Failed to create WebSocket:', err);
    }
  }, [handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS; // 阻止自动重连
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    disconnect,
    reconnect: () => {
      reconnectCountRef.current = 0;
      disconnect();
      connect();
    },
  };
}
