import { useState } from 'react';
import { Bot, RotateCcw, X } from 'lucide-react';
import { useAIWarroomStore } from '../../store/useAIWarroomStore';
import type { AgentStatus } from '../../store/useAIWarroomStore';

const STATUS_CONFIG = {
  idle: { label: '空闲', color: 'bg-slate-500', textColor: 'text-slate-400', pulse: false },
  running: { label: '运行中', color: 'bg-blue-500', textColor: 'text-blue-400', pulse: true },
  completed: { label: '已完成', color: 'bg-emerald-500', textColor: 'text-emerald-400', pulse: false },
  failed: { label: '失败', color: 'bg-red-500', textColor: 'text-red-400', pulse: false },
};

interface AgentModalProps {
  agent: AgentStatus;
  onClose: () => void;
  onReset: () => void;
}

function AgentModal({ agent, onClose, onReset }: AgentModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">{agent.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[agent.status].color} ${STATUS_CONFIG[agent.status].pulse ? 'animate-pulse' : ''}`} />
            <span className={`text-sm ${STATUS_CONFIG[agent.status].textColor}`}>
              {STATUS_CONFIG[agent.status].label}
            </span>
            {agent.status === 'running' && (
              <span className="ml-auto text-sm text-blue-400">{agent.progress}%</span>
            )}
          </div>

          {/* Progress bar */}
          {agent.status === 'running' && (
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${agent.progress}%` }}
              />
            </div>
          )}

          {/* Last Output */}
          {agent.lastOutput && (
            <div>
              <div className="text-xs text-slate-400 mb-1.5 font-medium">输出摘要</div>
              <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300 font-mono max-h-32 overflow-y-auto">
                {agent.lastOutput}
              </div>
            </div>
          )}

          {/* Error */}
          {agent.error && (
            <div>
              <div className="text-xs text-red-400 mb-1.5 font-medium">错误信息</div>
              <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-3 text-xs text-red-300">
                {agent.error}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentStatusPanel() {
  const agents = useAIWarroomStore((s) => s.agents);
  const updateAgentStatus = useAIWarroomStore((s) => s.updateAgentStatus);
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);

  const handleReset = (agentId: string) => {
    updateAgentStatus(agentId, { status: 'idle', progress: 0, lastOutput: null, lastError: null });
    setSelectedAgent(null);
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-slate-200">Agent 状态</h3>
        <span className="ml-auto text-xs text-slate-500">{agents.length} 个 Agent</span>
      </div>
      <div className="space-y-2">
        {agents.map((agent) => {
          const config = STATUS_CONFIG[agent.status];
          return (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-800/60 hover:bg-slate-700/60 rounded-lg border border-slate-700/50 transition-colors text-left group"
            >
              {/* Status dot */}
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-200 truncate group-hover:text-white">
                  {agent.name}
                </div>
                <div className={`text-[10px] ${config.textColor}`}>
                  {agent.status === 'running' ? `${agent.progress}%` : config.label}
                </div>
              </div>

              {/* Progress bar in running */}
              {agent.status === 'running' && (
                <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${agent.progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onReset={() => handleReset(selectedAgent.id)}
        />
      )}
    </>
  );
}
