import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useAIWarroomStore } from '../../store/useAIWarroomStore';

interface WinRateDataPoint {
  minute: number;
  home: number;
  draw: number;
  away: number;
}

// 模拟胜率曲线数据（后续由 Agent 真实数据替换）
function generateMockCurve(): WinRateDataPoint[] {
  const points: WinRateDataPoint[] = [];
  for (let min = 0; min <= 90; min += 5) {
    const t = min / 90;
    // 简化模拟：主队初期占优，后期客队反扑
    const home = Math.max(0, Math.min(1, 0.55 - t * 0.15 + (Math.random() - 0.5) * 0.05));
    const away = Math.max(0, Math.min(1, 0.30 + t * 0.15 + (Math.random() - 0.5) * 0.05));
    const draw = Math.max(0, Math.min(1, 1 - home - away));
    points.push({ minute: min, home, draw, away });
  }
  return points;
}

export default function WinRateChart() {
  const predictionResult = useAIWarroomStore((s) => s.predictionResult);

  // 如果有真实 win_rate_curve 数据，使用真实数据；否则用模拟数据
  const chartData: WinRateDataPoint[] = useMemo(() => {
    // 后续阶段从 predictionResult.win_rate_curve 读取
    return generateMockCurve();
  }, [predictionResult.timestamp]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
        <div className="text-xs text-slate-400 mb-1.5 font-medium">{label}分钟</div>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-300 capitalize">{entry.dataKey === 'home' ? '主胜' : entry.dataKey === 'draw' ? '平局' : '客胜'}</span>
            <span className="ml-auto font-medium text-white">{(entry.value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-200">胜率变化曲线</h3>
      </div>
      <div className="flex-1 bg-slate-800/40 rounded-lg border border-slate-700/30 p-3 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="minute"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={{ stroke: '#334155' }}
              axisLine={{ stroke: '#334155' }}
              label={{ value: '分钟', position: 'insideBottomRight', offset: -2, fill: '#64748b', fontSize: 10 }}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={{ stroke: '#334155' }}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              formatter={(value) => (
                <span className="text-slate-400 capitalize">
                  {value === 'home' ? '主胜' : value === 'draw' ? '平局' : '客胜'}
                </span>
              )}
            />
            <Line
              type="monotone"
              dataKey="home"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#22c55e' }}
            />
            <Line
              type="monotone"
              dataKey="draw"
              stroke="#eab308"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#eab308' }}
            />
            <Line
              type="monotone"
              dataKey="away"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#ef4444' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
