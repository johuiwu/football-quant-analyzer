import React, { useEffect } from "react";
import { User, Settings, DollarSign } from "lucide-react";
import { useCornerStore } from "../../store/cornerStore";
import { ErrorBoundary } from "../ErrorBoundary";

export default function SettingsPanel() {
  const settings = useCornerStore((s) => s.settings);
  const setSettings = useCornerStore((s) => s.setSettings);
  const isLoggedIn = useCornerStore((s) => s.isLoggedIn);
  const username = useCornerStore((s) => s.settings.hgUsername || s.accountConfig.username);
  const balance = useCornerStore((s) => s.settings.balance);
  const isLoadingBalance = useCornerStore((s) => s.isBalanceLoading);
  const balanceLastUpdated = useCornerStore((s) => s.balanceLastUpdated);
  const refreshBalance = useCornerStore((s) => s.refreshBalance);

  const inputClass = "w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors";
  const labelClass = "text-[10px] text-slate-400 mb-1 block";
  const cardClass = "bg-[#0F1424] rounded-xl border border-slate-800/80 p-4";

  // 组件挂载时自动刷新余额（2分钟节流）
  useEffect(() => {
    const now = Date.now();
    if (!balanceLastUpdated || (now - balanceLastUpdated) > 120000) {
      refreshBalance();
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* ===== 登录状态（只读） ===== */}
      <ErrorBoundary fallback={<div className={cardClass}><div className="text-rose-400 text-xs">状态组件异常</div></div>}>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-slate-200">登录状态</h4>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">当前账号</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isLoggedIn ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                <span className="text-white text-sm font-medium">{isLoggedIn ? username || "(已登录)" : "未登录"}</span>
              </div>
            </div>
            {isLoggedIn && (
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">账户余额</span>
              <div className="flex items-center gap-2">
                {isLoadingBalance ? (
                  <div className="w-4 h-4 border-2 border-t-transparent border-green-500 rounded-full animate-spin"></div>
                ) : balance > 0 ? (
                  <span className={`text-sm font-mono font-bold ${balance > 100 ? 'text-green-400' : 'text-red-400'}`}>
                    ¥{balance.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-slate-500 text-sm">未加载</span>
                )}
                <button
                  onClick={refreshBalance}
                  disabled={isLoadingBalance}
                  className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded text-slate-300 transition"
                >
                  刷新
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      </ErrorBoundary>

      {/* ===== 通用设置 ===== */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-semibold text-slate-200">通用设置</h4>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>初盘刷新间隔（小时）</label>
            <input
              type="number"
              className={inputClass}
              min={1} max={24} step={1}
              value={settings.refreshInterval}
              onChange={(e) => setSettings({ refreshInterval: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={labelClass}>强弱盘口分界线</label>
            <input
              type="number"
              className={inputClass}
              min={0} max={5} step={0.25}
              value={settings.strongHandicapThreshold}
              onChange={(e) => setSettings({ strongHandicapThreshold: Number(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>盘口上限</label>
              <input
                type="number"
                className={inputClass}
                min={-5} max={10} step={0.25}
                value={settings.handicapUpperLimit}
                onChange={(e) => setSettings({ handicapUpperLimit: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass}>盘口下限</label>
              <input
                type="number"
                className={inputClass}
                min={-5} max={10} step={0.25}
                value={settings.handicapLowerLimit}
                onChange={(e) => setSettings({ handicapLowerLimit: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 交易设置 ===== */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-semibold text-slate-200">交易设置</h4>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>下单金额</label>
            <input
              type="number"
              className={inputClass}
              min={10} max={100000} step={10}
              value={settings.betAmount}
              onChange={(e) => setSettings({ betAmount: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-300">真实模式</label>
            <button
              onClick={() => setSettings({ isRealMode: !settings.isRealMode })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                settings.isRealMode ? "bg-emerald-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.isRealMode ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-300">声音提醒</label>
            <input
              type="checkbox"
              checked={settings.isSoundEnabled}
              onChange={(e) => setSettings({ isSoundEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-emerald-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-xs text-slate-300">自动投注</label>
              <span className="text-[9px] text-slate-500">开启后，追踪的比赛触发策略时将自动投注</span>
            </div>
            <button
              onClick={() => setSettings({ autoBetEnabled: !settings.autoBetEnabled })}
              title={settings.autoBetEnabled ? "自动投注运行中" : "点击启用自动投注"}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoBetEnabled ? "bg-emerald-500" : "bg-slate-700"} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoBetEnabled ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <label className="text-xs text-slate-300">二次确认</label>
              <span className="text-[9px] text-slate-500">开启后，自动投注需手动确认才执行</span>
            </div>
            <button
              onClick={() => setSettings({ autoBetConfirmRequired: !settings.autoBetConfirmRequired })}
              title={settings.autoBetConfirmRequired ? "二次确认已开启" : "点击开启二次确认"}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoBetConfirmRequired ? "bg-emerald-500" : "bg-slate-700"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoBetConfirmRequired ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
