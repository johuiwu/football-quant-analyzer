import { useEffect, useState, useRef } from "react";
import { useAppStore } from "../store/useAppStore";

export function useLiveCornerData() {
  const trackedMatchIds = useAppStore((s) => s.trackedMatchIds);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const fetchData = async () => {
      if (!mountedRef.current) return;

      try {
        // 始终获取所有比赛数据
        const response = await fetch("/api/corner/live");
        const json = await response.json();
        const allMatches = json?.success && Array.isArray(json.data) ? json.data : [];
        
        // 如果有追踪的比赛 ID，则将它们排在前面并标记
        if (trackedMatchIds.length > 0) {
          const trackedSet = new Set(trackedMatchIds.map(String));
          const tracked: any[] = [];
          const untracked: any[] = [];
          for (const m of allMatches) {
            if (trackedSet.has(String(m.matchId))) {
              tracked.push({ ...m, _isTracked: true });
            } else {
              untracked.push(m);
            }
          }
          setData([...tracked, ...untracked]);
        } else {
          setData(allMatches);
        }
      } catch (err) {
        console.warn("[useLiveCornerData]", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }

      if (mountedRef.current) {
        timerRef.current = setTimeout(fetchData, 5000);
      }
    };

    setLoading(true);
    fetchData();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [trackedMatchIds]);

  return { data, loading };
}
