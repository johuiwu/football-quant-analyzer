import { useRef, useEffect, useState, useCallback } from 'react';
import { Target, Play, Pause, RotateCcw } from 'lucide-react';
import { useAIWarroomStore } from '../../store/useAIWarroomStore';

const FIELD_RATIO = 105 / 68;
const PLAYBACK_SPEEDS = [0.5, 1, 2];
const SPEED_LABELS = ['0.5x', '1x', '2x'];

interface PlayerDetailModalProps {
  player: { id: number; x: number; y: number; team: 'home' | 'away' };
  onClose: () => void;
}

function PlayerDetailModal({ player, onClose }: PlayerDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-64 mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">球员 #{player.id}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <div className="px-4 py-3 space-y-2 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>所属</span>
            <span className={player.team === 'home' ? 'text-red-400' : 'text-blue-400'}>
              {player.team === 'home' ? '主队' : '客队'}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>X坐标</span>
            <span>{player.x.toFixed(1)}m</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Y坐标</span>
            <span>{player.y.toFixed(1)}m</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TacticalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const tacticalData = useAIWarroomStore((s) => s.tacticalData);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; x: number; y: number; team: 'home' | 'away' } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);

  const speed = PLAYBACK_SPEEDS[speedIndex];

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw field
  const drawField = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const fieldH = h;
    const fieldW = fieldH * FIELD_RATIO;
    const offsetX = (w - fieldW) / 2;

    // Background
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(offsetX, 0, fieldW, fieldH);

    // Grass stripes
    ctx.fillStyle = '#1e401e';
    const stripeW = fieldW / 20;
    for (let i = 0; i < 20; i += 2) {
      ctx.fillRect(offsetX + i * stripeW, 0, stripeW, fieldH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;

    // Outer boundary
    ctx.strokeRect(offsetX, 0, fieldW, fieldH);

    // Center line
    ctx.beginPath();
    ctx.moveTo(offsetX + fieldW / 2, 0);
    ctx.lineTo(offsetX + fieldW / 2, fieldH);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(offsetX + fieldW / 2, fieldH / 2, fieldH * 0.12, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(offsetX + fieldW / 2, fieldH / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    // Penalty areas
    const penW = fieldW * 0.16;
    const penH = fieldH * 0.44;
    ctx.strokeRect(offsetX, (fieldH - penH) / 2, penW, penH);
    ctx.strokeRect(offsetX + fieldW - penW, (fieldH - penH) / 2, penW, penH);

    // Goal areas
    const goalW = fieldW * 0.055;
    const goalH = fieldH * 0.2;
    ctx.strokeRect(offsetX, (fieldH - goalH) / 2, goalW, goalH);
    ctx.strokeRect(offsetX + fieldW - goalW, (fieldH - goalH) / 2, goalW, goalH);

    // Penalty spots
    const penSpotX = offsetX + fieldW * 0.11;
    ctx.beginPath();
    ctx.arc(penSpotX, fieldH / 2, 3, 0, Math.PI * 2);
    ctx.arc(offsetX + fieldW - penSpotX, fieldH / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Penalty arcs
    ctx.beginPath();
    ctx.arc(penSpotX, fieldH / 2, fieldH * 0.12, -0.65, 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsetX + fieldW - penSpotX, fieldH / 2, fieldH * 0.12, Math.PI - 0.65, Math.PI + 0.65);
    ctx.stroke();

    // Goals
    const goalDepth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(offsetX - goalDepth, (fieldH - fieldH * 0.1) / 2, goalDepth, fieldH * 0.1);
    ctx.strokeRect(offsetX + fieldW, (fieldH - fieldH * 0.1) / 2, goalDepth, fieldH * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';

    // Corner arcs
    const cornerR = 8;
    ctx.beginPath();
    ctx.arc(offsetX, 0, cornerR, 0, 0.5 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsetX + fieldW, 0, cornerR, 0.5 * Math.PI, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsetX, fieldH, cornerR, -0.5 * Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsetX + fieldW, fieldH, cornerR, Math.PI, -0.5 * Math.PI);
    ctx.stroke();
  }, []);

  // Draw heatmap
  const drawHeatmap = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, heatmap: typeof tacticalData.heatMap) => {
    if (!heatmap || heatmap.length === 0) return;
    const fieldH = h;
    const fieldW = fieldH * FIELD_RATIO;
    const offsetX = (w - fieldW) / 2;

    for (const pt of heatmap) {
      const px = offsetX + (pt.x / 105) * fieldW;
      const py = (pt.y / 68) * fieldH;
      const radius = 20 + pt.intensity * 30;

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, `rgba(255, 100, 0, ${pt.intensity * 0.5})`);
      gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // Draw players
  const drawPlayers = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, players: typeof tacticalData.playerPositions, animOffset = 0) => {
    if (!players || players.length === 0) return;
    const fieldH = h;
    const fieldW = fieldH * FIELD_RATIO;
    const offsetX = (w - fieldW) / 2;

    for (const player of players) {
      const baseX = offsetX + (player.x / 105) * fieldW;
      const baseY = (player.y / 68) * fieldH;
      // Animate subtle bounce
      const px = baseX + Math.sin(animOffset + player.id) * 2;
      const py = baseY + Math.cos(animOffset * 0.7 + player.id) * 1.5;

      // Activity range
      const rangeR = 14 + player.id % 6;
      ctx.fillStyle = player.team === 'home' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(59, 130, 246, 0.15)';
      ctx.beginPath();
      ctx.arc(px, py, rangeR, 0, Math.PI * 2);
      ctx.fill();

      // Player dot
      ctx.fillStyle = player.team === 'home' ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Number
      ctx.fillStyle = 'white';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.id), px, py);
    }
  }, []);

  // Draw pass routes
  const drawPassRoutes = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, passes: typeof tacticalData.passRoutes, players: typeof tacticalData.playerPositions) => {
    if (!passes || passes.length === 0 || !players || players.length === 0) return;
    const fieldH = h;
    const fieldW = fieldH * FIELD_RATIO;
    const offsetX = (w - fieldW) / 2;

    const getPos = (id: number) => {
      const p = players.find((pl) => pl.id === id);
      if (!p) return null;
      return {
        x: offsetX + (p.x / 105) * fieldW,
        y: (p.y / 68) * fieldH,
      };
    };

    for (const pass of passes) {
      const from = getPos(pass.from);
      const to = getPos(pass.to);
      if (!from || !to) continue;

      const lineWidth = 1 + pass.weight * 4;
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + to.x) / 2, from.y - 10, to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 8 * Math.cos(angle - 0.4), to.y - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(to.x - 8 * Math.cos(angle + 0.4), to.y - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = 0;
    let animTime = 0;

    const render = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlaying) {
        animTime += delta * speed;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      drawField(ctx, w, h);
      drawHeatmap(ctx, w, h, tacticalData.heatMap);
      drawPassRoutes(ctx, w, h, tacticalData.passRoutes, tacticalData.playerPositions);
      drawPlayers(ctx, w, h, tacticalData.playerPositions, animTime);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, speed, tacticalData, drawField, drawHeatmap, drawPlayers, drawPassRoutes]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = (canvasWidth / FIELD_RATIO) * dpr;
    canvas.style.height = `${canvasWidth / FIELD_RATIO}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [canvasWidth]);

  // Click to select player
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !tacticalData.playerPositions.length) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const h = canvasWidth / FIELD_RATIO;
    const fieldW = h * FIELD_RATIO;
    const offsetX = (canvasWidth - fieldW) / 2;

    for (const player of tacticalData.playerPositions) {
      const px = offsetX + (player.x / 105) * fieldW;
      const py = (player.y / 68) * h;
      const dist = Math.sqrt((clickX - px) ** 2 + (clickY - py) ** 2);
      if (dist < 12) {
        setSelectedPlayer(player);
        return;
      }
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setSpeedIndex(1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-200">战术画布</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded-lg transition-colors ${isPlaying ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleReset} className="p-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <div className="flex bg-slate-800 rounded-lg overflow-hidden">
            {PLAYBACK_SPEEDS.map((s, i) => (
              <button
                key={s}
                onClick={() => setSpeedIndex(i)}
                className={`px-2 py-1 text-[10px] font-medium transition-colors ${speedIndex === i ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
              >
                {SPEED_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 bg-slate-800/40 rounded-lg border border-slate-700/30 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto', cursor: tacticalData.playerPositions.length ? 'pointer' : 'default' }}
          onClick={handleCanvasClick}
        />
        {(!tacticalData.playerPositions.length) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-1">
              <Target className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-500">暂无战术数据</p>
              <p className="text-xs text-slate-600">D3.js 球场渲染将在后续阶段实现</p>
            </div>
          </div>
        )}
      </div>

      {/* Player detail modal */}
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}