import { useEffect, useRef } from 'react';
import { TrendingUp, Brain } from 'lucide-react';
import { useAIWarroomStore } from '../../store/useAIWarroomStore';

export default function PredictionCard() {
  const predictionResult = useAIWarroomStore((s) => s.predictionResult);
  const prevTimestampRef = useRef(predictionResult.timestamp);
  const cardRef = useRef<HTMLDivElement>(null);

  // 淡入动画
  useEffect(() => {
    if (predictionResult.timestamp !== prevTimestampRef.current && cardRef.current) {
      prevTimestampRef.current = predictionResult.timestamp;
      cardRef.current.classList.remove('animate-fadeIn');
      // Trigger reflow
      void cardRef.current.offsetWidth;
      cardRef.current.classList.add('animate-fadeIn');
    }
  }, [predictionResult.timestamp]);

  const hasData = predictionResult.timestamp !== '' && predictionResult.score != null;

  return (
    <div ref={cardRef} className="space-y-4">
      {/* 比分预测 */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-200">AI 比分预测</h3>
        </div>

        {!hasData ? (
          <div className="text-center py-4 text-sm text-slate-500">暂无预测数据</div>
        ) : (
          <>
            {/* 主预测比分 */}
            <div className="text-center mb-4 py-3 bg-slate-900/60 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">最可能比分</div>
              <div className="text-3xl font-bold text-white">
                {predictionResult.score?.home ?? 0} - {predictionResult.score?.away ?? 0}
              </div>
            </div>

            {/* 前三比分 */}
            <div className="space-y-2">
              {predictionResult.topScores?.slice(0, 3).map((score, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 bg-slate-900/40 rounded-lg"
                >
                  <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
                    i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-white font-medium">
                    {score.home} - {score.away}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden ml-2">
                    <div
                      className={`h-full rounded-full transition-all ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-500' : 'bg-slate-600'}`}
                      style={{ width: `${Math.round(score.probability * 1000)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-12 text-right">
                    {(score.probability * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 胜率分布 */}
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">胜率分布</h3>
        </div>

        {!hasData ? (
          <div className="text-center py-3 text-sm text-slate-500">暂无数据</div>
        ) : (
          <div className="space-y-2.5">
            {[
              { key: 'home', label: '主胜', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
              { key: 'draw', label: '平局', color: 'bg-amber-500', textColor: 'text-amber-400' },
              { key: 'away', label: '客胜', color: 'bg-rose-500', textColor: 'text-rose-400' },
            ].map(({ key, label, color, textColor }) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-xs w-8 ${textColor}`}>{label}</span>
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all duration-500`}
                    style={{ width: `${(predictionResult.winProbabilities?.[key as keyof typeof predictionResult.winProbabilities] ?? 0) * 100}%` }}
                  />
                </div>
                <span className={`text-xs w-12 text-right ${textColor}`}>
                  {((predictionResult.winProbabilities?.[key as keyof typeof predictionResult.winProbabilities] ?? 0) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 置信区间 */}
      {hasData && (
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1.5">置信区间</div>
          <div className="text-sm text-slate-200 font-mono">
            [{(predictionResult.confidenceInterval?.low ?? 0).toFixed(2)}, {(predictionResult.confidenceInterval?.high ?? 0).toFixed(2)}]
          </div>
        </div>
      )}

      {/* Agent 共识 */}
      {hasData && predictionResult.agentConsensus && (
        <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/30 rounded-xl p-4 border border-violet-800/30">
          <div className="text-xs text-violet-400 mb-1.5 font-medium">AI 共识分析</div>
          <div className="text-sm text-slate-200 leading-relaxed">
            {predictionResult.agentConsensus}
          </div>
        </div>
      )}
    </div>
  );
}
