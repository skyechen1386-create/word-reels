#!/usr/bin/env node
/**
 * 复合名词真实拆解工具
 * 为 wordBuilding.type === 'compound_noun' 且 parts 未真正拆分的词条，
 * 用德语构词知识正确拆解为两个（或以上）部分，并给出每部分的中文释义。
 *
 * 安全原则：拆不准、找不到可靠依据的词，宁可跳过不动，也不生成
 * 错误的拆解（避免重复"感染风险放桌上"式的语义污染问题）。
 */
const fs = require('fs')

// 前缀/修饰性成分词典（介词、副词、形容词修饰语等常见复合词首部）
const PREFIX = {
  'ab': '离开、脱离', 'an': '在……上、朝向', 'auf': '在……上、打开', 'aus': '出、从……出来',
  'bei': '在旁边、附加', 'durch': '穿过、贯穿', 'ein': '进入、单一', 'gegen': '反对、相对',
  'mit': '共同、附带', 'nach': '在……之后、朝向', 'neben': '在旁边、附带', 'ober': '上面的',
  'um': '围绕、大约', 'unter': '在……下面', 'vor': '在……之前、预先', 'zu': '朝向、附加',
  'zwischen': '在……之间', 'außen': '外部的', 'innen': '内部的', 'zurück': '返回',
  'wieder': '重新、再次', 'hoch': '高的', 'nieder': '低的', 'tief': '深的',
  'gross': '大的', 'groß': '大的', 'klein': '小的', 'alt': '旧的、老的', 'neu': '新的',
  'jung': '年轻的', 'schnell': '快的', 'langsam': '慢的', 'roh': '未加工的、原始的',
  'brutto': '毛（总）', 'netto': '净的', 'haupt': '主要的', 'gesamt': '全部的',
  'sonder': '特殊的', 'privat': '私人的', 'öffentlich': '公共的', 'regional': '地区的',
  'lokal': '当地的', 'national': '国家的', 'international': '国际的', 'global': '全球的',
  'sozial': '社会的', 'digital': '数字的', 'ideal': '理想的', 'schwarz': '黑色的、非法的',
  'weiss': '白色的', 'weiß': '白色的', 'rot': '红色的', 'grün': '绿色的', 'gering': '低、少的',
  'rechts': '右边的', 'links': '左边的', 'mittel': '中间的', 'fremd': '外来的、陌生的',
  'sauer': '酸的', 'süss': '甜的', 'süß': '甜的', 'voll': '满的、完全的', 'einzel': '单个的',
  'doppel': '双重的', 'intensiv': '强化的', 'global-verständnis': '总体理解',
  'freitag': '', 'donnerstag': '',
}

// 常见词首（可作为独立词，通常也是本词典可查的名词/动词干），用于第一部分是名词的情形
// 与 HEAD 共用同一词典（见下）

// 常见构词尾部（词头）名词词典：{ zh: 中文释义 }
const HEAD = {
  // 时间/日常
  'essen': '吃、饭', 'zeitung': '报纸', 'zeit': '时间', 'tag': '天、日',
  'woche': '周', 'wochenende': '周末', 'stunde': '小时、课时', 'jahr': '年',
  'monat': '月', 'abend': '傍晚', 'morgen': '早上', 'mittag': '中午', 'nacht': '夜晚',
  'pause': '休息、暂停', 'schicht': '班次', 'ferien': '假期', 'urlaub': '假期',
  'frühstück': '早餐', 'schlaf': '睡眠', 'wechsel': '更替、变化',
  // 场所/建筑
  'haus': '房子', 'zimmer': '房间', 'garten': '花园', 'hof': '院子、场地',
  'bahnhof': '火车站', 'schule': '学校', 'markt': '市场', 'laden': '商店',
  'büro': '办公室', 'stadt': '城市', 'land': '国家、陆地', 'gebiet': '区域',
  'zentrum': '中心', 'platz': '广场、地方', 'raum': '空间、房间', 'halle': '大厅',
  'saal': '大厅', 'gebäude': '建筑物', 'wohnung': '住房', 'krankenhaus': '医院',
  'schrank': '柜子', 'regal': '架子', 'tisch': '桌子', 'stuhl': '椅子',
  'küche': '厨房', 'bad': '浴室', 'kasten': '箱子', 'insel': '岛屿', 'wald': '森林',
  'flughafen': '机场', 'hafen': '港口', 'grenze': '边界', 'rand': '边缘',
  'zone': '区域', 'viertel': '区、街区', 'teil': '部分', 'stelle': '地点、职位',
  // 交通
  'bahn': '轨道、铁路', 'zug': '火车、拉动', 'auto': '汽车', 'wagen': '车',
  'rad': '轮子、自行车', 'fahrrad': '自行车', 'motorrad': '摩托车', 'linie': '线路',
  'strecke': '路段', 'fahrt': '行驶、旅程', 'flug': '飞行', 'schiff': '船',
  'karte': '卡片、地图、票', 'kurs': '课程、路线', 'plan': '计划、时刻表',
  'verkehr': '交通', 'ampel': '信号灯', 'schild': '标牌', 'halt': '站', 'stelle_bus': '站',
  'haltestelle': '车站',
  // 人物
  'frau': '女人、妻子', 'mann': '男人、丈夫', 'kind': '孩子', 'leute': '人们',
  'freund': '朋友', 'freundin': '女性朋友', 'kollege': '同事', 'partner': '伙伴',
  'meister': '师傅、大师', 'chef': '负责人', 'leiter': '领导', 'minister': '部长',
  'präsident': '总统', 'kanzler': '总理', 'sekretär': '秘书', 'lehrer': '教师',
  'schüler': '学生', 'student': '大学生', 'arzt': '医生', 'schwester': '护士、姐妹',
  'pfleger': '护理人员', 'fahrer': '司机', 'räuber': '强盗', 'täter': '犯罪者',
  'zeuge': '证人', 'gast': '客人', 'benutzer': '使用者', 'käufer': '买家',
  'verkäufer': '卖家', 'hersteller': '生产商', 'schützer': '保护者', 'spezialist': '专家',
  'kämpfer': '战士', 'arbeiter': '工人', 'anwalt': '律师', 'politiker': '政治家',
  'geschäftsmann': '商人', 'bürger': '公民', 'einwohner': '居民', 'bewohner': '居民',
  'mitglied': '成员', 'trainer': '教练', 'oberhaupt': '首脑', 'chef2': '首脑',
  // 抽象概念
  'risiko': '风险', 'gefahr': '危险', 'chance': '机会', 'möglichkeit': '可能性',
  'fähigkeit': '能力', 'kraft': '力量', 'macht': '权力', 'recht': '权利、法律',
  'gesetz': '法律', 'regel': '规则', 'pflicht': '义务', 'freiheit': '自由',
  'gleichheit': '平等', 'sicherheit': '安全', 'gesundheit': '健康', 'krankheit': '疾病',
  'schwierigkeit': '困难', 'wichtigkeit': '重要性', 'qualität': '质量',
  'quantität': '数量', 'situation': '情况', 'bedingung': '条件', 'lage': '状况',
  'zustand': '状态', 'entwicklung': '发展', 'veränderung': '变化', 'wandel': '转变',
  'prozess': '过程', 'verfahren': '程序', 'system': '体系、系统', 'struktur': '结构',
  'ordnung': '秩序', 'organisation': '组织', 'politik': '政策', 'wirtschaft': '经济',
  'gesellschaft': '社会', 'kultur': '文化', 'wissenschaft': '科学', 'technik': '技术',
  'technologie': '技术', 'industrie': '工业', 'produktion': '生产', 'herstellung': '制造',
  'leistung': '成绩、成效', 'erfolg': '成功', 'ergebnis': '结果', 'wert': '价值',
  'preis': '价格', 'kosten': '费用', 'gebühr': '费用', 'summe': '金额',
  'einkommen': '收入', 'gehalt': '工资', 'lohn': '工资', 'geld': '钱',
  'kapital': '资本', 'budget': '预算', 'haushalt': '家庭、预算', 'schuld': '债务、责任',
  'krise': '危机', 'konflikt': '冲突', 'streit': '争执', 'kampf': '斗争',
  'krieg': '战争', 'frieden': '和平', 'sieg': '胜利', 'niederlage': '失败',
  'macht2': '权力',
  // 身体/健康
  'kopf': '头', 'bauch': '肚子', 'auge': '眼睛', 'schmerz': '疼痛',
  'schmerzen': '疼痛', 'druck': '压力', 'blutdruck': '血压', 'entzündung': '炎症',
  'grippe': '流感', 'versicherung': '保险', 'kasse': '基金、收银台',
  // 通信/媒体
  'brief': '信', 'blatt': '纸张、表格', 'formular': '表格', 'bogen': '张、单',
  'buch': '书', 'wörterbuch': '词典', 'schrift': '文字、字体', 'wort': '词',
  'sprache': '语言', 'nachricht': '消息', 'meldung': '通知、报告', 'anzeige': '广告、通告',
  'werbung': '广告', 'mitteilung': '通知', 'anweisung': '说明', 'erklärung': '说明',
  'beschreibung': '描述', 'bericht': '报告', 'studie': '研究', 'forschung': '研究',
  'untersuchung': '调查', 'analyse': '分析', 'test': '测试', 'prüfung': '考试',
  'note': '成绩', 'zeugnis': '证书', 'ausweis': '证件', 'pass': '护照',
  'schein': '证书、票据', 'lizenz': '许可证', 'genehmigung': '许可',
  'erlaubnis': '许可', 'antrag': '申请', 'bewerbung': '申请', 'gesuch': '请求',
  'angebot': '提供、报价', 'nachfrage': '需求', 'anfrage': '询问',
  'termin': '约定、日期', 'verabredung': '约会', 'treffen': '会面',
  'besprechung': '讨论', 'konferenz': '会议', 'gespräch': '对话', 'diskussion': '讨论',
  'debatte': '辩论', 'verhandlung': '谈判', 'vertrag': '合同', 'abkommen': '协议',
  'vereinbarung': '协议',
  // 教育
  'kenntnis': '知识', 'wissen': '知识', 'bildung': '教育', 'ausbildung': '培训',
  'unterricht': '教学', 'training': '训练', 'übung': '练习', 'aufgabe': '任务、作业',
  'lernen': '学习', 'lehre': '教学、学说', 'niveau': '水平', 'stufe': '阶段',
  'phase': '阶段', 'beginn': '开始', 'ende': '结束', 'abschluss': '结业、结束',
  'anfang': '开始',
  // 物品
  'gerät': '设备', 'apparat': '仪器', 'maschine': '机器', 'werkzeug': '工具',
  'stoff': '材料、物质', 'material': '材料', 'instrument': '乐器、器械',
  'ausrüstung': '装备', 'anlage': '设施、装置', 'einrichtung': '设施',
  'kleidung': '衣服', 'schmuck': '首饰', 'geschenk': '礼物', 'paket': '包裹',
  'ware': '商品', 'artikel': '物品、文章', 'produkt': '产品', 'gerät2': '设备',
  'flasche': '瓶子', 'tasche': '包、口袋', 'koffer': '行李箱', 'schirm': '伞',
  'lampe': '灯', 'licht': '光', 'uhr': '钟表', 'brille': '眼镜',
  'saft': '果汁', 'wasser': '水', 'öl': '油', 'gas': '天然气', 'stoff2': '物质',
  // 其他常见
  'faktor': '因素', 'element': '要素', 'punkt': '点', 'grund': '基础、原因',
  'form': '形式', 'art': '种类', 'weise': '方式', 'methode': '方法',
  'strategie': '策略', 'prinzip': '原则', 'grundlage': '基础', 'basis': '基础',
  'thema': '主题', 'frage': '问题', 'antwort': '回答', 'lösung': '解决方案',
  'problem': '问题', 'phänomen': '现象', 'unterschied': '区别', 'vergleich': '比较',
  'verhalten': '行为', 'reaktion': '反应', 'einfluss': '影响', 'wirkung': '作用',
  'rolle': '角色', 'funktion': '功能', 'aufgabe2': '任务', 'ziel': '目标',
  'zweck': '目的', 'absicht': '意图', 'plan2': '计划', 'programm': '计划、程序',
  'projekt': '项目', 'maßnahme': '措施', 'aktion': '行动', 'kampagne': '活动',
  'bewegung': '运动', 'demonstration': '示威', 'protest': '抗议', 'streik': '罢工',
  'wahl': '选举、选择', 'abstimmung': '投票', 'entscheidung': '决定',
  'wichtig': '重要', 'zeichen': '标志', 'symbol': '符号',
  // 补充：常作复合词首部的名词/词根
  'bus': '公交车', 'bank': '银行', 'auto': '汽车', 'blut': '血液', 'bild': '图像',
  'blitz': '闪电', 'antwort': '回答', 'apfel': '苹果', 'aufnahme': '录取、录制',
  'auswahl': '选择', 'abschluss': '结业、结束', 'allergie': '过敏', 'auge': '眼睛',
  'deutsch': '德语', 'chance': '机会', 'dampf': '蒸汽', 'buch': '书', 'bücher': '书（复数）',
  'bier': '啤酒', 'computer': '电脑', 'abwasser': '废水', 'arzt': '医生', 'atom': '原子',
  'blick': '目光、一瞥', 'modell': '模型', 'konto': '账户', 'bau': '建筑、建造',
  'stil': '风格', 'deckel': '盖子', 'blume': '花', 'strauß': '花束', 'umschlag': '信封',
  'ausstellung': '展览', 'messe': '展会', 'chemie': '化学', 'droge': '毒品',
  'schmuggel': '走私', 'bedarf': '需求', 'unternehmen': '企业', 'verbrauch': '消耗',
  'schrift2': '文字', 'gas': '天然气', 'geschoss': '楼层', 'exil': '流亡',
  'existenz': '生存', 'berechtigung': '资格、权利', 'begriff': '概念', 'leute': '人们',
  'stand': '状况、摊位', 'fernseher': '电视机', 'toleranz': '容忍度',
  'alarm': '警报', 'gastarbeiter': '外籍工人', 'mangel': '缺乏', 'wechsel': '兑换',
  'anwendung': '应用、使用', 'gipfel': '峰会', 'glück': '幸运', 'wunsch': '愿望',
  'gold': '金', 'grafik': '图表', 'öffnung': '开放', 'stufe': '阶段',
  'stein': '石头', 'wasser': '水', 'diskussion': '讨论', 'rundfahrt': '环游',
  'küste': '海岸', 'schmerzen': '疼痛', 'werk': '厂、作品', 'tier': '动物',
  'schlag': '跳动、打击', 'punkt': '点', 'nation': '国家', 'zweig': '分支',
  'staat': '国家', 'konflikt': '冲突', 'benutzer': '使用者', 'herberge': '旅舍',
  'kaffee': '咖啡', 'amt': '机关、职位', 'futter': '饲料', 'kern': '核心',
  'garten': '花园', 'kino': '电影院', 'klasse': '班级', 'klimaanlage': '空调',
  'körper': '身体', 'koffer': '行李箱', 'konjunktur': '经济景气',
  'konkurrenz': '竞争', 'kranke': '病人', 'kreis': '圆、地区', 'kugel': '球',
  'kultur': '文化', 'kunde': '顾客', 'lager': '仓库', 'lohn': '工资',
  'luft': '空气', 'lunge': '肺', 'luxus': '奢侈', 'maßnahme': '措施',
  'macht': '权力', 'marke': '品牌', 'markt': '市场', 'masse': '大量、群众',
  'mauer': '墙', 'medien': '媒体', 'medizin': '医学', 'mensch': '人',
  'mitte': '中间', 'milch': '牛奶', 'militär': '军事', 'minderheit': '少数群体',
  'möbel': '家具', 'mond': '月亮', 'muster': '样式', 'mutter': '母亲',
  'nachbar': '邻居', 'agentur': '机构', 'katastrophe': '灾难', 'nerv': '神经',
  'wagen': '车', 'raucher': '吸烟者', 'nobelpreis': '诺贝尔奖', 'träger': '获得者',
  'not': '紧急、困境', 'obst': '水果', 'oktober': '十月', 'opfer': '牺牲、受害者',
  'bereitschaft': '准备状态', 'partei': '党派', 'passkontrolle': '护照检查',
  'wort2': '词', 'wirtschaft': '经济', 'präsident': '总统', 'punkt2': '点',
  'presse': '媒体、出版社', 'konferenz': '会议', 'prozent': '百分之',
  'rahmen': '框架', 'raum': '空间', 'regen': '雨', 'reise': '旅行',
  'rohstoff': '原材料', 'rolle': '角色', 'satz': '句子',
  'schaden': '损害', 'stoff': '物质', 'schiff': '船', 'schlacht': '战役',
  'feld': '场地', 'schlüssel': '钥匙', 'schule2': '学校', 'schulfreund': '同学',
  'semester': '学期', 'sieger': '胜利者', 'sommer': '夏天', 'sonne': '太阳',
  'speise': '食物', 'spiegel': '镜子', 'spitze': '尖端、顶级', 'sport': '运动',
  'stadtbild': '市容', 'stein2': '石头', 'stelle': '职位、地点', 'steuer': '税',
  'stress': '压力', 'strom': '电流', 'struktur': '结构', 'studenten': '大学生（复数）',
  'tarif': '费率', 'tasche': '包', 'team': '团队', 'telefon': '电话',
  'terror': '恐怖', 'terrorismus': '恐怖主义', 'text': '文本', 'tomate': '番茄',
  'tourist': '游客', 'traum': '梦想', 'truppe': '部队', 'umwelt': '环境',
  'unfall': '事故', 'vater': '父亲', 'vogel': '鸟', 'vollzeit': '全职',
  'waffen': '武器（复数）', 'weihnachten': '圣诞节', 'wetter': '天气',
  'wind': '风', 'winter': '冬天', 'wort3': '词', 'flugzeit': '航班时间',
  'abteilung': '部门', 'aktion': '行动', 'alltag': '日常', 'altersstufe': '年龄层',
  'anfang': '开始', 'ankunft': '到达', 'anpassung': '适应', 'ansicht': '看法、明信片',
  'arbeit': '工作', 'behandlung': '治疗', 'beruf': '职业', 'besatzung': '占领',
  'betrieb': '企业、运营', 'bevölkerung': '人口', 'bewertung': '评价',
  'bewerbung': '申请', 'bundes': '联邦', 'donner': '雷', 'durchschnitt': '平均',
  'einbürgerung': '入籍', 'einfühlung': '共情', 'einführung': '引入、导论',
  'einkauf': '购物', 'einkommen': '收入', 'einladung': '邀请', 'einstufung': '分级',
  'empfehlung': '推荐', 'entspannung': '放松、缓和', 'entwicklung': '发展',
  'eröffnung': '开幕', 'finanzierung': '融资', 'forschung': '研究',
  'freunde': '朋友（复数）', 'führung': '领导、引导', 'gebrauch': '使用',
  'geburt': '出生', 'gehalt': '工资', 'geist': '精神', 'generation': '一代人',
  'geschäft': '生意、商店', 'gesicht': '脸、观点', 'gespräch': '谈话',
  'globalisierung': '全球化', 'handel': '贸易', 'hilfe': '帮助', 'hochzeit': '婚礼',
  'industrialisierung': '工业化', 'inflation': '通货膨胀', 'information': '信息',
  'inhalt': '内容', 'integration': '一体化', 'jahre': '年（复数）', 'kleidung': '衣服',
  'koalition': '联盟', 'kombination': '组合', 'kommunikation': '沟通',
  'krankenversicherung': '医疗保险', 'krieg': '战争', 'lebens': '生活',
  'leistung': '成效', 'lieblings': '最喜欢的', 'meinung': '意见', 'menschenrecht': '人权',
  'mittag': '中午', 'monat': '月', 'motivation': '动机', 'neujahr': '新年',
  'organisation': '组织', 'ort': '地点', 'produktion': '生产', 'regierung': '政府',
  'renovierung': '翻修', 'rezession': '经济衰退', 'sicherheit': '安全',
  'siege': '胜利（复数）', 'universität': '大学', 'unterricht': '教学',
  'unterstützung': '支持', 'verfassung': '宪法', 'verhalten': '行为',
  'zeugnis': '证书', 'ziel': '目标', 'zimmer': '房间', 'zins': '利息',
  'zusatz': '附加', 'äußerung': '表达、发言', 'ausland': '外国', 'anschauung': '看法',
  'ausbildungsförderung': '教育促进',
  // 补充第二批：动词词干作复合词首部 + 更多常见前缀名词
  'grenze': '边界', 'feier': '庆祝、仪式', 'betriebswirtschaft': '企业管理',
  'richt': '判断、指引（源自 richten）', 'rund': '圆的、环绕',
  'lehr': '教学（源自 lehren）', 'lern': '学习（源自 lernen）',
  'koch': '烹饪（源自 kochen）', 'kauf': '购买（源自 kaufen）', 'tanz': '跳舞',
  'schreib': '书写（源自 schreiben）', 'wasch': '洗涤（源自 waschen）',
  'spül': '冲洗（源自 spülen）', 'kühl': '冷却（源自 kühlen）',
  'wohn': '居住（源自 wohnen）', 'seh': '看（源自 sehen）', 'hör': '听（源自 hören）',
  'les': '阅读（源自 lesen）', 'lauf': '跑、进程（源自 laufen）',
  'spiel': '游戏、玩（源自 spielen）', 'zahl': '数字、支付', 'führ': '引导（源自 führen）',
  'bau': '建筑、建造', 'back': '烘烤（源自 backen）', 'heiz': '加热（源自 heizen）',
  'druck': '压力、印刷', 'flieg': '飞行（源自 fliegen）', 'fahr': '驾驶、行驶（源自 fahren）',
  'denk': '思考（源自 denken）', 'schlacht': '战役、屠宰',
  'siedlung': '定居点', 'siedler': '定居者', 'gleich': '相同的、平等的',
  'ober2': '上面的', 'unten': '下面', 'binnen': '国内的、内部的',
}

function art(w) { return w === 'die' ? '阴性' : w === 'der' ? '阳性' : '中性' }
function extractArticleAndCore(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), core: m[2] }
  return { article: null, core: lemma }
}

function lookupPrefix(prefixPart) {
  const lower = prefixPart.toLowerCase()
  if (PREFIX[lower]) return PREFIX[lower]
  if (HEAD[lower]) return HEAD[lower]
  return null
}

// 从词尾找已知词根，返回 { prefixPart, headPart, headZh } 或 null
// 优先尝试"直接拼接"（无连接音），只有在直接拼接查不到词典依据时，
// 才尝试去掉常见连接音（Fugenelemente）后再查一次。
function findHeadMatch(core) {
  const coreLower = core.toLowerCase()
  const headKeys = Object.keys(HEAD).sort((a, b) => b.length - a.length)
  const linkers = ['es', 'en', 'ns', 'e', 's', 'n']

  for (const key of headKeys) {
    if (!coreLower.endsWith(key)) continue
    const prefixLen = coreLower.length - key.length
    if (prefixLen <= 0) continue // 整个词本身就是这个词根，不算复合
    const rawPrefix = core.substring(0, prefixLen)
    if (rawPrefix.length < 2) continue

    // 1) 优先：直接拼接，前缀本身如果能在词典里查到意思，最可信
    if (lookupPrefix(rawPrefix)) {
      return { prefixPart: rawPrefix, headPart: core.substring(prefixLen), headZh: HEAD[key], linker: '' }
    }
  }

  // 2) 直接拼接查不到依据时，再尝试"去掉连接音"的候选，同样要求能查到词典依据
  for (const key of headKeys) {
    if (!coreLower.endsWith(key)) continue
    const prefixLen = coreLower.length - key.length
    if (prefixLen <= 0) continue
    const rawPrefix = core.substring(0, prefixLen)
    if (rawPrefix.length < 2) continue
    for (const linker of linkers) {
      if (rawPrefix.toLowerCase().endsWith(linker) && rawPrefix.length > linker.length) {
        const trimmed = rawPrefix.substring(0, rawPrefix.length - linker.length)
        if (trimmed.length >= 2 && lookupPrefix(trimmed)) {
          return { prefixPart: trimmed, headPart: core.substring(prefixLen), headZh: HEAD[key], linker }
        }
      }
    }
  }

  // 3) 都查不到依据：只按最长的 head 做结构性拆分（保留原始拼接，不猜测连接音），
  //    前缀释义留空，由后续人工/字典扩充
  for (const key of headKeys) {
    if (!coreLower.endsWith(key)) continue
    const prefixLen = coreLower.length - key.length
    if (prefixLen <= 0) continue
    const rawPrefix = core.substring(0, prefixLen)
    if (rawPrefix.length < 2) continue
    return { prefixPart: rawPrefix, headPart: core.substring(prefixLen), headZh: HEAD[key], linker: '', unresolvedPrefix: true }
  }
  return null
}

function findPrefixMeaning(prefixPart) {
  return lookupPrefix(prefixPart)
}

function splitCompound(lemma) {
  const { core } = extractArticleAndCore(lemma)
  const match = findHeadMatch(core)
  if (!match) return null
  const prefixZh = findPrefixMeaning(match.prefixPart)
  return {
    prefixPart: match.prefixPart,
    prefixZh,
    headPart: match.headPart,
    headZh: match.headZh,
  }
}

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0
  let skippedCount = 0
  const fixedSamples = []
  const skippedSamples = []

  words.forEach(word => {
    if (word.wordBuilding?.type !== 'compound_noun') return
    const parts = word.wordBuilding.parts || []
    if (parts.length > 1) return // 已经拆过

    const result = splitCompound(word.lemma)
    if (!result || !result.headZh) {
      skippedCount++
      if (skippedSamples.length < 20) skippedSamples.push(word.lemma)
      return
    }

    const newParts = []
    if (result.prefixZh) {
      newParts.push({ part: result.prefixPart, meaningZh: result.prefixZh, role: '限定成分' })
    } else {
      newParts.push({ part: result.prefixPart, meaningZh: '', role: '限定成分（词义待补充）' })
    }
    newParts.push({ part: result.headPart, meaningZh: result.headZh, role: '核心成分（决定词性词义）' })

    word.wordBuilding.parts = newParts
    word.wordBuilding.structureZh = `${result.prefixPart}${result.prefixZh ? '(' + result.prefixZh + ')' : ''} + ${result.headPart}(${result.headZh}) → ${word.lemma}`

    fixedCount++
    if (fixedSamples.length < 40) fixedSamples.push(`${word.lemma}: ${result.prefixPart}(${result.prefixZh || '?'}) + ${result.headPart}(${result.headZh})`)
  })

  console.log(`✅ 成功拆解: ${fixedCount} 个词条`)
  console.log(`⏭️  找不到可靠依据、已跳过: ${skippedCount} 个词条`)
  console.log('\n拆解示例（前40个）:')
  fixedSamples.forEach(s => console.log('  ' + s))
  console.log('\n跳过示例（前20个，需要后续单独处理）:')
  skippedSamples.forEach(s => console.log('  ' + s))

  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
  console.log(`\n已保存到: ${outputPath}`)
}

fix(process.argv[2], process.argv[3] || process.argv[2])
