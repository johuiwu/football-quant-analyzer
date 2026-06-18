#!/usr/bin/env python3
"""完整爬取所有联赛数据：五大联赛 + J联赛 + 韩K联赛"""

import requests
import csv
from pathlib import Path
from bs4 import BeautifulSoup
import time
import random

BASE_URL = "https://www.qiumiwu.com/team/{slug}/stat"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
REQUEST_TIMEOUT = 25
MIN_DELAY = 1.0
MAX_DELAY = 2.5

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "all_teams_data.csv"

# 所有联赛球队
ALL_TEAMS = []

# 五大联赛
ALL_TEAMS.extend([
    # 英超
    {"name_cn": "伯恩茅斯", "name_en": "AFC Bournemouth", "slug": "boenmaosi", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "阿森纳", "name_en": "Arsenal", "slug": "asenna", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "阿斯顿维拉", "name_en": "Aston Villa", "slug": "asidunweila", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "布伦特福德", "name_en": "Brentford", "slug": "buluntefude", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "布莱顿", "name_en": "Brighton", "slug": "bulaidun", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "伯恩利", "name_en": "Burnley", "slug": "boenli", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "切尔西", "name_en": "Chelsea", "slug": "qieerxi", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "水晶宫", "name_en": "Crystal Palace", "slug": "shuijinggong", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "埃弗顿", "name_en": "Everton", "slug": "aifudun", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "富勒姆", "name_en": "Fulham", "slug": "fuleimu", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "利兹联", "name_en": "Leeds United", "slug": "lizilian", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "利物浦", "name_en": "Liverpool", "slug": "liwupu", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "曼城", "name_en": "Manchester City", "slug": "mancheng", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "曼联", "name_en": "Manchester United", "slug": "manlian", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "纽卡斯尔联", "name_en": "Newcastle United", "slug": "niukasier", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "诺丁汉森林", "name_en": "Nottingham Forest", "slug": "nuodinghan", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "桑德兰", "name_en": "Sunderland", "slug": "sangdelan", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "热刺", "name_en": "Tottenham", "slug": "reci", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "西汉姆联", "name_en": "West Ham", "slug": "xihanmu", "league_cn": "英超", "league": "EPL"},
    {"name_cn": "狼队", "name_en": "Wolverhampton", "slug": "langdui", "league_cn": "英超", "league": "EPL"},
    # 西甲
    {"name_cn": "毕尔巴鄂竞技", "name_en": "Athletic Bilbao", "slug": "bierbae", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "阿拉维斯", "name_en": "Alaves", "slug": "alaweisi", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "巴塞罗那", "name_en": "Barcelona", "slug": "basaluona", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "塞尔塔", "name_en": "Celta Vigo", "slug": "saierta", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "埃尔切", "name_en": "Elche", "slug": "aierqie", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "西班牙人", "name_en": "Espanyol", "slug": "xibanyaren", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "赫罗纳", "name_en": "Girona", "slug": "heluona", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "莱万特", "name_en": "Levante", "slug": "laiwante", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "马略卡", "name_en": "Mallorca", "slug": "maluoka", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "奥萨苏纳", "name_en": "Osasuna", "slug": "aosasuna", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "奥维耶多", "name_en": "Oviedo", "slug": "aoweiyeduo", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "皇家贝蒂斯", "name_en": "Real Betis", "slug": "beidisi", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "皇家社会", "name_en": "Real Sociedad", "slug": "huangjiashehui", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "塞维利亚", "name_en": "Sevilla", "slug": "saiweiliya", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "比利亚雷亚尔", "name_en": "Villarreal", "slug": "biliyaleiyaer", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "瓦伦西亚", "name_en": "Valencia", "slug": "walunxiya", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "马德里竞技", "name_en": "Atletico Madrid", "slug": "madelijingji", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "赫塔费", "name_en": "Getafe", "slug": "hetafei", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "巴列卡诺", "name_en": "Rayo Vallecano", "slug": "baliekanuo", "league_cn": "西甲", "league": "LaLiga"},
    {"name_cn": "皇家马德里", "name_en": "Real Madrid", "slug": "huangma", "league_cn": "西甲", "league": "LaLiga"},
    # 意甲
    {"name_cn": "亚特兰大", "name_en": "Atalanta", "slug": "yatelanda", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "博洛尼亚", "name_en": "Bologna", "slug": "boluoniya", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "卡利亚里", "name_en": "Cagliari", "slug": "kaliyali", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "克雷莫内塞", "name_en": "Cremonese", "slug": "keleimona", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "科莫", "name_en": "Como", "slug": "kemo", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "佛罗伦萨", "name_en": "Fiorentina", "slug": "foluolunsa", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "热那亚", "name_en": "Genoa", "slug": "renaya", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "国际米兰", "name_en": "Inter Milan", "slug": "guojimilan", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "尤文图斯", "name_en": "Juventus", "slug": "youwentusi", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "拉齐奥", "name_en": "Lazio", "slug": "laqiao", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "莱切", "name_en": "Lecce", "slug": "laiqie", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "AC米兰", "name_en": "AC Milan", "slug": "acmilan", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "那不勒斯", "name_en": "Napoli", "slug": "nabulesi", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "帕尔马", "name_en": "Parma", "slug": "paerma", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "比萨", "name_en": "Pisa", "slug": "bisa", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "罗马", "name_en": "Roma", "slug": "luoma", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "萨索洛", "name_en": "Sassuolo", "slug": "sasuoluo", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "都灵", "name_en": "Torino", "slug": "duling", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "乌迪内斯", "name_en": "Udinese", "slug": "wudineisi", "league_cn": "意甲", "league": "SerieA"},
    {"name_cn": "维罗纳", "name_en": "Verona", "slug": "weiluona", "league_cn": "意甲", "league": "SerieA"},
    # 德甲
    {"name_cn": "奥格斯堡", "name_en": "Augsburg", "slug": "aogesibao", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "柏林联合", "name_en": "Union Berlin", "slug": "bolinlianhe", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "云达不莱梅", "name_en": "Werder Bremen", "slug": "bulaimei", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "多特蒙德", "name_en": "Dortmund", "slug": "duotemengde", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "法兰克福", "name_en": "Eintracht Frankfurt", "slug": "falankefu", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "弗赖堡", "name_en": "Freiburg", "slug": "fulaibao", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "汉堡", "name_en": "Hamburg", "slug": "hanbao1", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "海登海姆", "name_en": "Heidenheim", "slug": "haidenghaimu", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "霍芬海姆", "name_en": "Hoffenheim", "slug": "huofenhaimu", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "科隆", "name_en": "Köln", "slug": "kelong", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "RB莱比锡", "name_en": "RB Leipzig", "slug": "laihongniu", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "勒沃库森", "name_en": "Leverkusen", "slug": "leiwokusen", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "美因茨", "name_en": "Mainz", "slug": "meiyinci", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "门兴格拉德巴赫", "name_en": "Mönchengladbach", "slug": "menxing", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "拜仁慕尼黑", "name_en": "Bayern Munich", "slug": "bairen", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "圣保利", "name_en": "St. Pauli", "slug": "shengbao", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "斯图加特", "name_en": "Stuttgart", "slug": "situjiate", "league_cn": "德甲", "league": "Bundesliga"},
    {"name_cn": "沃尔夫斯堡", "name_en": "Wolfsburg", "slug": "wofusibao", "league_cn": "德甲", "league": "Bundesliga"},
    # 法甲
    {"name_cn": "巴黎圣日耳曼", "name_en": "Paris Saint-Germain", "slug": "balishengman", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "马赛", "name_en": "Marseille", "slug": "masai", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "摩纳哥", "name_en": "Monaco", "slug": "monage", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "尼斯", "name_en": "Nice", "slug": "nisi", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "里尔", "name_en": "Lille", "slug": "lier", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "里昂", "name_en": "Lyon", "slug": "liang", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "斯特拉斯堡", "name_en": "Strasbourg", "slug": "sitelasi", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "朗斯", "name_en": "Lens", "slug": "langsi", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "布雷斯特", "name_en": "Brest", "slug": "buleisite", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "图卢兹", "name_en": "Toulouse", "slug": "tuluzi", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "欧塞尔", "name_en": "Auxerre", "slug": "ousaier", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "雷恩", "name_en": "Rennes", "slug": "leien", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "南特", "name_en": "Nantes", "slug": "nante", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "昂热", "name_en": "Angers", "slug": "angre", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "勒阿弗尔", "name_en": "Le Havre", "slug": "leiafuer", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "洛里昂", "name_en": "Lorient", "slug": "luoliang", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "巴黎FC", "name_en": "Paris FC", "slug": "balifc", "league_cn": "法甲", "league": "Ligue1"},
    {"name_cn": "梅斯", "name_en": "Metz", "slug": "meisi", "league_cn": "法甲", "league": "Ligue1"},
])

# J联赛
ALL_TEAMS.extend([
    {"name_cn": "川崎前锋", "name_en": "Kawasaki Frontale", "slug": "chuanqiqianfeng", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "横滨水手", "name_en": "Yokohama F.Marinos", "slug": "hengbinshuishou", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "浦和红钻", "name_en": "Urawa Reds", "slug": "puhehongzuan", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "鹿岛鹿角", "name_en": "Kashima Antlers", "slug": "ludaolujiao", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "神户胜利船", "name_en": "Vissel Kobe", "slug": "shenhushenglichuan", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "广岛三箭", "name_en": "Sanfrecce Hiroshima", "slug": "guangdaosanjian", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "名古屋鲸八", "name_en": "Nagoya Grampus", "slug": "mingguwujingyu", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "FC东京", "name_en": "FC Tokyo", "slug": "fcdongjing", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "大阪樱花", "name_en": "Cerezo Osaka", "slug": "dabanyinghua", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "大阪钢巴", "name_en": "Gamba Osaka", "slug": "dabangangba", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "冈山绿雉", "name_en": "Okayama Koroko", "slug": "gangshanlyuzhi", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "东京绿茵", "name_en": "Tokyo Verdy", "slug": "dongjinglyuyin", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "柏太阳神", "name_en": "Kashiwa Reysol", "slug": "baitaiyangshen", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "长崎成功丸", "name_en": "V-Varen Nagasaki", "slug": "changqichenggongwan", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "水户蜀葵", "name_en": "Mito Hollyhock", "slug": "shuihushukui", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "千叶市原", "name_en": "JEF United Chiba", "slug": "qianyeshiyuan", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "福冈黄蜂", "name_en": "Avispa Fukuoka", "slug": "fuganghuangfeng", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "清水心跳", "name_en": "Shimizu S-Pulse", "slug": "qingshuixintiao", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "町田泽维亚", "name_en": "Machida Zelvia", "slug": "tingtianzeweiya", "league_cn": "J联赛", "league": "JLeague"},
    {"name_cn": "京都不死鸟", "name_en": "Kyoto Sanga", "slug": "jingdubusiniao", "league_cn": "J联赛", "league": "JLeague"},
])

# 韩K联赛
ALL_TEAMS.extend([
    # 韩K1
    {"name_cn": "首尔FC", "name_en": "Seoul FC", "slug": "fcshouer", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "蔚山现代", "name_en": "Ulsan Hyundai", "slug": "weishanhd", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "全北现代", "name_en": "Jeonbuk Hyundai", "slug": "quanbeixiandai", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "仁川联", "name_en": "Incheon United", "slug": "renchuanlian", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "江原FC", "name_en": "Gangwon FC", "slug": "jiangyuanfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "安养FC", "name_en": "Anyang FC", "slug": "anyangfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "大田市民", "name_en": "Daejeon Citizen", "slug": "datianshimin", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "金泉尚武", "name_en": "Gimcheon Sangmu", "slug": "jinquanshangwu", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "济州SK", "name_en": "Jeju SK", "slug": "jizhouskfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "浦项制铁", "name_en": "Pohang Steelers", "slug": "puxiangtieren", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "富川FC", "name_en": "Bucheon FC", "slug": "fuchuanfc", "league_cn": "韩K1", "league": "KLeague1"},
    {"name_cn": "光州FC", "name_en": "Gwangju FC", "slug": "guangzhoufc", "league_cn": "韩K1", "league": "KLeague1"},
    # 韩K2
    {"name_cn": "大邱FC", "name_en": "Daegu FC", "slug": "daqiufc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "釜山偶像", "name_en": "Busan IPark", "slug": "fushanouxiang", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "水原FC", "name_en": "Suwon FC", "slug": "shuiyuanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "首尔衣恋", "name_en": "Seoul E-Land", "slug": "shoueryilian", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "华城FC", "name_en": "Hwaseong FC", "slug": "huachengfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "水原三星", "name_en": "Suwon Samsung", "slug": "shuiyuansanxing", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "忠南牙山", "name_en": "Chungnam Asan", "slug": "zhongnanyashan", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "庆南FC", "name_en": "Gyeongnam FC", "slug": "qingnanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "忠北清州", "name_en": "Chungbuk Cheongju", "slug": "zhongbeiqingzhou", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "金浦市民", "name_en": "Gimpo Citizen", "slug": "jinpushimin", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "龙仁FC", "name_en": "Yongin FC", "slug": "longrenfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "坡州市民", "name_en": "Paju Citizen", "slug": "pozhoushimin", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "城南FC", "name_en": "Seongnam FC", "slug": "chengnanfc", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "全南天龙", "name_en": "Jeonnam Dragons", "slug": "quannantianlong", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "天安城", "name_en": "Cheonan City", "slug": "tianancheng", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "安山小绿人", "name_en": "Ansan Greeners", "slug": "anshanxiaolyuren", "league_cn": "韩K2", "league": "KLeague2"},
    {"name_cn": "金海", "name_en": "Gimhae FC", "slug": "jinhai", "league_cn": "韩K2", "league": "KLeague2"},
])

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
    "successful_dribbles":"successfulDribbles","duels":"duelsWon","duels_won":"duelsWon",
    "fastbreaks":"fastBreaks","fast_breaks":"fastBreaks",
    "fastbreak_shots":"fastBreakShots","fast_break_shots":"fastBreakShots",
    "fastbreak_goals":"fastBreakGoals","fast_break_goals":"fastBreakGoals",
    "hit_woodwork":"hitWoodwork","poss_losts":"possessionLost",
    "possession_lost":"possessionLost","clean_sheets":"cleanSheets",
    "yellow2red_cards":"twoYellowRedCards","two_yellow_red":"twoYellowRedCards",
    "blocked_shots":"effectiveBlocks","effective_blocks":"effectiveBlocks",
}

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
]


def fetch_stats(session, slug):
    url = BASE_URL.format(slug=slug)
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.encoding = 'utf-8'
        if resp.status_code == 200:
            return resp.text
        else:
            return None
    except Exception:
        return None


def parse_stats(html):
    soup = BeautifulSoup(html, "html.parser")
    anchors = soup.select('a[href*="/league/"][href*="#"]')
    raw = {}
    for a in anchors:
        href = a.get("href", "")
        if "#" not in href:
            continue
        hash_name = href.rsplit("#", 1)[-1].lower()
        full_text = a.get_text().strip()
        if not full_text or not any(c.isdigit() for c in full_text):
            continue
        lines = [s.strip() for s in full_text.split("\n") if s.strip()]
        if len(lines) < 3:
            lines = full_text.split()
        if len(lines) < 3:
            continue
        value = lines[0]
        rank_str = "0"
        for j, part in enumerate(lines):
            if part == "联赛第" and j + 1 < len(lines):
                rank_str = ''.join(c for c in lines[j + 1] if c.isdigit())
                break
            if "联赛第" in part:
                digits = ''.join(c for c in part if c.isdigit())
                if digits:
                    rank_str = digits
                    break
        if rank_str == "0" and len(lines) >= 4:
            rank_str = ''.join(c for c in lines[3] if c.isdigit())
        raw[hash_name] = {"value": value.strip(), "rank": rank_str.strip() or "0"}

    result = {}
    for hash_name, item in raw.items():
        field = HASH_TO_FIELD.get(hash_name)
        if not field:
            continue
        num_val = float(item["value"].replace('%', ''))
        rank_val = int(item["rank"]) if item["rank"].isdigit() else 0
        result[field] = {"total": num_val, "rank": rank_val}
    return result


def flatten_stats(team_info, stats):
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
        row[col] = stats[col]["total"] if col in stats else 0
    return row


def write_csv(rows):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLS, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    print("=" * 60)
    print("  完整爬取所有联赛数据")
    print("=" * 60)
    print(f"  待爬取球队数: {len(ALL_TEAMS)}")
    print(f"  五大联赛: {sum(1 for t in ALL_TEAMS if t['league'] in ['EPL', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1'])} 队")
    print(f"  J联赛: {sum(1 for t in ALL_TEAMS if t['league'] == 'JLeague')} 队")
    print(f"  韩K联赛: {sum(1 for t in ALL_TEAMS if t['league'] in ['KLeague1', 'KLeague2'])} 队")
    print()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    success_count = 0
    fail_count = 0
    all_rows = []
    failed_teams = []

    for i, team in enumerate(ALL_TEAMS):
        print(f"[{i+1}/{len(ALL_TEAMS)}] {team['league_cn']} - {team['name_cn']}", end="", flush=True)
        
        html = fetch_stats(session, team['slug'])
        if not html:
            print(" — 无响应")
            failed_teams.append(team['name_cn'])
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        stats = parse_stats(html)
        if not stats:
            print(" — 解析失败")
            failed_teams.append(team['name_cn'])
            fail_count += 1
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
            continue

        n = len(stats)
        print(f" — {n} 字段")

        row = flatten_stats(team, stats)
        all_rows.append(row)
        success_count += 1

        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

    if all_rows:
        write_csv(all_rows)
        print(f"\n已将 {len(all_rows)} 支球队数据写入 {OUTPUT_FILE}")

    print("\n" + "=" * 60)
    print(f"  完成! 成功: {success_count}, 失败: {fail_count}")
    if failed_teams:
        print(f"  失败球队: {', '.join(failed_teams[:10])}{'...' if len(failed_teams) > 10 else ''}")
    print("=" * 60)


if __name__ == "__main__":
    main()
