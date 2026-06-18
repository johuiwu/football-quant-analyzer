// 联赛预设配置 —— 为所有联赛提供基础参数和爬虫入口
// 新增联赛时只需在此对象中添加一条记录即可接入全部功能

const LEAGUE_PRESETS = {
  EPL: {
    key: "EPL", nameCn: "英超", matchesPerSeason: 38,
    crawlerSlug: "yingchao", maxTeams: 20,
    teamSlugs: {
      "曼彻斯特城":"mancheng","阿森纳":"asenna","利物浦":"liwupu","切尔西":"qieerxi",
      "托特纳姆热刺":"reci","曼彻斯特联":"manlian","阿斯顿维拉":"asidunweila",
      "纽卡斯尔联":"niukasier","布莱顿":"bulaidun","西汉姆联":"xihanmu",
      "伯恩茅斯":"boenmaosi","布伦特福德":"buluntefude","伯恩利":"boenli",
      "水晶宫":"shuijinggong","埃弗顿":"aifudun","富勒姆":"fuleimu",
      "利兹联":"lizilian","诺丁汉森林":"nuodinghan","桑德兰":"sangdelan","狼队":"langdui",
    },
  },
  LaLiga: {
    key: "LaLiga", nameCn: "西甲", matchesPerSeason: 38,
    crawlerSlug: "xijia", maxTeams: 20,
    teamSlugs: {
      "皇家马德里":"huangma","巴塞罗那":"basaluona","马德里竞技":"madelijingji",
      "赫罗纳":"heluona","毕尔巴鄂竞技":"bierbae","皇家社会":"huangjiashehui",
      "皇家贝蒂斯":"beidisi","塞维利亚":"saiweiliya","瓦伦西亚":"walunxiya",
      "比利亚雷亚尔":"biliyaleiyaer","阿拉维斯":"alaweisi","塞尔塔":"saierta",
      "埃尔切":"aierqie","西班牙人":"xibanyaren","莱万特":"laiwante",
      "马略卡":"maluoka","奥萨苏纳":"aosasuna","奥维耶多":"aoweiyeduo",
      "赫塔费":"hetafei","巴列卡诺":"baliekanuo",
    },
  },
  SerieA: {
    key: "SerieA", nameCn: "意甲", matchesPerSeason: 38,
    crawlerSlug: "yijia", maxTeams: 20,
    teamSlugs: {
      "国际米兰":"guojimilan","AC米兰":"acmilan","尤文图斯":"youwentusi",
      "亚特兰大":"yatelanda","那不勒斯":"nabulesi","罗马":"luoma","拉齐奥":"laqiao",
      "佛罗伦萨":"foluolunsa","博洛尼亚":"boluoniya","都灵":"duling",
      "卡利亚里":"kaliyali","克雷莫内塞":"keleimona","科莫":"kemo",
      "热那亚":"renaya","莱切":"laiqie","帕尔马":"paerma","比萨":"bisa",
      "萨索洛":"sasuoluo","乌迪内斯":"wudineisi","维罗纳":"weiluona",
    },
  },
  Bundesliga: {
    key: "Bundesliga", nameCn: "德甲", matchesPerSeason: 34,
    crawlerSlug: "dejia", maxTeams: 18,
    teamSlugs: {
      "拜仁慕尼黑":"bairen","勒沃库森":"leiwokusen","斯图加特":"situjiate",
      "多特蒙德":"duotemengde","RB莱比锡":"laihongniu","法兰克福":"falankefu",
      "霍芬海姆":"huofenhaimu","沃尔夫斯堡":"wofusibao","云达不莱梅":"bulaimei",
      "门兴格拉德巴赫":"menxing","门兴":"menxing",
      "奥格斯堡":"aogesibao","柏林联合":"bolinlianhe","弗赖堡":"fulaibao",
      "汉堡":"hanbao1","海登海姆":"haidenghaimu","科隆":"kelong",
      "美因茨":"meiyinci","圣保利":"shengbao",
    },
  },
  Ligue1: {
    key: "Ligue1", nameCn: "法甲", matchesPerSeason: 34,
    crawlerSlug: "fajia", maxTeams: 18,
    teamSlugs: {
      "巴黎圣日耳曼":"balishengman","摩纳哥":"monage","马赛":"masai",
      "里尔":"lier","里昂":"liang","朗斯":"langsi","尼斯":"nisi","雷恩":"leien",
      "兰斯":"lansi","斯特拉斯堡":"sitelasi","布雷斯特":"buleisite",
      "图卢兹":"tuluzi","欧塞尔":"ousaier","南特":"nante","昂热":"angre",
      "勒阿弗尔":"leiafuer","洛里昂":"luoliang","巴黎FC":"balifc","梅斯":"meisi",
    },
  },
  CSL: {
    key: "CSL", nameCn: "中超", matchesPerSeason: 30,
    crawlerSlug: "zhongchao", maxTeams: 16,
    teamSlugs: {
      "上海申花":"shanghaishenhua","上海海港":"shanghaihaigang","北京国安":"beijingguoan",
      "山东泰山":"shandongtaishan","成都蓉城":"chedurongcheng","武汉三镇":"wuhansanzhen",
      "浙江队":"zhejiangdui","天津津门虎":"tianjinjinmenhu","长春亚泰":"changchunyatai",
      "河南队":"henandui",
    },
  },
  JLeague: {
    key: "JLeague", nameCn: "J1联赛", matchesPerSeason: 38,
    crawlerSlug: "rizhilian", maxTeams: 18,
    teamSlugs: {
      "川崎前锋":"chuanqianqianfeng","横滨水手":"hengbinshuishou",
      "浦和红钻":"fuhehongzuan","鹿岛鹿角":"ludaojiao","神户胜利船":"shenhushengli",
      "广岛三箭":"guandaosanjian","名古屋鲸八":"mingguwujingba","FC东京":"fctokyo",
      "大阪樱花":"dabanyinghua","大阪钢巴":"dabangangba",
      "冈山绿雉":"gangshanlyuzhi","清水心跳":"qingshuixintiao",
      "町田泽维亚":"tingtianzeweiya","东京绿茵":"dongjinglyuyin",
      "京都不死鸟":"jingdubusiniao","柏太阳神":"baitaiyangshen",
      "长崎成功丸":"changqichenggongwan","水户蜀葵":"shuihushukui",
      "千叶市原":"qianyeshiyuan","福冈黄蜂":"fuganghuangfeng",
    },
  },
  KLeague1: {
    key: "KLeague1", nameCn: "韩K1", matchesPerSeason: 33,
    crawlerSlug: "hanklian", maxTeams: 12,
    teamSlugs: undefined,
  },
  KLeague2: {
    key: "KLeague2", nameCn: "韩K2", matchesPerSeason: 36,
    crawlerSlug: "hank2lian", maxTeams: 13,
    teamSlugs: undefined,
  },
  Eliteserien: {
    key: "Eliteserien", nameCn: "挪超", matchesPerSeason: 30,
    crawlerSlug: 'nuochao', maxTeams: 16,
    teamSlugs: undefined,
  },
  Allsvenskan: {
    key: 'Allsvenskan', nameCn: '瑞典超', matchesPerSeason: 30,
    crawlerSlug: 'ruidianchao', maxTeams: 16,
    teamSlugs: undefined,
  },
  Veikkausliiga: {
    key: "Veikkausliiga", nameCn: "芬超", matchesPerSeason: 22,
    crawlerSlug: 'fenchao', maxTeams: 12,
    teamSlugs: undefined,
  },
  Eredivisie: {
    key: "Eredivisie", nameCn: "荷甲", matchesPerSeason: 34,
    crawlerSlug: "hejia", maxTeams: 18,
    teamSlugs: {
      "阿贾克斯":"ajiakesi","PSV埃因霍温":"psvaiyinhuowen","费耶诺德":"feiyenuode",
      "阿尔克马尔":"aerkemaer","特温特":"tewente","乌德勒支":"wudelezhi",
      "维特斯":"weitesi","海伦芬":"hailunfen",
    },
  },
  PrimeiraLiga: {
    key: "PrimeiraLiga", nameCn: "葡超", matchesPerSeason: 34,
    crawlerSlug: "puchao", maxTeams: 18,
    teamSlugs: {
      "本菲卡":"benfeika","波尔图":"boertu","葡萄牙体育":"putaoyatiyu","布拉加":"bulajia",
      "吉马良斯":"jimaliangsi","博阿维斯塔":"boaweisita","里奥阿维":"liaoawei",
      "埃斯托里尔":"aisituolier",
    },
  },
  SaudiPL: {
    key: "SaudiPL", nameCn: "沙特联", matchesPerSeason: 30,
    crawlerSlug: "shate", maxTeams: 18,
    teamSlugs: {
      "利雅得新月":"liyadexinyue","利雅得胜利":"liyadeshengli",
      "吉达联合":"jidalianhe","吉达国民":"jidaguomin","利雅得青年":"liyadeqingnian",
      "达曼协作":"damanxiezuo","布赖代合作":"bulaidaihezuo","哈萨征服":"hasazhengfu",
      "卡迪西亚":"kadixiya","塞哈特海湾":"saihaitehaiwan","新未来城体育":"xinweilaichengtiyu",
      "费哈":"feiha","科鲁德":"kelude","哈森姆":"hasenmu",
      "利雅得体育":"liyadetiyu","达马克":"damake",
      "欧鲁巴赫":"oulubachi","布赖代先锋":"bulaidaixianfeng",
    },
  },
  DanishSuperliga: {
    key: "DanishSuperliga", nameCn: "丹麦超", matchesPerSeason: 32,
    crawlerSlug: "danchaomark", maxTeams: 12,
    teamSlugs: undefined,
  },
  QatarSL: {
    key: "QatarSL", nameCn: "卡塔尔联", matchesPerSeason: 22,
    crawlerSlug: "kataer", maxTeams: 12,
    teamSlugs: undefined,
  },
};

function getMatchesPerSeason(leagueKey) {
  return LEAGUE_PRESETS[leagueKey]?.matchesPerSeason ?? 30;
}

module.exports = { LEAGUE_PRESETS, getMatchesPerSeason };
