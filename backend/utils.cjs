// 简化版 utils 供 backend 使用
const { getPythonScriptContent } = function(weights) {
  const w = {
    odds: Number(weights?.odds) || 0.45,
    strength: Number(weights?.strength) || 0.30,
    homeAway: Number(weights?.homeAway) || 0.15,
    h2h: Number(weights?.h2h) || 0.10,
    form: Number(weights?.form) || 0.05,
  };
  for (const key of Object.keys(w)) { w[key] = Math.max(0, Math.min(1, w[key])); }
  return `import os
import math
import json
import tkinter as tk
from tkinter import ttk, messagebox
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# 简易版 Python 脚本示例
print("Football Quant Model")
`;
};

const calculateBetsModel = function(homeTeam, awayTeam, odds, line, customWeights) {
  return {
    compHomeWin: 0.4,
    compDraw: 0.3,
    compAwayWin: 0.3,
    homeAttackIndex: 1.2,
    homeDefenseIndex: 0.9,
    awayAttackIndex: 1.1,
    awayDefenseIndex: 1.0,
    expectedHomeGoals: 1.5,
    expectedAwayGoals: 1.2,
    homeFormScore: 75,
    awayFormScore: 68,
    h2hHomeAdv: 0.55,
    h2hPlayedCount: 0,
    xgStrengthDiff: 0.2,
    recommendedDirection: "主胜",
  };
};

module.exports = {
  getPythonScriptContent,
  calculateBetsModel,
};
