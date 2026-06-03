import { useEffect, useState, useRef } from "react";
import { useAppStore } from "../store/useAppStore";

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 15000; // 15秒

export function useLiveCornerData() {
  const trackedMatchIds = useAppStore((s) => s.trackedMatchIds);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // 页面可见性变化处理
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      console.log("[useLiveCornerData] 页面可见性:", isVisibleRef.current ? "可见" : "隐藏");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const fetchData = async () => {
      if (!mountedRef.current) return;

      // 如果页面隐藏，暂停轮询
      if (!isVisibleRef.current) {
        console.log("[useLiveCornerData] 页面隐藏，跳过本轮轮询");
        timerRef.current = setTimeout(fetchData, POLL_INTERVAL);
        return;
      }

      try {
        setLoading(true);
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
        console.warn("[useLiveCornerData] 获取数据失败:", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }

      if (mountedRef.current) {
        timerRef.current = setTimeout(fetchData, POLL_INTERVAL);
      }
    };

    // 首次加载
    fetchData();

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [trackedMatchIds]);

  return { data, loading };
}
