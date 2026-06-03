import { FileCode, Download, Info } from 'lucide-react';

interface PythonExportTabProps {
  handleExportPython: () => Promise<void>;
  isExporting: boolean;
}

export default function PythonExportTab({ handleExportPython, isExporting }: PythonExportTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
      
      <div className="lg:col-span-4 p-5 bg-[#0F1424] rounded-2xl border border-slate-800 shadow-xl h-fit">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5 mb-3">
          <FileCode className="w-4.5 h-4.5 text-blue-400" />
          Windows 独立软件 EXE 打包编译指导
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          我们可以将本平台相同的 <strong>10大物理精算期望公式模型代码</strong> 和 <strong>离线真实球队数据库</strong> 完整打包为您自己个人的 Windows
          桌面应用！下载后双击即可全脱网工作。
        </p>

        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-900/80 mb-4 text-xs font-mono">
          <span className="block text-[11px] text-slate-500 font-bold uppercase mb-1.5">⚡ 自动安装依赖并构建</span>
          <div className="text-slate-300 space-y-1 my-2 select-all">
            <span className="block"># 1. 自动打包工具：</span>
            <code className="text-blue-400 bg-slate-900 px-1 py-0.5 rounded block">pip install customtkinter matplotlib pyinstaller</code>
            <span className="block mt-2"># 2. 一键打包命令 (不显示黑窗口控制台)：</span>
            <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded block">pyinstaller --onefile --noconsole --name="FootballQuantAnalyzer" football_quant_analyzer.py</code>
          </div>
        </div>

        <button
          onClick={handleExportPython}
          disabled={isExporting}
          className={`w-full font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-lg transition-all ${isExporting ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
        >
          {isExporting ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              正在生成 Python 脚本...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              立即下载 standalone 桌面端 Python 脚本文件
            </>
          )}
        </button>
      </div>

      <div className="lg:col-span-8 p-5 bg-[#0F1424] rounded-2xl border border-slate-800 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 mb-3">
          <Info className="w-4 h-4 text-[#FF8008]" />
          一键部署到 Windows 说明 (XP/Win10/Win11 兼容)
        </h3>
        
        <div className="space-y-4 text-xs text-slate-300">
          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800/60 leading-relaxed">
            <h4 className="font-bold text-slate-200 mb-1">Q1：如何无代理无配置一键运行？</h4>
            <p>本平台导出的 Python 桌面脚本是全自理安装模式。第一次在 Windows 下普通终端运行时，如果它检测到您缺失了 CustomTkinter 桌面美化皮肤渲染组件，它将<strong>自动为您执行 pip 物理命令</strong>，无需您具有任何 Python 开发知识。</p>
          </div>

          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800/60 leading-relaxed">
            <h4 className="font-bold text-slate-200 mb-1">Q2：为什么要内置本地 H2H 与 Standings 数据库？</h4>
            <p>这样可以使打包后的 exe <strong>完全摆脱对局域网及任何高昂付费体育 API 密钥的绑定</strong>。用户完全自主在左边面板输入即时水位并微调队伍的历史表现即可完成两代豪门的攻防对撞演习，免去了服务器拥堵停机或反爬限制崩溃的问题。</p>
          </div>

          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800/60 leading-relaxed">
            <h4 className="font-bold text-slate-200 mb-1">Q3：算法性能和 Windows 的稳定性如何？</h4>
            <p>CustomTkinter 基于 Win11 现代原生的 Tk 库进行了高阶渲染，采用 GPU 硬件绘图，而 Poisson 进球期望使用了完全的矢量 numpy / math 多线程计算。我们在 Python 代码中加入了全方位的 <strong className="text-rose-400">try-except 避震机制</strong>，即使对战选择或欧赔输入出现极端负数/文本，亦能有良好的错误弹窗阻隔，保证软件不崩溃。</p>
          </div>
        </div>
      </div>

    </div>
  );
}