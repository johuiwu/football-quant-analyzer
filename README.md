# 足球竞彩客观数学量化决策平台 v2.6

集成10大意图公式数学模型的足球赔率量化预测工具。支持主客队挑选/数据自定义，内置欧亚盘赔付分析、Poisson分布大小球预测及 DeepSeek AI 战术推演。

## 本地运行

**前置要求:** Node.js

1. 安装依赖:
   `npm install`
2. 在 `.env` 文件中配置 `DEEPSEEK_API_KEY` (AI 功能可选，缺失自动降级)
3. 启动应用:
   `npm run dev`

访问 http://localhost:3000

## AI 功能

本项目使用 **DeepSeek AI** (`deepseek-chat`) 驱动以下功能:
- 球队战术画像生成
- 赛事 AI 专家点评分析

核心量化模型 (Poisson/Dixon-Coles/Elo/Kelly) 完全离线运行，不依赖 AI API。

