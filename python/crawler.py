#!/usr/bin/env python3
"""
qiumiwu.com 全量球队统计数据爬虫

用法:
    python python/crawler.py                          # 全新爬取全部五大联赛球队
    python python/crawler.py --league europe         # 全新爬取全部五大联赛球队
    python python/crawler.py --league jleague        # 全新爬取全部J联赛球队
    python python/crawler.py --league kleague1       # 全新爬取韩K1联赛球队
    python python/crawler.py --league kleague2       # 全新爬取韩K2联赛球队
    python python/crawler.py --league top10          # 爬取十大联赛
    python python/crawler.py --league all            # 爬取全部联赛(去重)
    python python/crawler.py --resume                # 从上次中断处恢复
    python python/crawler.py --limit 10              # 仅爬取10支球队（测试模式）

依赖安装:
    pip install -r python/requirements.txt

输出:
    output/all_teams_data.csv     — 全部成功爬取的球队数据
    python/crawl_progress.json   — 断点续爬状态
    python/failed_teams.txt      — 失败的球队列表
"""

import requests
import re
import json
import time
import os
import sys
import random
import csv
from pathlib import Path
from bs4 import BeautifulSoup

# ======================== 可选依赖 ========================

try:
    from pypinyin import pinyin, Style
    HAS_PYPINYIN = True
except ImportError:
    HAS_PYPINYIN = False
    print("[WARN] pypinyin 未安装，将使用文件内的预设拼音slug。安装: pip install pypinyin")

# ======================== 配置 ========================

BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
)
REQUEST_TIMEOUT = 25
MIN_DELAY = 1.0
MAX_DELAY = 2.5
SAVE_INTERVAL = 5  # 每5支球队保存一次进度

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
PROGRESS_FILE = SCRIPT_DIR / "crawl_progress.json"
FAILED_FILE = SCRIPT_DIR / "failed_teams.txt"
TEAM_LIST_FILE = SCRIPT_DIR / "五大联赛参赛球队名单.md"
JLEAGUE_TEAMS_FILE = SCRIPT_DIR / "日本J级联赛名单.md"
KLEAGUE_TEAMS_FILE = SCRIPT_DIR / "韩K联赛参赛球队名单.md"
TOP10_TEAMS_FILE = SCRIPT_DIR / "十大联赛参赛球队名单.md"
ELITESERIEN_FILE = SCRIPT_DIR / "挪超联赛参赛球队名单.md"
ALLSVENSKAN_FILE = SCRIPT_DIR / "瑞超联赛参赛球队名单.md"
VEIKKAUSLIIGA_FILE = SCRIPT_DIR / "芬超联赛参赛球队名单.md"
WORLDCUP_FILE = SCRIPT_DIR / "世界杯国家队名单.md"

# ======================== 字段映射 ========================

# qiumiwu.com 锚点 hash → 数据库列名
HASH_TO_FIELD = {
    "goals":"goals","goals_against":"conceded","goal_diff":"goalDifference",
    "goal_difference":"goalDifference","corner_kicks":"corners","corners":"corners",
    "shots":"shots","shots_on_target":"shotsOnTarget","assists":"assists",
    "passes":"passes","penalty":"penalties","penalties":"penalties",
    "fouls":"fouls","red_cards":"redCards","yellow_cards":"yellowCards",
    "avg_goals":"avgGoals","avg_conceded":"avgConceded",
    "avg_goals_against":"avgConceded","avg_goal_diff":"avgGoalDiff",
    "avg_goal_difference":"avgGoalDiff","avg_corners":"avgCorners",
    "avg_corner_kicks":"avgCorners","possession":"possession",
    "ball_possession":"possession","tackles":"tackles",
    "interceptions":"interceptions","clearances":"clearances",
    "offsides":"offsides","was_fouled":"foulsSuffered",
    "fouls_suffered":"foulsSuffered","key_passes":"keyPasses",
    "crosses":"crosses","crosses_successful":"crossesSuccessful",
    "successful_crosses":"crossesSuccessful","crosses_accuracy":"crossesSuccessful",
    "long_balls":"longBalls","long_balls_successful":"successfulLongBalls",
    "successful_long_balls":"successfulLongBalls","long_balls_accuracy":"successfulLongBalls",
    "free_kicks":"freeKicks","freekicks":"freeKicks",
    "free_kick_goals":"freeKickGoals","freekick_goals":"freeKickGoals",
    "dribble":"dribbles","dribbles":"dribbles","dribble_succ":"successfulDribbles",
    "successful_dribbles":"successfulDribbles","duels":"duelsTotal","duels_won":"duelsWon",
    "fastbreaks":"fastBreaks","fast_breaks":"fastBreaks",
    "fastbreak_shots":"fastBreakShots","fast_break_shots":"fastBreakShots",
    "fastbreak_goals":"fastBreakGoals","fast_break_goals":"fastBreakGoals",
    "hit_woodwork":"hitWoodwork","poss_losts":"possessionLost",
    "possession_lost":"possessionLost","clean_sheets":"cleanSheets",
    "yellow2red_cards":"twoYellowRedCards","two_yellow_red":"twoYellowRedCards",
    "blocked_shots":"effectiveBlocks","effective_blocks":"effectiveBlocks",
    "passes_accuracy":"passesSuccessful",
}

# CSV 输出列顺序（与数据库 team_stats 表对齐）
OUTPUT_COLS = [
    "team_name", "team_name_cn", "team_id", "league", "league_cn",
    "goals", "conceded", "goalDifference", "shots", "shotsOnTarget",
    "assists", "passes", "corners", "fouls", "redCards", "yellowCards",
    "penalties", "cleanSheets",
    "avgGoals", "avgConceded", "avgGoalDiff", "avgCorners",
    "possession",
    "tackles", "interceptions", "clearances", "offsides",
    "foulsSuffered", "keyPasses",
    "crosses", "crossesSuccessful", "successfulCrosses",
    "longBalls", "successfulLongBalls",
    "freeKicks", "freeKickGoals",
    "dribbles", "successfulDribbles", "duelsWon",
    "fastBreaks", "fastBreakShots", "fastBreakGoals",
    "hitWoodwork", "possessionLost",
    "twoYellowRedCards", "effectiveBlocks",
    "passesSuccessful", "duelsTotal",
]


# ======================== 内置拼音slug（pypinyin 不可用时回退） ========================

FALLBACK_SLUGS = {
    # 英超 — 来源: ALL_LEAGUE_TEAMS 中的 id 字段
    "伯恩茅斯":"boenmaosi","阿森纳":"asenna","阿斯顿维拉":"asidunweila",
    "布伦特福德":"buluntefude","布莱顿":"bulaidun","伯恩利":"boenli",
    "切尔西":"qieerxi","水晶宫":"shuijinggong","埃弗顿":"aifudun",
    "富勒姆":"fuleimu","利兹联":"lizilian","利物浦":"liwupu",
    "曼城":"mancheng","曼联":"manlian","纽卡斯尔联":"niukasier",
    "诺丁汉森林":"nuodinghan","桑德兰":"sangdelan",
    "热刺":"reci","西汉姆联":"xihanmu","狼队":"langdui",
    # 西甲
    "毕尔巴鄂竞技":"bierbae","阿拉维斯":"alaweisi",
    "巴塞罗那":"basaluona","塞尔塔":"saierta","埃尔切":"aierqie",
    "西班牙人":"xibanyaren","赫罗纳":"heluona","莱万特":"laiwante",
    "马略卡":"maluoka","奥萨苏纳":"aosasuna","奥维耶多":"aoweiyeduo",
    "皇家贝蒂斯":"beidisi","皇家社会":"huangjiashehui",
    "塞维利亚":"saiweiliya","比利亚雷亚尔":"biliyaleiyaer",
    "瓦伦西亚":"walunxiya","马德里竞技":"madelijingji","赫塔费":"hetafei",
    "巴列卡诺":"baliekanuo","皇家马德里":"huangma",
    # 意甲
    "亚特兰大":"yatelanda","博洛尼亚":"boluoniya","卡利亚里":"kaliyali",
    "克雷莫内塞":"keleimona","科莫":"kemo","佛罗伦萨":"foluolunsa",
    "热那亚":"renaya","国际米兰":"guojimilan","尤文图斯":"youwentusi",
    "拉齐奥":"laqiao","莱切":"laiqie","AC米兰":"acmilan",
    "那不勒斯":"nabulesi","帕尔马":"paerma","比萨":"bisa","罗马":"luoma",
    "萨索洛":"sasuoluo","都灵":"duling","乌迪内斯":"wudineisi","维罗纳":"weiluona",
    # 德甲
    "奥格斯堡":"aogesibao","柏林联合":"bolinlianhe",
    "云达不莱梅":"bulaimei","多特蒙德":"duotemengde",
    "法兰克福":"falankefu","弗赖堡":"fulaibao","汉堡":"hanbao1",
    "海登海姆":"haidenghaimu","霍芬海姆":"huofenhaimu","科隆":"kelong",
    "RB莱比锡":"laihongniu","勒沃库森":"leiwokusen","美因茨":"meiyinci",
    "门兴格拉德巴赫":"menxing","门兴":"menxing",
    "拜仁慕尼黑":"bairen",
    "圣保利":"shengbao","斯图加特":"situjiate","沃尔夫斯堡":"wofusibao",
    # 法甲
    "巴黎圣日耳曼":"balishengman","马赛":"masai","摩纳哥":"monage",
    "尼斯":"nisi","里尔":"lier","里昂":"liang",
    "斯特拉斯堡":"sitelasi","朗斯":"langsi","布雷斯特":"buleisite",
    "图卢兹":"tuluzi","欧塞尔":"ousaier","雷恩":"leien","南特":"nante",
    "昂热":"angre","勒阿弗尔":"leiafuer","洛里昂":"luoliang",
    "巴黎FC":"balifc","梅斯":"meisi",
    # 曼城/曼联别名（兼容旧格式中文全称）
    "曼彻斯特城":"mancheng","曼彻斯特联":"manlian",
    "托特纳姆热刺":"reci","纽卡斯尔":"niukasier",
    # 中超
    "上海申花":"shanghaishenhua","上海海港":"shanghaihaigang",
    "北京国安":"beijingguoan","山东泰山":"shandongtaishan",
    "成都蓉城":"chedurongcheng","武汉三镇":"wuhansanzhen",
    "浙江队":"zhejiangdui","天津津门虎":"tianjinjinmenhu",
    "长春亚泰":"changchunyatai","河南队":"henandui",
    # J联赛
    "川崎前锋":"chuanqiqianfeng","横滨水手":"hengbinshuishou",
    "浦和红钻":"puhehongzuan","鹿岛鹿角":"ludaolujiao",
    "神户胜利船":"shenhushenglichuan","广岛三箭":"guangdaosanjian",
    "名古屋鲸八":"mingguwujingyu","FC东京":"fcdongjing",
    "大阪樱花":"dabanyinghua","大阪钢巴":"dabangangba",
    "冈山绿雉":"gangshanlyuzhi","清水鼓动":"qingshuixintiao",
    "町田泽维":"tingtianzeweiya","东京绿茵":"dongjinglyuyin",
    "京都":"jingdubusiniao","柏太阳神":"baitaiyangshen",
    "长崎成功丸":"changqichenggongwan","水户蜀葵":"shuihushukui",
    "千叶市原":"qianyeshiyuan","福冈黄蜂":"fuganghuangfeng",
    # 荷甲
    "阿贾克斯":"ajiakesi","PSV埃因霍温":"psvaiyinhuowen",
    "费耶诺德":"feiyenuode","阿尔克马尔":"aerkemaer",
    "特温特":"tewente","乌德勒支":"wudelezhi",
    "维特斯":"weitesi","海伦芬":"hailunfen",
    # 葡超
    "本菲卡":"benfeika","波尔图":"boertu","葡萄牙体育":"putaoyatiyu",
    "布拉加":"bulajia","吉马良斯":"jimaliangsi",
    "博阿维斯塔":"boaweisita","里奥阿维":"liaoawei","埃斯托里尔":"aisituolier",
    # 沙特联
    "利雅得新月":"liyadexinyue","利雅得胜利":"liyadeshengli",
    "吉达联合":"jidalianhe","吉达国民":"jidaguomin",
    "利雅得青年":"liyadeqingnian","达曼协作":"damanxiezuo",
    "布赖代合作":"bulaidaihezuo","哈萨征服":"hasazhengfu",
}

# ======================== 拼音工具 ========================

def build_slug(chinese_name: str) -> str:
    """将「曼彻斯特城」转为拼音slug「mancheng」（无声调无空格）"""
    # 优先使用预设slug
    if chinese_name in FALLBACK_SLUGS:
        return FALLBACK_SLUGS[chinese_name]

    # 回退：使用 pypinyin
    if HAS_PYPINYIN:
        py = pinyin(chinese_name, style=Style.NORMAL, errors='ignore')
        return ''.join([item[0] for item in py]).lower().replace(' ', '')

    # 最后回退：直接去掉空格
    return chinese_name.replace(' ', '').lower()


# ======================== MD 文件解析 ========================

def parse_simple_md_file(filepath: Path, league_cn: str, league_code: str) -> list[dict]:
    """解析「拼音小写版」格式文件: |英文名|中文球队名|拼音|"""
    if not filepath.exists():
        print(f"[WARN] 文件不存在: {filepath}")
        return []
    
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
    
    teams = []
    in_table = False
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        if "英文名" in line or "中文球队名" in line or "拼音" in line or line.startswith("|-"):
            continue
        
        parts = [p.strip() for p in line.split("|")]
        parts = [p for p in parts if p]
        if len(parts) < 3:
            continue
        
        name_en = parts[0]
        name_cn = parts[1]
        slug = parts[2].lower().strip()
        
        teams.append({
            "name_cn": name_cn,
            "name_en": name_en,
            "slug": slug,
            "league_cn": league_cn,
            "league": league_code,
        })
    
    return teams


def parse_md_file(filepath: Path) -> list[dict]:
    """解析「五大联赛参赛球队名单.md」——支持两种表格格式

    格式1 (十大联赛风格):
        ## 英超 (EPL)
        | 中文名 | 英文名 | 中文简称 | 拼音slug |
        | 曼城 | Manchester City | 曼城 | mancheng |

    格式2 (linter 修改版):
        #### 英格兰足球超级联赛（英超，20 支）
        |英文名|中文名（中文简称 + 拼音）|
        |AFC Bournemouth|伯恩茅斯 (Boenmaosi)|
    """
    teams = []
    current_league_cn = ""
    league_map = {
        "英超": "EPL", "西甲": "LaLiga", "意甲": "SerieA",
        "德甲": "Bundesliga", "法甲": "Ligue1", "中超": "CSL",
        "J联赛": "JLeague", "荷甲": "Eredivisie",
        "葡超": "PrimeiraLiga", "沙特联": "SaudiPL",
    }
    # 从长联赛名中提取简称
    league_name_hints = {
        "英格兰": "英超", "西班牙": "西甲", "意大利": "意甲",
        "德国": "德甲", "法国": "法甲", "中国": "中超",
    }

    if not filepath.exists():
        print(f"[ERROR] 球队名单文件不存在: {filepath}")
        return teams

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line in lines:
        # 标题1: "## 英超 (EPL)" 或 "## 西甲 (LaLiga)"
        m1 = re.match(r'^##\s+(.+?)\s*\((.+?)\)', line)
        if m1:
            current_league_cn = m1.group(1).strip()
            continue

        # 标题2: "#### 英格兰足球超级联赛（英超，20 支）"
        m2 = re.match(r'^#{2,4}\s+(.+?)（(.+?)[，,]\s*\d+', line)
        if m2:
            for hint, short_name in league_name_hints.items():
                if hint in m2.group(1):
                    current_league_cn = short_name
                    break
            if not current_league_cn:
                current_league_cn = m2.group(2).strip().replace(" ", "")
            continue

        # 标题3: "### 英格兰足球超级联赛"
        m3 = re.match(r'^#{2,4}\s+(.+)', line)
        if m3 and not line.startswith("# "):
            for hint, short_name in league_name_hints.items():
                if hint in m3.group(1):
                    current_league_cn = short_name
                    break
            continue

        # 跳过表头行和分隔行
        if "---" in line or "|-" in line:
            continue
        if not line.startswith("|"):
            continue

        cols = [c.strip() for c in line.split("|")]
        cols = [c for c in cols if c]  # 去空
        if len(cols) < 2:
            continue

        # 格式1: 4列 -> | 中文名 | 英文名 | 中文简称 | 拼音slug |
        if len(cols) >= 4 and not any("(" in c and ")" in c for c in cols[:2]):
            name_cn = cols[0]
            name_en = cols[1]
            slug = cols[3] if build_slug(cols[3]) == cols[3] else build_slug(name_cn)
            # 跳过表头
            if name_cn in ("中文名", "英文名"):
                continue
        # 格式2: 2列 -> | 英文名 | 中文名（中文简称 + 拼音）|
        else:
            name_en = cols[0]
            # 从 "伯恩茅斯 (Boenmaosi)" 中提取中文名和拼音
            cn_match = re.match(r'(.+?)\s*\((.+?)\)', cols[1])
            if cn_match:
                name_cn = cn_match.group(1).strip()
                slug = cn_match.group(2).strip().lower()
            else:
                name_cn = cols[1].strip()
                slug = build_slug(name_cn)

        if name_cn in ("中文名", "英文名", "球队", ""):
            continue

        league_id = league_map.get(current_league_cn, "OTHER")
        teams.append({
            "name_cn": name_cn,
            "name_en": name_en,
            "slug": slug,
            "league_cn": current_league_cn,
            "league": league_id,
        })

    return teams


# ======================== J联赛 球队列表 ========================

def load_jleague_teams() -> list[dict]:
    """从 日本J级联赛名单.md 读取 J 联赛球队名单，返回统一格式的球队列表"""
    teams = parse_md_file(JLEAGUE_TEAMS_FILE)
    # 确保联赛字段正确
    for team in teams:
        team["league_cn"] = "J联赛"
        team["league"] = "JLeague"
    return teams


# ======================== 韩K联赛 球队列表 ========================

def load_kleague_teams(league_type: str = "kleague1") -> list[dict]:
    """从 韩K联赛参赛球队名单.md 读取韩K联赛球队名单
    
    Args:
        league_type: "kleague1" (默认) 返回韩K1联赛, "kleague2" 返回韩K2联赛
    """
    teams = []
    if not KLEAGUE_TEAMS_FILE.exists():
        print(f"[ERROR] 韩K联赛球队名单文件不存在: {KLEAGUE_TEAMS_FILE}")
        return teams

    with open(KLEAGUE_TEAMS_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    in_k1_section = False
    in_k2_section = False
    header_found = False

    for line in lines:
        line = line.strip()
        # 检测章节
        if "韩 K 联赛 1" in line or "韩K联赛1" in line:
            in_k1_section = True
            in_k2_section = False
            header_found = False
            continue
        if "韩 K 联赛 2" in line or "韩K联赛2" in line:
            in_k2_section = True
            in_k1_section = False
            header_found = False
            continue

        # 检查是否在目标章节
        target_section = (league_type == "kleague1" and in_k1_section) or \
                         (league_type == "kleague2" and in_k2_section)
        if not target_section:
            continue

        # 跳过表头行
        if line.startswith("|英文名|"):
            header_found = True
            continue
        
        # 解析表格行
        if header_found and line.startswith("|"):
            parts = line.split("|")
            if len(parts) >= 4:
                name_en = parts[1].strip()
                name_cn = parts[2].strip()
                slug = parts[3].strip().lower()
                
                # 清理中文名中的空格
                name_cn = name_cn.replace(" ", "")
                
                teams.append({
                    "name_cn": name_cn,
                    "name_en": name_en,
                    "slug": slug,
                    "league_cn": "韩K1" if league_type == "kleague1" else "韩K2",
                    "league": "KLeague1" if league_type == "kleague1" else "KLeague2",
                })

    return teams


# ======================== 数据爬取 ========================

def fetch_stats(session: requests.Session, slug: str) -> str | None:
    """请求球队统计页面，返回 HTML 文本"""
    url = BASE_URL.format(slug=slug)
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.text
        else:
            print(f"    HTTP {resp.status_code}")
            return None
    except requests.RequestException as e:
        print(f"    请求异常: {e}")
        return None


def parse_stats(html: str) -> dict:
    """从 HTML 中解析所有 best-team 锚点，返回 {field: {total, rank}} 字典"""
    soup = BeautifulSoup(html, "html.parser")
    anchors = soup.select('a[href*="/league/"][href*="#"]')

    raw = {}
    for a in anchors:
        href = a.get("href", "")
        if "#" not in href:
            continue
        hash_name = href.rsplit("#", 1)[-1].lower()
        full_text = a.get_text().strip()
        if not full_text or not re.search(r'\d', full_text):
            continue

        # BeautifulSoup 折叠换行为空格: "77 进球 联赛第 1"
        # 优先按换行分割，回退按空白字符分割
        lines = [s.strip() for s in full_text.split("\n") if s.strip()]
        if len(lines) < 3:
            lines = full_text.split()
        if len(lines) < 3:
            continue

        value = lines[0]
        # 排名: "联赛第" token 后面跟数字 token, 如 ["联赛第", "1"]
        rank_str = "0"
        for j, part in enumerate(lines):
            if part == "联赛第" and j + 1 < len(lines):
                rank_str = re.sub(r'[^0-9]', '', lines[j + 1])
                break
            if "联赛第" in part:
                digits = re.sub(r'[^0-9]', '', part)
                if digits:
                    rank_str = digits
                    break
        if rank_str == "0" and len(lines) >= 4:
            rank_str = re.sub(r'[^0-9]', '', lines[3])
        raw[hash_name] = {
            "value": value.strip(),
            "rank": rank_str.strip() or "0",
        }

    # 映射到数据库列名
    result = {}
    for hash_name, item in raw.items():
        field = HASH_TO_FIELD.get(hash_name)
        if not field:
            continue
        num_val = float(re.sub(r'[%]', '', item["value"]))
        rank_val = int(item["rank"]) if item["rank"].isdigit() else 0
        result[field] = {"total": num_val, "rank": rank_val}

    return result


# ======================== 进度与输出 ========================

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed": [], "failed": [], "current_index": 0}


def save_progress(completed: list, failed: list, index: int):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "completed": completed,
            "failed": failed,
            "current_index": index,
        }, f, ensure_ascii=False, indent=2)


def append_to_csv(filepath: Path, rows: list[dict], write_header: bool):
    """将爬取结果追加到CSV"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if write_header else "a"
    with open(filepath, mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLS, extrasaction='ignore')
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def append_failed(team_info: dict, reason: str):
    with open(FAILED_FILE, "a", encoding="utf-8") as f:
        f.write(f"{team_info['name_cn']} | {team_info['slug']} | {reason}\n")


# ======================== 主逻辑 ========================

def flatten_stats(team_info: dict, stats: dict) -> dict:
    """将拉平的团队信息 stats 转为CSV行字典"""
    row = {
        "team_name": team_info["name_en"],
        "team_name_cn": team_info["name_cn"],
        "team_id": team_info["slug"],
        "league": team_info["league"],
        "league_cn": team_info["league_cn"],
    }
    for col in OUTPUT_COLS:
        if col in row:
            continue
        if col in stats:
            row[col] = stats[col]["total"]
        elif col == "possession":
            row[col] = stats.get("possession", {}).get("total", 0)
        else:
            row[col] = 0
    return row


def load_all_teams() -> list[dict]:
    """加载所有联赛球队名单，以 slug 去重"""
    all_teams = []
    seen_slugs = set()
    
    def add_teams(teams_list):
        for team in teams_list:
            if team["slug"] and team["slug"] not in seen_slugs:
                seen_slugs.add(team["slug"])
                all_teams.append(team)
    
    # 五大联赛 (EPL/LaLiga/SerieA/Bundesliga/Ligue1) — 最多球队的文件
    add_teams(parse_md_file(TEAM_LIST_FILE))
    
    # J 联赛
    add_teams(load_jleague_teams())
    
    # 韩K联赛 (KLeague1 + KLeague2)
    for league_type in ["kleague1", "kleague2"]:
        add_teams(load_kleague_teams(league_type))
    
    # 各联赛单独文件（拼音小写版格式）
    league_files = [
        (SCRIPT_DIR / "荷甲联赛参赛球队名单.md", "荷甲", "Eredivisie"),
        (SCRIPT_DIR / "葡超联赛参赛球队名单.md", "葡超", "PrimeiraLiga"),
        (SCRIPT_DIR / "沙特联联赛参赛球队名单.md", "沙特联", "SaudiPL"),
        (SCRIPT_DIR / "中超联赛参赛球队名单.md", "中超", "CSL"),
        (ELITESERIEN_FILE, "挪超", "Eliteserien"),
        (ALLSVENSKAN_FILE, "瑞超", "Allsvenskan"),
        (VEIKKAUSLIIGA_FILE, "芬超", "Veikkausliiga"),
        (WORLDCUP_FILE, "世界杯", "WorldCup"),
    ]
    for filepath, league_cn, league_code in league_files:
        add_teams(parse_simple_md_file(filepath, league_cn, league_code))
    
    return all_teams


def crawl(limit: int | None = None, resume: bool = False, league_source: str = "europe"):
    """主函数：遍历球队列表，爬取并保存

    Args:
        league_source: "europe" (默认) 爬取五大联赛, "jleague" 爬取 J 联赛,
                       "kleague1" 爬取韩K1联赛, "kleague2" 爬取韩K2联赛
    """
    print("=" * 60)
    print("  qiumiwu.com 球队数据爬虫")
    print("=" * 60)

    # 1. 解析球队名单
    if league_source == "all":
        teams = load_all_teams()
        print("\n使用全部联赛球队名单（去重）")
    elif league_source == "top10":
        teams = parse_md_file(TOP10_TEAMS_FILE)
        print("\n使用十大联赛球队名单")
    elif league_source == "jleague":
        teams = load_jleague_teams()
        print("\n使用 J 联赛球队名单")
    elif league_source == "kleague1":
        teams = load_kleague_teams("kleague1")
        print("\n使用韩K1联赛球队名单")
    elif league_source == "kleague2":
        teams = load_kleague_teams("kleague2")
        print("\n使用韩K2联赛球队名单")
    elif league_source == "eliteserien":
        teams = parse_simple_md_file(ELITESERIEN_FILE, "挪超", "Eliteserien")
        print("\n使用挪超球队名单")
    elif league_source == "allsvenskan":
        teams = parse_simple_md_file(ALLSVENSKAN_FILE, "瑞超", "Allsvenskan")
        print("\n使用瑞超球队名单")
    elif league_source == "veikkausliiga":
        teams = parse_simple_md_file(VEIKKAUSLIIGA_FILE, "芬超", "Veikkausliiga")
        print("\n使用芬超球队名单")
    elif league_source == "worldcup":
        teams = parse_simple_md_file(WORLDCUP_FILE, "世界杯", "WorldCup")
        print("\n使用世界杯球队名单")
    else:
        teams = parse_md_file(TEAM_LIST_FILE)
        print("\n使用五大联赛球队名单")
    
    if not teams:
        print("[ERROR] 未能解析任何球队，退出。")
        return
    print(f"解析到 {len(teams)} 支球队")

    # 2. 加载进度
    progress = load_progress()
    completed = set(progress.get("completed", []))
    failed = set(progress.get("failed", []))
    start_index = progress.get("current_index", 0) if resume else 0

    if resume and (completed or start_index > 0):
        print(f"恢复模式: 已完成 {len(completed)}, 从第 {start_index} 支继续")
    elif resume:
        print("恢复模式: 无历史进度，从头开始")

    # 3. 限制数量
    if limit:
        teams = teams[:limit]
        print(f"测试模式: 仅爬取前 {limit} 支")

    # 4. 初始化会话
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    # 5. 确定CSV是否需要写头
    output_path = OUTPUT_DIR / "all_teams_data.csv"
    csv_is_new = not output_path.exists() or not resume

    all_rows = []
    success_count = len([c for c in completed if c not in failed])
    fail_count = 0

    try:
        for i, team in enumerate(teams):
            if i < start_index:
                continue

            slug = team["slug"]
            if not slug:
                print(f"[{i+1}/{len(teams)}] {team['name_cn']} — 无slug，跳过")
                failed.add(team["name_cn"])
                continue

            # 跳过已成功
            if team["name_cn"] in completed:
                continue

            # 检查失败记录（重试一次）
            retrying = team["name_cn"] in failed

            print(f"[{i+1}/{len(teams)}] {team['name_cn']} ({slug})", end="", flush=True)

            # 爬取
            html = fetch_stats(session, slug)
            if not html:
                print(" — 无响应")
                if not retrying:
                    failed.add(team["name_cn"])
                    append_failed(team, "HTTP no response")
                fail_count += 1
                time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
                continue

            stats = parse_stats(html)
            if not stats:
                print(f" — 解析失败 (HTML {len(html)} 字节)")
                if not retrying:
                    failed.add(team["name_cn"])
                    append_failed(team, "parse failed")
                fail_count += 1
                time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
                continue

            n = len(stats)
            print(f" — {n} 字段")

            # 转为CSV行
            row = flatten_stats(team, stats)
            all_rows.append(row)
            completed.add(team["name_cn"])
            if retrying:
                failed.discard(team["name_cn"])
            success_count += 1

            # 每 SAVE_INTERVAL 支球队保存进度
            if len(all_rows) >= SAVE_INTERVAL:
                append_to_csv(output_path, all_rows, write_header=csv_is_new)
                csv_is_new = False
                all_rows.clear()
                save_progress(list(completed), list(failed), i + 1)
                print(f"    [已保存进度: {len(completed)} 成功, {len(failed)} 失败]")

            # 延迟
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    except KeyboardInterrupt:
        print("\n[中断] 用户按下 Ctrl+C，正在保存当前进度...")
    except Exception as e:
        print(f"\n[异常] {e}")
    finally:
        # 保存剩余数据
        if all_rows:
            append_to_csv(output_path, all_rows, write_header=csv_is_new)
        save_progress(list(completed), list(failed), len(teams))
        session.close()

    # 最终报告
    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {len(failed)}")
    print(f"  输出: {output_path}")
    if failed:
        print(f"  失败列表: {FAILED_FILE}")
    print("=" * 60)


# ======================== CLI 入口 ========================

if __name__ == "__main__":
    limit = None
    resume = False
    league_source = "europe"

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--resume":
            resume = True
        elif args[i] == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
            i += 1
        elif args[i] == "--league" and i + 1 < len(args):
            league_source = args[i + 1]
            i += 1
        i += 1

    crawl(limit=limit, resume=resume, league_source=league_source)
