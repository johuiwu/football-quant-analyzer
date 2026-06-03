// @ts-nocheck - React 19 class component type compatibility with bundler moduleResolution
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

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[400px] flex items-center justify-center bg-[#0b0b0f] rounded-2xl border border-red-500/30 p-8">
          <div className="text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-bold text-red-400">页面渲染异常</h2>
            <p className="text-sm text-slate-400 max-w-md">
              {this.state.error?.message || '未知渲染错误'}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors"
            >
              点击重试
            </button>
            <p className="text-[10px] text-slate-600">
              若问题持续，请检查浏览器控制台 (F12) 获取详细错误信息
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
