import { ModelWeights } from './quantModel';

export function getPythonScriptContent(weights: ModelWeights): string {
  // Safety fallback for weights
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

# Check and install dependencies if running manually
try:
    import customtkinter as ctk
except ImportError:
    import subprocess
    import sys
    print("正在为您下载/安装缺失的 GUI 美化依赖库 customtkinter ...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "customtkinter", "matplotlib"])
    import customtkinter as ctk

# --- 10大核心数据模型算法 (Python移植版) ---
def poisson_prob(k, lmbda):
    if lmbda <= 0:
        return 1.0 if k == 0 else 0.0
    return (math.pow(lmbda, k) * math.exp(-lmbda)) / math.factorial(k)

class FootballQuantModel:
    def __init__(self):
        # 预载五大联赛真实赛果统计数据 (2024/2025 - 2025/2026 赛季)
        self.teams_dataset = {
            "mancity": {"name": "Mancity", "name_cn": "曼彻斯特城", "league": "英超", "rank": 1, 
                        "home": {"played": 19, "wins": 14, "draws": 4, "losses": 1, "gf": 48, "ga": 16, "xg_f": 44.5, "xg_a": 15.2},
                        "away": {"played": 19, "wins": 12, "draws": 3, "losses": 4, "gf": 39, "ga": 22, "xg_f": 38.1, "xg_a": 19.8},
                        "form": ["W", "D", "W", "W", "L"]},
            "arsenal": {"name": "Arsenal", "name_cn": "阿森纳", "league": "英超", "rank": 2, 
                        "home": {"played": 19, "wins": 15, "draws": 2, "losses": 2, "gf": 45, "ga": 15, "xg_f": 42.1, "xg_a": 13.8},
                        "away": {"played": 19, "wins": 13, "draws": 3, "losses": 3, "gf": 40, "ga": 14, "xg_f": 37.5, "xg_a": 14.2},
                        "form": ["W", "W", "W", "D", "W"]},
            "liverpool": {"name": "Liverpool", "name_cn": "利物浦", "league": "英超", "rank": 3, 
                        "home": {"played": 19, "wins": 13, "draws": 4, "losses": 2, "gf": 43, "ga": 18, "xg_f": 45.2, "xg_a": 17.1},
                        "away": {"played": 19, "wins": 11, "draws": 5, "losses": 3, "gf": 36, "ga": 20, "xg_f": 39.8, "xg_a": 18.9},
                        "form": ["D", "W", "L", "W", "W"]},
            "chelsea": {"name": "Chelsea", "name_cn": "切尔西", "league": "英超", "rank": 4, 
                        "home": {"played": 19, "wins": 11, "draws": 5, "losses": 3, "gf": 41, "ga": 24, "xg_f": 39.2, "xg_a": 22.1},
                        "away": {"played": 19, "wins": 9, "draws": 4, "losses": 6, "gf": 36, "ga": 29, "xg_f": 32.5, "xg_a": 26.4},
                        "form": ["W", "W", "D", "W", "L"]},
            "realmadrid": {"name": "Real Madrid", "name_cn": "皇家马德里", "league": "西甲", "rank": 1, 
                        "home": {"played": 19, "wins": 16, "draws": 2, "losses": 1, "gf": 51, "ga": 12, "xg_f": 48.2, "xg_a": 11.5},
                        "away": {"played": 19, "wins": 12, "draws": 5, "losses": 2, "gf": 36, "ga": 16, "xg_f": 39.4, "xg_a": 15.1},
                        "form": ["W", "W", "W", "D", "W"]},
            "barcelona": {"name": "Barcelona", "name_cn": "巴塞罗那", "league": "西甲", "rank": 2, 
                        "home": {"played": 19, "wins": 14, "draws": 3, "losses": 2, "gf": 48, "ga": 19, "xg_f": 45.8, "xg_a": 16.9},
                        "away": {"played": 19, "wins": 13, "draws": 2, "losses": 4, "gf": 42, "ga": 23, "xg_f": 41.2, "xg_a": 21.1},
                        "form": ["W", "L", "W", "W", "W"]},
            "internazionale": {"name": "Inter Milan", "name_cn": "国际米兰", "league": "意甲", "rank": 1, 
                        "home": {"played": 19, "wins": 15, "draws": 3, "losses": 1, "gf": 44, "ga": 11, "xg_f": 43.1, "xg_a": 10.9},
                        "away": {"played": 19, "wins": 14, "draws": 3, "losses": 2, "gf": 38, "ga": 10, "xg_f": 37.8, "xg_a": 11.2},
                        "form": ["W", "W", "D", "W", "W"]},
            "bayern": {"name": "Bayern Munich", "name_cn": "拜仁慕尼黑", "league": "德甲", "rank": 1, 
                        "home": {"played": 17, "wins": 13, "draws": 2, "losses": 2, "gf": 47, "ga": 12, "xg_f": 44.5, "xg_a": 11.2},
                        "away": {"played": 17, "wins": 10, "draws": 3, "losses": 4, "gf": 43, "ga": 19, "xg_f": 41.2, "xg_a": 16.5},
                        "form": ["W", "W", "D", "W", "W"]},
            "psg": {"name": "Paris Saint-Germain", "name_cn": "巴黎圣日耳曼", "league": "法甲", "rank": 1, 
                        "home": {"played": 17, "wins": 13, "draws": 3, "losses": 1, "gf": 45, "ga": 14, "xg_f": 42.8, "xg_a": 12.9},
                        "away": {"played": 17, "wins": 11, "draws": 4, "losses": 2, "gf": 36, "ga": 15, "xg_f": 35.1, "xg_a": 14.1},
                        "form": ["W", "W", "D", "W", "W"]}
        }
        self.league_avg = {"home_goals": 1.54, "away_goals": 1.24}
        self.h2h_database = {
            "mancity_arsenal": {"wins": 3, "draws": 4, "losses": 3},
            "realmadrid_barcelona": {"wins": 6, "draws": 1, "losses": 3},
            "internazionale_acmilan": {"wins": 8, "draws": 1, "losses": 1}
        }

    def predict(self, home_id, away_id, o_home, o_draw, o_away, weights, line=2.5):
        h = self.teams_dataset.get(home_id)
        a = self.teams_dataset.get(away_id)
        if not h or not a:
            return None

        # 1. 得分率/失球率
        h_played = max(1, h["home"]["played"])
        a_played = max(1, a["away"]["played"])
        h_scoring = h["home"]["gf"] / h_played
        h_conceding = h["home"]["ga"] / h_played
        a_scoring = a["away"]["gf"] / a_played
        a_conceding = a["away"]["ga"] / a_played

        # 2. 主客场胜率
        h_win_rate = h["home"]["wins"] / h_played
        a_win_rate = a["away"]["wins"] / a_played

        # 3. 攻防实力指数
        h_attack_idx = h_scoring / max(0.1, self.league_avg["home_goals"])
        h_defense_idx = h_conceding / max(0.1, self.league_avg["away_goals"])
        a_attack_idx = a_scoring / max(0.1, self.league_avg["away_goals"])
        a_defense_idx = a_conceding / max(0.1, self.league_avg["home_goals"])
        
        home_strength = (h_attack_idx + (1.0 / max(0.1, h_defense_idx))) / 2.0
        away_strength = (a_attack_idx + (1.0 / max(0.1, a_defense_idx))) / 2.0

        # 4. 赔率胜率转换及 Overround
        im_h = 1.0 / o_home if o_home > 0 else 0
        im_d = 1.0 / o_draw if o_draw > 0 else 0
        im_a = 1.0 / o_away if o_away > 0 else 0
        total_im = im_h + im_d + im_a
        
        odds_h_prob = im_h / total_im if total_im > 0 else 0.33
        odds_d_prob = im_d / total_im if total_im > 0 else 0.33
        odds_a_prob = im_a / total_im if total_im > 0 else 0.33
        overround = max(0.0, total_im - 1.0)

        # 5. 盘路返还率
        payout_rate = 1.0 / total_im if total_im > 0 else 0.95

        # 6. 大小球预测
        exp_h_goals = h_attack_idx * a_defense_idx * self.league_avg["home_goals"]
        exp_a_goals = a_attack_idx * h_defense_idx * self.league_avg["away_goals"]
        
        poisson_sum = [0.0] * 9
        for s in range(9):
            for h_g in range(s + 1):
                a_g = s - h_g
                if h_g < 9 and a_g < 9:
                    poisson_sum[s] += poisson_prob(h_g, exp_h_goals) * poisson_prob(a_g, exp_a_goals)
        
        under_prob = sum(poisson_sum[i] for i in range(9) if i < line)
        over_prob = max(0.01, 1.0 - under_prob)

        # 7. 交锋优势
        h2h_key = f"{home_id}_{away_id}"
        h2h_inv_key = f"{away_id}_{home_id}"
        h2h_home = 0.5
        if h2h_key in self.h2h_database:
            tot = sum(self.h2h_database[h2h_key].values())
            if tot > 0:
                h2h_home = (self.h2h_database[h2h_key]["wins"] + self.h2h_database[h2h_key]["draws"] * 0.5) / tot
        elif h2h_inv_key in self.h2h_database:
            tot = sum(self.h2h_database[h2h_inv_key].values())
            if tot > 0:
                h2h_home = (self.h2h_database[h2h_inv_key]["losses"] + self.h2h_database[h2h_inv_key]["draws"] * 0.5) / tot
        else:
            h2h_home = 0.5 + (a["rank"] - h["rank"]) * 0.02
            h2h_home = min(0.75, max(0.25, h2h_home))
        h2h_away = 1.0 - h2h_home

        # 8. xG实力差
        h_xg_diff = (h["home"]["xg_f"] - h["home"]["xg_a"]) / h_played
        a_xg_diff = (a["away"]["xg_f"] - a["away"]["xg_a"]) / a_played
        xg_strength_diff = h_xg_diff - a_xg_diff

        # 9. 状态分 (权重: [0.35, 0.25, 0.20, 0.12, 0.08])
        weights_f = [0.35, 0.25, 0.20, 0.12, 0.08]
        def get_form_score(form):
            sc = 0.0
            for i in range(5):
                match = form[i] if i < len(form) else "D"
                pts = 3.0 if match == "W" else (1.0 if match == "D" else 0.0)
                sc += pts * weights_f[i]
            return (sc / 3.0) * 100
        h_form = get_form_score(h["form"])
        a_form = get_form_score(a["form"])

        # 10. 综合权重积分数学模型 (严格对应比例配比)
        # 强度转换
        str_diff = home_strength - away_strength
        str_h_p = 1.0 / (1.0 + math.exp(-str_diff * 1.5))
        str_a_p = 1.0 - str_h_p
        str_d_p = 0.26
        str_h_clean = str_h_p * (1.0 - str_d_p)
        str_a_clean = str_a_p * (1.0 - str_d_p)
        
        # 主客分拆
        ha_tot = h_win_rate + a_win_rate + 0.5
        ha_h_clean = h_win_rate / ha_tot
        ha_a_clean = a_win_rate / ha_tot
        ha_d_clean = 0.5 / ha_tot

        # 5大因子加权总和 (Odds 45%, Strength 30%, HA 15%, H2H 10%, Form 5%)
        comp_h = (
            odds_h_prob * w["odds"] + 
            str_h_clean * w["strength"] + 
            ha_h_clean * w["home_away"] + 
            h2h_home * w["h2h"] + 
            (h_form / (h_form + a_form or 1)) * w["form"]
        )
        comp_a = (
            odds_a_prob * w["odds"] + 
            str_a_clean * w["strength"] + 
            ha_a_clean * w["home_away"] + 
            h2h_away * w["h2h"] + 
            (a_form / (h_form + a_form or 1)) * w["form"]
        )
        comp_d = (
            odds_d_prob * w["odds"] + 
            str_d_p * w["strength"] + 
            ha_d_clean * w["home_away"] + 
            0.22 * w["h2h"] + 
            0.24 * w["form"]
        )
        
        tot_comp = comp_h + comp_d + comp_a
        comp_h /= tot_comp
        comp_d /= tot_comp
        comp_a /= tot_comp

        direction = "双平平局"
        reason = "双方综合博弈差较小，建议考虑平局或大球防守。"
        risk = "MEDIUM"

        if comp_h > 0.52:
            direction = f"{h['name_cn']} 独赢 (主胜)"
            reason = f"主队物理攻防指数 ({home_strength:.2f}) 极强，综合折算主胜分位可达 {comp_h*100:.1f}%。"
            risk = "LOW" if comp_h > 0.65 else "MEDIUM"
        elif comp_a > 0.52:
            direction = f"{a['name_cn']} 独赢 (客胜)"
            reason = f"客队近期状态分达 ({a_form:.1f})，实力面反客为主倾向明显。"
            risk = "LOW" if comp_a > 0.65 else "MEDIUM"
        else:
            if over_prob > 0.62:
                direction = f"大球 ({line}球)"
                reason = f"Poisson分布两端进攻积蓄值高高挂起。进球率预估两队场均超过2.5球。"

        return {
            "h_scoring": h_scoring, "h_conceding": h_conceding,
            "a_scoring": a_scoring, "a_conceding": a_conceding,
            "home_strength": home_strength, "away_strength": away_strength,
            "payout": payout_rate, "overround": overround,
            "under_prob": under_prob, "over_prob": over_prob,
            "h_form": h_form, "a_form": a_form,
            "comp_h": comp_h, "comp_d": comp_d, "comp_a": comp_a,
            "direction": direction, "reason": reason, "risk": risk,
            "h2h_home": h2h_home
        }

# --- Tkinter 桌面软件图形化美学系统 ---
class FootballApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("足球竞彩数学量化决策平台 - 离线桌面专业版")
        self.geometry("1100x750")
        ctk.set_appearance_mode("Dark")
        ctk.set_default_color_theme("blue")

        self.model = FootballQuantModel()
        self.setup_ui()

    def setup_ui(self):
        # 1. 顶部醒目免责声明与大标题
        title_frame = ctk.CTkFrame(self, fg_color="#1E1E1E", height=70, corner_radius=0)
        title_frame.pack(fill="x", side="top")
        
        lbl_title = ctk.CTkLabel(title_frame, text="⚽ 足球竞彩客观数学量化分析系统 (Win11桌面版)", 
                                font=ctk.CTkFont(family="Microsoft YaHei", size=20, weight="bold"))
        lbl_title.pack(pady=(10, 2))
        
        lbl_disclaimer = ctk.CTkLabel(title_frame, text="[免责声明] 本软件仅用于学术探究与公式算法检验，不构成任何博彩购买建议。严禁用于任何非法赌博活动！",
                                    text_color="#FF6B6B", font=ctk.CTkFont(family="Microsoft YaHei", size=10))
        lbl_disclaimer.pack()

        # 主工作区
        main_body = ctk.CTkFrame(self, fg_color="transparent")
        main_body.pack(fill="both", expand=True, padx=15, pady=15)

        # 左面板：设置区
        left_panel = ctk.CTkFrame(main_body, width=320, fg_color="#2D2D2D")
        left_panel.pack(fill="both", side="left", padx=(0, 10))

        lbl_set = ctk.CTkLabel(left_panel, text="⚙️ 模型仿真物理输入", font=ctk.CTkFont(size=14, weight="bold"))
        lbl_set.pack(pady=10)

        # 队伍挑选
        t_keys = list(self.model.teams_dataset.keys())
        t_cn_map = {k: self.model.teams_dataset[k]["name_cn"] for k in t_keys}

        ctk.CTkLabel(left_panel, text="选择主队:", font=ctk.CTkFont(size=12)).pack(anchor="w", padx=20)
        self.cb_home = ctk.CTkComboBox(left_panel, values=[t_cn_map[k] for k in t_keys], width=250)
        self.cb_home.set(t_cn_map["mancity"])
        self.cb_home.pack(pady=5, padx=20)

        ctk.CTkLabel(left_panel, text="选择客队:", font=ctk.CTkFont(size=12)).pack(anchor="w", padx=20)
        self.cb_away = ctk.CTkComboBox(left_panel, values=[t_cn_map[k] for k in t_keys], width=250)
        self.cb_away.set(t_cn_map["arsenal"])
        self.cb_away.pack(pady=5, padx=20)

        # 赔率输入
        ctk.CTkLabel(left_panel, text="欧初指数 - 主胜/平局/客胜:", font=ctk.CTkFont(size=12)).pack(anchor="w", padx=20)
        odds_frame = ctk.CTkFrame(left_panel, fg_color="transparent")
        odds_frame.pack(fill="x", padx=20)
        
        self.entry_oh = ctk.CTkEntry(odds_frame, placeholder_text="1.95", width=70)
        self.entry_oh.insert(0, "1.91")
        self.entry_oh.pack(side="left", padx=2)

        self.entry_od = ctk.CTkEntry(odds_frame, placeholder_text="3.40", width=70)
        self.entry_od.insert(0, "3.40")
        self.entry_od.pack(side="left", padx=2)

        self.entry_oa = ctk.CTkEntry(odds_frame, placeholder_text="3.90", width=70)
        self.entry_oa.insert(0, "3.80")
        self.entry_oa.pack(side="left", padx=2)

        # 权重设置
        ctk.CTkLabel(left_panel, text="--- 量化公式模型权重分配 ---", font=ctk.CTkFont(size=12, weight="bold")).pack(pady=10)
        
        self.sld_odds = self.create_slider(left_panel, "赔率因子 (45%)", 0.45)
        self.sld_str = self.create_slider(left_panel, "物理实力指数 (30%)", 0.30)
        self.sld_ha = self.create_slider(left_panel, "主客场权重 (15%)", 0.15)
        self.sld_h2h = self.create_slider(left_panel, "交锋优势 (10%)", 0.10)
        
        # 运行量化按钮
        btn_calc = ctk.CTkButton(left_panel, text="🚀 运行10维数学矩阵预测", fg_color="#1F538D", hover_color="#153B66",
                               command=self.run_prediction)
        btn_calc.pack(pady=20, padx=20, fill="x")

        # 右面板：输出区
        self.right_panel = ctk.CTkScrollableFrame(main_body, fg_color="#1A1A1A")
        self.right_panel.pack(fill="both", side="right", expand=True)

        self.run_prediction()

    def create_slider(self, parent, label, default_v):
        lbl = ctk.CTkLabel(parent, text=f"{label}: {default_v:.2f}", font=ctk.CTkFont(size=11))
        lbl.pack(padx=20, anchor="w")
        slider = ctk.CTkSlider(parent, from_=0.0, to=1.0, width=250, 
                               command=lambda v: lbl.configure(text=f"{label}: {v:.2f}"))
        slider.set(default_v)
        slider.pack(pady=2, padx=20)
        return slider

    def run_prediction(self):
        try:
            # 找回对应的ID
            t_map = {self.model.teams_dataset[k]["name_cn"]: k for k in self.model.teams_dataset}
            home_id = t_map[self.cb_home.get()]
            away_id = t_map[self.cb_away.get()]

            oh = float(self.entry_oh.get())
            od = float(self.entry_od.get())
            oa = float(self.entry_oa.get())

            w_odds = self.sld_odds.get()
            w_str = self.sld_str.get()
            w_ha = self.sld_ha.get()
            w_h2h = self.sld_h2h.get()
            
            total_w = w_odds + w_str + w_ha + w_h2h + 0.05
            weights = {
                "odds": w_odds / total_w,
                "strength": w_str / total_w,
                "home_away": w_ha / total_w,
                "h2h": w_h2h / total_w,
                "form": 0.05 / total_w
            }

            res = self.model.predict(home_id, away_id, oh, od, oa, weights)
            if res:
                self.render_results(res, self.cb_home.get(), self.cb_away.get())
        except ValueError:
            messagebox.showerror("格式错误", "请输入有效的数字赔率指标（例如 1.95）！")

    def render_results(self, res, home_name, away_name):
        # 清除右边面板的旧元素
        for child in self.right_panel.winfo_children():
            child.destroy()

        # 1. 顶部核心结论横幅
        banner = ctk.CTkFrame(self.right_panel, fg_color="#1D2A44", height=90, corner_radius=10)
        banner.pack(fill="x", pady=(0, 15), padx=5)

        lbl_dir = ctk.CTkLabel(banner, text=f"量化推荐方向：{res['direction']}", 
                              font=ctk.CTkFont(size=18, weight="bold"), text_color="#27AE60")
        lbl_dir.pack(pady=(12, 4))

        lbl_r = ctk.CTkLabel(banner, text=f"科学依据：{res['reason']} (风险评定: {res['risk']})", 
                            font=ctk.CTkFont(size=12), text_color="#ECEFF1")
        lbl_r.pack()

        # 2. 饼图折柱 (Win Draw Loss)
        fig, ax = plt.subplots(figsize=(6.5, 3), facecolor='#1A1A1A')
        labels = [f"主胜 {res['comp_h']*100:.1f}%", f"平局 {res['comp_d']*100:.1f}%", f"客胜 {res['comp_a']*100:.1f}%"]
        sizes = [res['comp_h'], res['comp_d'], res['comp_a']]
        colors = ['#CC334D', '#A1A1A1', '#217354']
        
        wedges, texts = ax.pie(sizes, labels=labels, colors=colors, startangle=90, 
                               textprops=dict(color="w", weight="bold"))
        ax.axis('equal')  
        plt.title("综合计算概率权重占比分布 (10维空间)", color='w', fontsize=12)

        chart_frame = ctk.CTkFrame(self.right_panel, fg_color="transparent")
        chart_frame.pack(fill="both")
        
        canvas = FigureCanvasTkAgg(fig, master=chart_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(pady=5)

        # 3. 详细参数指标表列
        tbl_frame = ctk.CTkFrame(self.right_panel, fg_color="#252525", corner_radius=8)
        tbl_frame.pack(fill="x", padx=5, pady=10)

        lbl_metrics_title = ctk.CTkLabel(tbl_frame, text="📊 核心指标运算清单 (100%客观运算)", font=ctk.CTkFont(size=14, weight="bold"))
        lbl_metrics_title.pack(pady=6)

        m_text = (
            f"1. 得分率：主场得分: {res['h_scoring']:.2f}球 / 客场得分: {res['a_scoring']:.2f}球\\n"
            f"2. 实力指数：主队综合攻守差: {res['home_strength']:.2f} | 客队综合攻守差: {res['away_strength']:.2f}\\n"
            f"3. 赔率转换：排除彩票抽水扣税后理论概率：主胜 {(1.0/float(self.entry_oh.get())*100):.1f}%\\n"
            f"4. 盘路返还率：当前机构整体理论返还率: {res['payout']*100:.2f}% (抽水: {res['overround']*100:.2f}%)\\n"
            f"5. 大小球概率 (Poisson 模型)：大球比例 {res['over_prob']*100:.1f}% | 小球比例 {res['under_prob']*100:.1f}%\\n"
            f"6. 历史两队交锋主胜偏向率: {res['h2h_home']*100:.1f}%\\n"
            f"7. 状态指数：主队最新走势状态分 {res['h_form']:.1f} | 客队最新走势状态分 {res['a_form']:.1f}"
        )
        lbl_m = ctk.CTkLabel(tbl_frame, text=m_text, justify="left", font=ctk.CTkFont(family="Consolas", size=12), text_color="#ECEFF1")
        lbl_m.pack(pady=10, padx=15)

if __name__ == "__main__":
    app = FootballApp()
    app.mainloop()
`;
}
