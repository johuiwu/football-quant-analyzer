import { useState, useCallback, useRef, useEffect } from 'react';
import { Bot, Play, Loader2, RefreshCw } from 'lucide-react';
import AgentStatusPanel from '../components/ai_warroom/AgentStatusPanel';
import TacticalCanvas from '../components/ai_warroom/TacticalCanvas';
import WinRateChart from '../components/ai_warroom/WinRateChart';
import PredictionCard from '../components/ai_warroom/PredictionCard';
import { useAIWarroomStore } from '../store/useAIWarroomStore';
import { useAIWarroomSocket } from '../hooks/useAIWarroomSocket';

const API_BASE = `/api/ai-warroom`;

export default function AIWarRoomPage() {
  const [homeTeam, setHomeTeam] = useState('Brazil');
  const [awayTeam, setAwayTeam] = useState('Argentina');
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateAgentStatus = useAIWarroomStore((s) => s.updateAgentStatus);
  const updateTacticalData = useAIWarroomStore((s) => s.updateTacticalData);
  const updatePrediction = useAIWarroomStore((s) => s.updatePrediction);
  const resetAll = useAIWarroomStore((s) => s.resetAll);

  // 连接 WebSocket
  useAIWarroomSocket();

  // 组件卸载时清理轮询 interval，防止内存泄漏
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const handlePredict = useCallback(async () => {
    if (!homeTeam.trim() || !awayTeam.trim()) {
      setError('请输入主队和客队名称');
      return;
    }

    setIsPredicting(true);
    setError(null);
    resetAll();

    // 设置所有 Agent 为 running 状态（模拟初始状态）
    const agents = useAIWarroomStore.getState().agents;
    agents.forEach((a) => updateAgentStatus(a.id, { status: 'running', progress: 10 }));

    try {
      // 调用预测 API
      const response = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam: homeTeam.trim(), awayTeam: awayTeam.trim() }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || '预测请求失败');
      }

      const taskId = data.data.taskId;

      // 轮询任务结果
      let attempts = 0;
      const maxAttempts = 60; // 最多等 30 秒

      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const taskRes = await fetch(`${API_BASE}/task/${taskId}`);
          const taskData = await taskRes.json();

          if (taskData.success && taskData.data) {
            const task = taskData.data;

            // 更新 Agent 进度
            if (task.agentLogs) {
              for (const log of task.agentLogs) {
                updateAgentStatus(log.agent_id, {
                  status: log.status === 'completed' ? 'completed' : 'error',
                  progress: log.status === 'completed' ? 100 : 0,
                  lastOutput: log.result ? JSON.stringify(log.result).slice(0, 200) : undefined,
                  lastError: log.error || undefined,
                });
              }
            }

            if (task.status === 'completed') {
              // 更新预测结果
              if (task.result) {
                updatePrediction(task.result);
              }

              // 更新战术数据
              if (task.tactical_data) {
                updateTacticalData(task.tactical_data);
              }

              // 停止轮询
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
              setIsPredicting(false);
            } else if (task.status === 'failed') {
              setError(task.error || '预测任务失败');
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
              setIsPredicting(false);
            }
          }

          if (attempts >= maxAttempts) {
            setError('预测超时，请重试');
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setIsPredicting(false);
          }
        } catch (err: any) {
          console.error('[AI WarRoom] Polling error:', err.message);
        }
      }, 500);
    } catch (err: any) {
      setError(err.message || '预测请求失败');
      setIsPredicting(false);
    }
  }, [homeTeam, awayTeam, updateAgentStatus, updatePrediction, updateTacticalData, resetAll]);

  const handleReset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    resetAll();
    setIsPredicting(false);
    setError(null);
  }, [resetAll]);

  return (
    <div className="p-4 space-y-4">
      {/* 页面标题 + 操作栏 */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg shadow-lg">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">AI 概率战情室</h2>
          <p className="text-xs text-slate-400">16-Agent 协作 · 实时概率推演 · 战术可视化</p>
        </div>

        {/* 操作区域 */}
        <div className="ml-auto flex items-center gap-3">
          {/* 主队输入 */}
          <input
            type="text"
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
            placeholder="主队"
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 w-28"
            disabled={isPredicting}
          />
          <span className="text-xs text-slate-500 font-medium">VS</span>
          {/* 客队输入 */}
          <input
            type="text"
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
            placeholder="客队"
            className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 w-28"
            disabled={isPredicting}
          />

          {/* 开始预测按钮 */}
          <button
            onClick={handlePredict}
            disabled={isPredicting}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              isPredicting
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-md'
            }`}
          >
            {isPredicting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                预测中...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                开始预测
              </>
            )}
          </button>

          {/* 重置按钮 */}
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            title="重置"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {/* 三面板布局 */}
      <div className="grid grid-cols-12 gap-4 min-h-[600px]">
        {/* 左侧：Agent 状态列表 */}
        <div className="col-span-3 bg-slate-900/60 rounded-xl border border-slate-800 p-4 overflow-y-auto">
          <AgentStatusPanel />
        </div>

        {/* 中间：战术画布 */}
        <div className="col-span-5 bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col">
          <TacticalCanvas />
        </div>

        {/* 右侧：预测结果 + 胜率曲线 */}
        <div className="col-span-4 bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto">
          <PredictionCard />
          <div className="flex-1 min-h-[200px]">
            <WinRateChart />
          </div>
        </div>
      </div>
    </div>
  );
}
