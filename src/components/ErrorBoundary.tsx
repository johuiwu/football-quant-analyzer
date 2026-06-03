// @ts-nocheck - React 19 class component type compatibility
import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 渲染崩溃:', error.message);
    console.error('[ErrorBoundary] 组件栈:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[400px] flex items-center justify-center bg-[#0b0b0f] rounded-2xl border border-red-500/30 p-8">
          <div className="text-center space-y-4">
            <div className="text-4xl">{'\u26A0\uFE0F'}</div>
            <h2 className="text-lg font-bold text-red-400">{'\u9875\u9762\u6E32\u67D3\u5F02\u5E38'}</h2>
            <p className="text-sm text-slate-400 max-w-md">
              {this.state.error?.message || '\u672A\u77E5\u6E32\u67D3\u9519\u8BEF'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors"
            >
              {'\u70B9\u51FB\u91CD\u8BD5'}
            </button>
            <p className="text-[10px] text-slate-600">
              {'\u82E5\u95EE\u9898\u6301\u7EED\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u63A7\u5236\u53F0 (F12) \u83B7\u53D6\u8BE6\u7EC6\u9519\u8BEF\u4FE1\u606F'}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}