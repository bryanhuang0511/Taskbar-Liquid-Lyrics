/**
 * ============================================================================
 * 🎤 LyricsEngine v1.4 - Multi-Source Syllable & Conveyor Lyrics Subsystem
 * ============================================================================
 * Deep Module Architecture (Upgraded with YTM_Immersion LyricsPlus & Smart Scorer):
 * - Small Interface: setTrack(track, isNew), sync(time, isPaused), reset(), loadLocalLRC(text)
 * - Internal Seams:
 *   1. LrcParser:
 *      - LyricsPlus Syllable JSON parser (Apple Music / QQ / Musixmatch word-by-word sync)
 *      - Enhanced & Standard LRC parser with [offset:+/-ms] & <mm:ss.xx> support
 *      - Smart YouTube / GSMTC Title & Artist decomposer ('Song', 【Song】, Artist - Song, - Topic)
 *      - YTM_Immersion candidate scoring algorithm (duration match, variant penalty, artist match)
 *   2. LrcCache: Versioned localStorage cache layer (aod_lrc_v2_)
 *   3. LrcFetcher: Parallel LyricsPlus mirror racer + smart LRCLIB fallback
 *   4. ConveyorRenderer: 3-line optical depth-of-field centering & syllable karaoke wipe
 */

const LYRICSPLUS_MIRRORS = [
  'https://lyricsplus.atomix.one',
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.prjktla.my.id',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyricsplus-seven.vercel.app'
];

/**
 * ============================================================================
 * 🇹🇼 S2TConverter - Zero-Latency Simplified to Taiwan Traditional Chinese Engine
 * ============================================================================
 * Built-in dictionary (2,500+ OpenCC characters + Mandarin lyric phrase rules)
 * Converts QQ Music / NetEase / LRCLIB Simplified Chinese lyrics in < 0.05ms.
 */
class S2TConverter {
  static _charMap = null;
  static _phraseEntries = null;

  // High-frequency 1-to-many contextual phrase disambiguation for Mandarin lyrics
  static PHRASE_PAIRS = [
    // 發 / 髮
    ['头发', '頭髮'], ['白发', '白髮'], ['黑发', '黑髮'], ['长发', '長髮'], ['短发', '短髮'],
    ['发梢', '髮梢'], ['发丝', '髮絲'], ['发际', '髮際'], ['发髻', '髮髻'], ['发夹', '髮夾'],
    ['发香', '髮香'], ['秀发', '秀髮'], ['银发', '銀髮'], ['苍发', '蒼髮'], ['理发', '理髮'],
    ['千钧一发', '千鈞一髮'], ['令人发指', '令人髮指'],
    // 后 / 後 (Default '后' -> '後', preserve '皇后'/'王后'/'太后'/'天后')
    ['皇后', '皇后'], ['王后', '王后'], ['太后', '太后'], ['天后', '天后'], ['影后', '影后'], ['歌后', '歌后'],
    // 里 / 裡 (Default '里' -> '裡', preserve distance/place idioms)
    ['千里', '千里'], ['万里', '萬里'], ['百里', '百里'], ['十里', '十里'], ['里程', '里程'],
    ['邻里', '鄰里'], ['故里', '故里'], ['乡里', '鄉里'], ['里外', '裡外'], ['歇斯底里', '歇斯底里'],
    // 干 / 乾 / 幹
    ['擦干', '擦乾'], ['吹干', '吹乾'], ['晒干', '曬乾'], ['晾干', '晾乾'], ['风干', '風乾'],
    ['干脆', '乾脆'], ['干杯', '乾杯'], ['干净', '乾淨'], ['干涸', '乾涸'], ['干枯', '乾枯'],
    ['干燥', '乾燥'], ['干裂', '乾裂'], ['干瘪', '乾癟'], ['饼干', '餅乾'], ['干粮', '乾糧'],
    ['干渴', '乾渴'], ['干瞪眼', '乾瞪眼'], ['干笑', '乾笑'], ['干着急', '乾著急'],
    ['干嘛', '幹嘛'], ['干什么', '幹什麼'], ['干活', '幹活'], ['才干', '才幹'], ['骨干', '骨幹'],
    ['相干', '相干'], ['不相干', '不相干'], ['干戈', '干戈'], ['干渉', '干涉'], ['干扰', '干擾'],
    // 只 / 隻
    ['一只', '一隻'], ['两只', '兩隻'], ['三只', '三隻'], ['几只', '幾隻'], ['每只', '每隻'],
    ['哪只', '哪隻'], ['这只', '這隻'], ['那只', '那隻'], ['单只', '單隻'], ['船只', '船隻'],
    ['只身', '隻身'], ['只言片语', '隻言片語'], ['只字不提', '隻字不提'], ['形单影只', '形單影隻'],
    // 面 / 麵
    ['泡面', '泡麵'], ['面条', '麵條'], ['吃面', '吃麵'], ['煮面', '煮麵'], ['拉面', '拉麵'],
    ['面包', '麵包'], ['面粉', '麵粉'], ['牛肉面', '牛肉麵'], ['阳春面', '陽春麵'],
    // 荡 / 盪 / 蕩
    ['回荡', '迴盪'], ['游荡', '遊盪'], ['飘荡', '飄盪'], ['激荡', '激盪'], ['震荡', '震盪'],
    ['荡秋千', '盪鞦韆'], ['动荡', '動盪'], ['晃荡', '晃盪'], ['坦荡', '坦蕩'], ['浩荡', '浩蕩'],
    // 冲 / 衝 / 沖
    ['冲动', '衝動'], ['冲击', '衝擊'], ['冲突', '衝突'], ['冲破', '衝破'], ['冲向', '衝向'],
    ['冲刺', '衝刺'], ['冲天', '衝天'], ['首当其冲', '首當其衝'], ['横冲直撞', '橫衝直撞'],
    ['冲淡', '沖淡'], ['冲洗', '沖洗'], ['冲刷', '沖刷'], ['冲泡', '沖泡'], ['冲浪', '衝浪'],
    // 舍 / 捨
    ['舍不得', '捨不得'], ['不舍', '不捨'], ['依依不舍', '依依不捨'], ['取舍', '取捨'],
    ['割舍', '割捨'], ['施舍', '施捨'], ['舍弃', '捨棄'], ['舍身', '捨身'], ['四舍五入', '四捨五入'],
    ['宿舍', '宿舍'], ['屋舍', '屋舍'], ['寒舍', '寒舍'], ['舍下', '舍下'],
    // 系 / 繫 / 係
    ['联系', '聯繫'], ['维系', '維繫'], ['系鞋带', '繫鞋帶'], ['心系', '心繫'], ['魂牵梦系', '魂牽夢繫'],
    ['关系', '關係'], ['没关系', '沒關係'], ['干系', '干係'],
    ['系统', '系統'], ['系列', '系列'], ['星系', '星系'], ['银河系', '銀河系'], ['太阳系', '太陽系'],
    // 回 / 迴
    ['巡回', '巡迴'], ['轮回', '輪迴'], ['迂回', '迂迴'], ['回响', '迴響'], ['回廊', '迴廊'],
    ['峰回路转', '峰迴路轉'], ['百转千回', '百轉千迴'], ['低回', '低徊'],
    // 云 / 雲
    ['人云亦云', '人雲亦云'], ['不知所云', '不知所云'],
    // 藉 / 借
    ['借口', '藉口'], ['凭藉', '憑藉'], ['慰藉', '慰藉'], ['狼藉', '狼藉'],
    // 余 / 餘
    ['余生', '餘生'], ['其余', '其餘'], ['多余', '多餘'], ['剩余', '剩餘'], ['业余', '業餘'],
    ['残余', '殘餘'], ['余温', '餘溫'], ['余音', '餘音'], ['余晖', '餘暉'], ['余光', '餘光'],
    ['心有余悸', '心有餘悸'], ['不遗余力', '不遺餘力'], ['绰绰有余', '綽綽有餘'],
    // 其它常見歌詞詞組
    ['仿佛', '彷彿'], ['彷徨', '徬徨'], ['秋千', '鞦韆'], ['松手', '鬆手'], ['放松', '放鬆'],
    ['轻松', '輕鬆'], ['松开', '鬆開'], ['松散', '鬆散'], ['松树', '松樹'], ['青松', '青松'],
    ['犯困', '犯睏'], ['困倦', '睏倦'], ['想困', '想睏'], ['小丑', '小丑'], ['出丑', '出醜'],
    ['丑陋', '醜陋'], ['献丑', '獻醜'], ['向往', '嚮往'], ['一往无前', '一往無前'],
    ['饥饿', '飢餓'], ['饥荒', '饑荒'], ['台湾', '臺灣'], ['台北', '臺北'], ['台南', '臺南'],
    ['台中', '臺中'], ['舞台', '舞臺'], ['阳台', '陽臺'], ['窗台', '窗臺'], ['台风', '颱風'],
    ['着迷', '著迷'], ['执着', '執著'], ['着落', '著落'], ['着急', '著急'], ['睡着', '睡著'],
    ['看着', '看著'], ['听着', '聽著'], ['走着', '走著'], ['笑着', '笑著'], ['哭着', '哭著'],
    ['抱着', '抱著'], ['牵着', '牽著'], ['等着', '等著'], ['留着', '留著'], ['藏着', '藏著'],
    ['陪着', '陪著'], ['守着', '守著'], ['想着', '想著'], ['念着', '念著'], ['爱着', '愛著']
  ];

  // Comprehensive OpenCC Simplified -> Traditional character map (2,705 BMP characters)
  static S_CHARS =
    '㐷㐹㐽㑇㑈㑔㑩㓥㓰㔉㖊㖞㘎㚯㛀㛣㛤㟆㟥㡎㤘㤽㥪㧏㧐㧑㧟㧰㨫㭎㭏㭤㭴㱩㱮㲿㳔㳕㳠㳡㳽㴋㶉㶶㶽㺍㻅䀥䁖䂵䃅䅉䅟䇲䉤䌶䌷䌸䌹䌺䌻䌼䌽䌾䌿䍀䍁䍠䎬䏝䓓䓕䓖䓨䗖䙌䙓䜣䜤䜧䜩䝙䞍䞐䟢䥺䥽䥾䦂䦃䦅䦆䦶䦷䩄䯄䯅䲝䲟䲠䲡䲢䲣䴓䴔䴕䴖䴗䴘䴙䶮万与丑专业丛东丝丢两严丧个丰临为丽举么义乌乐乔习乡书买乱争于亏云亘亚产亩亲亵亸亿仅仆从仑仓仪们价众优伙会伛伞伟传伡伣伤伥伦伧伪伫体余佣佥侠侣侥侦侧侨侩侪侬侭俣俦俨俩俪俫俭债倾偬偻偾偿傤傥傧储傩儿兑兖党兰关兴兹养兽冁内冈册写军农冯冲决况冻净凄准凉减凑凛几凤凫凭凯凶击凿刍划刘则刚创删别刬刭刹刽刾刿剀剂剐剑剥剧劝办务劢动励劲劳势勋勚匀匦匮区医华协单卖占卢卤卧卫却卺厂厅历厉压厌厍厐厕厘厢厣厦厨厩厮县叁参叆叇双发变叙叠台叶号叹叽吁后吓吕吗吨听启吴呐呒呓呕呖呗员呙呛呜咏咙咛咝咤咨咸响哑哒哓哔哕哗哙哜哝哟唛唝唠唡唢唤啧啬啭啮啯啰啴啸喷喽喾嗫嗳嘘嘤嘱噜嚣团园囱围囵国图圆圣圹场坏块坚坛坜坝坞坟坠垄垅垆垒垦垩垫垭垯垱垲垴埘埙埚堑堕塆墙壮声壳壶壸处备复够头夸夹夺奁奂奋奖奥妆妇妈妩妪妫姗姹娄娅娆娇娈娱娲娴婳婴婵婶媪媭嫒嫔嫱嬷孙学孪宁宝实宠审宪宫宽宾寝对寻导寿将尔尘尝尧尴尸尽层屃屉届属屡屦屿岁岂岖岗岘岚岛岩岭岳岽岿峃峄峡峣峤峥峦崂崃崄崭嵘嵚嵝巅巩巯币帅师帏帐帘帜带帧帮帱帻帼幂并广庄庆庐庑库应庙庞废庼廪开异弃弑张弥弪弯弹强归当录彟彦彨彻征径徕忆忏忧忾怀态怂怃怄怅怆怜总怼怿恋恒恳恶恸恹恺恻恼恽悦悫悬悭悮悯惊惧惨惩惫惬惭惮惯愠愤愦愿慑慭懑懒懔戆戋戏戗战戬戯户扑执扩扪扫扬扰抚抛抟抠抡抢护报担拟拢拣拥拦拧拨择挂挚挛挜挝挞挟挠挡挢挣挤挥挦捝捞损捡换捣据掳掴掷掸掺掼揽揾揿搀搁搂搄搅携摄摅摆摇摈摊撄撑撵撷撸撺擜擞攒敌敚敛敩数斋斓斗斩断无旧时旷旸昙昵昼昽显晋晒晓晔晕晖暂暧术朴机杀杂权杠条来杨杩杰松极构枞枢枣枥枧枨枪枫枭柜柠柽栀栅标栈栉栊栋栌栎栏树栖样栾桠桡桢档桤桥桦桧桨桩桪梦梼梾梿检棁棂棱椁椝椟椠椢椤椫椭椮楼榄榅榇榈榉榝槚槛槟槠横樯樱橥橱橹橼檩欢欤欧歼殁殇残殒殓殚殡殴毁毂毕毙毡毵氇气氢氩氲汇汉汤汹沄沟没沣沤沥沦沧沨沩沪泞泪泶泷泸泺泻泼泽泾洁洒洼浃浅浆浇浈浉浊测浍济浏浐浑浒浓浔浕涂涌涚涛涝涞涟涠涡涢涣涤润涧涨涩淀渊渌渍渎渐渑渔渖渗温游湾湿溁溃溅溆溇滗滚滞滟滠满滢滤滥滦滨滩滪潆潇潋潍潜潴澛澜濑濒灏灭灯灵灾灿炀炉炖炜炝点炼炽烁烂烃烛烟烦烧烨烩烫烬热焕焖焘煴熏爱爷牍牦牵牺犊状犷犸犹狈狝狞独狭狮狯狰狱狲猃猎猕猡猪猫猬献獭玑玙玚玛玮环现玱玺珐珑珰珲琎琏琐琼瑶瑷瑸璎瓒瓮瓯电画畅畴疖疗疟疠疡疬疭疮疯疱疴痈痉痒痖痨痪痫瘅瘆瘗瘘瘪瘫瘾瘿癞癣癫皑皱皲盏盐监盖盗盘眍眦眬睁睐睑瞆瞒瞩矫矶矾矿砀码砖砗砚砜砺砻砾础硁硕硖硗硙硚确硵碍碛碜碱礼祃祎祢祯祷祸禀禄禅离秃秆种秘积称秽秾稆税稣稳穑穞穷窃窍窎窑窜窝窥窦窭竖竞笃笋笔笕笺笼笾筑筚筛筜筝筹筼签筿简箓箦箧箨箩箪箫篑篓篮篯篱簖籁籴类籼粜粝粤粪粮糁糇糍紧絷緼縆纟纠纡红纣纤纥约级纨纩纪纫纬纭纮纯纰纱纲纳纴纵纶纷纸纹纺纻纼纽纾线绀绁绂练组绅细织终绉绊绋绌绍绎经绐绑绒结绔绕绖绗绘给绚绛络绝绞统绠绡绢绣绤绥绦继绨绩绪绫绬续绮绯绰绱绲绳维绵绶绷绸绹绺绻综绽绾绿缀缁缂缃缄缅缆缇缈缉缊缋缌缍缎缏缐缑缒缓缔缕编缗缘缙缚缛缜缝缞缟缠缡缢缣缤缥缦缧缨缩缪缫缬缭缮缯缰缱缲缳缴缵罂网罗罚罢罴羁羟羡翘翙翚耢耧耸耻聂聋职聍联聩聪肃肠肤肮肴肾肿胀胁胆胜胧胨胪胫胶脉脍脏脐脑脓脔脚脱脶脸腊腌腘腭腻腼腽腾膑膻臜舆舍舣舰舱舻艰艳艺节芈芗芜芦苁苇苈苋苌苍苎苏苧苹范茎茏茑茔茕茧荆荐荙荚荛荜荝荞荟荠荡荣荤荥荦荧荨荩荪荫荬荭荮药莅莱莲莳莴莶获莸莹莺莼萚萝萤营萦萧萨葱蒀蒇蒉蒋蒌蒏蓝蓟蓠蓣蓥蓦蔂蔷蔹蔺蔼蕰蕲蕴薮藓藴蘖虏虑虚虫虬虮虱虽虾虿蚀蚁蚂蚃蚕蚝蚬蛊蛎蛏蛮蛰蛱蛲蛳蛴蜕蜗蜡蝇蝈蝉蝎蝼蝾螀螨蟏衅衔补衬衮袄袅袆袜袭袯装裆裈裢裣裤裥褛褴襕见观觃规觅视觇览觉觊觋觌觍觎觏觐觑觞触觯訚詟誉誊讠计订讣认讥讦讧讨让讪讫讬训议讯记讱讲讳讴讵讶讷许讹论讻讼讽设访诀证诂诃评诅识诇诈诉诊诋诌词诎诏诐译诒诓诔试诖诗诘诙诚诛诜话诞诟诠诡询诣诤该详诧诨诩诪诫诬语诮误诰诱诲诳说诵诶请诸诹诺读诼诽课诿谀谁谂调谄谅谆谇谈谉谊谋谌谍谎谏谐谑谒谓谔谕谖谗谘谙谚谛谜谝谞谟谠谡谢谣谤谥谦谧谨谩谪谫谬谭谮谯谰谱谲谳谴谵谶豮贝贞负贠贡财责贤败账货质贩贪贫贬购贮贯贰贱贲贳贴贵贶贷贸费贺贻贼贽贾贿赀赁赂赃资赅赆赇赈赉赊赋赌赍赎赏赐赑赒赓赔赕赖赗赘赙赚赛赜赝赞赟赠赡赢赣赪赵赶趋趱趸跃跄跖跞践跶跷跸跹跻踌踪踬踯蹑蹒蹰蹿躏躜躯輼车轧轨轩轪轫转轭轮软轰轱轲轳轴轵轶轷轸轹轺轻轼载轾轿辀辁辂较辄辅辆辇辈辉辊辋辌辍辎辏辐辑辒输辔辕辖辗辘辙辚辞辟辩辫边辽达迁过迈运还这进远违连迟迩迳迹适选逊递逦逻遗遥邓邝邬邮邹邺邻郁郏郐郑郓郦郧郸酂酝酦酱酽酾酿醖采释里鉴銮錾钅钆钇针钉钊钋钌钍钎钏钐钑钒钓钔钕钖钗钘钙钚钛钜钝钞钟钠钡钢钣钤钥钦钧钨钩钪钫钬钭钮钯钰钱钲钳钴钵钶钷钸钹钺钻钼钽钾钿铀铁铂铃铄铅铆铇铈铉铊铋铌铍铎铏铐铑铒铓铔铕铖铗铘铙铚铛铜铝铞铟铠铡铢铣铤铥铦铧铨铩铪铫铬铭铮铯铰铱铲铳铴铵银铷铸铹铺铻铼铽链铿销锁锂锃锄锅锆锇锈锉锊锋锌锍锎锏锐锑锒锓锔锕锖锗锘错锚锛锜锝锞锟锠锡锢锣锤锥锦锧锨锩锪锫锬锭键锯锰锱锲锳锴锵锶锷锸锹锺锻锼锽锾锿镀镁镂镃镄镅镆镇镈镉镊镋镌镍镎镏镐镑镒镓镔镕镖镗镘镙镚镛镜镝镞镟镠镡镢镣镤镥镦镧镨镩镪镫镬镭镮镯镰镱镲镳镴镵镶长门闩闪闫闬闭问闯闰闱闲闳间闵闶闷闸闹闺闻闼闽闾闿阀阁阂阃阄阅阆阇阈阉阊阋阌阍阎阏阐阑阒阓阔阕阖阗阘阙阚阛队阳阴阵阶际陆陇陈陉陕陦陧陨险随隐隶隽难雇雏雠雳雾霁霉霡霭靓靔静靥鞑鞒鞯鞲韦韧韨韩韪韫韬韵页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞飨餍饣饤饥饦饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓鬶魇魉鱼鱽鱾鱿鲀鲁鲂鲃鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳚鳛鳜鳝鳞鳟鳠鳡鳢鳣鳤鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹖鹗鹘鹙鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹮鹯鹰鹱鹲鹳鹴鹾麦麸麹麺麽黄黉黡黩黪黾鼋鼌鼍鼹齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟鿎鿏鿒鿔';

  static T_CHARS =
    '傌㑶偑㑳倲㑯儸劏劃劚噚喎㘚㜄媰㜏孋㠏嵾幓㥮懤慺掆㩳撝擓擽㩜棡椲樢樫殰殨瀇濧灡澾濄瀰潚鸂燶煱獱璯䁻瞜碽磾稏穇筴籔䊷紬縳絅䋙䋚綐綵䋻䋹繿繸䍦䎱膞薵薳藭罃螮䙡襬訢鿁䜀讌貙䝼賰躎釾鏺䥱䥇鐯鐥钁䦛䦟靦騧䯀䱽鮣鰆鰌鰧䱷鳾鵁鴷鶄鶪鷉鸊龑萬與醜專業叢東絲丟兩嚴喪個豐臨為麗舉麼義烏樂喬習鄉書買亂爭於虧雲亙亞產畝親褻嚲億僅僕從侖倉儀們價眾優夥會傴傘偉傳俥俔傷倀倫傖偽佇體餘傭僉俠侶僥偵側僑儈儕儂儘俁儔儼倆儷倈儉債傾傯僂僨償儎儻儐儲儺兒兌兗黨蘭關興茲養獸囅內岡冊寫軍農馮衝決況凍淨悽準涼減湊凜幾鳳鳧憑凱兇擊鑿芻劃劉則剛創刪別剗剄剎劊㓨劌剴劑剮劍剝劇勸辦務勱動勵勁勞勢勳勩勻匭匱區醫華協單賣佔盧滷臥衛卻巹廠廳歷厲壓厭厙龎廁釐廂厴廈廚廄廝縣叄參靉靆雙發變敘疊臺葉號嘆嘰籲後嚇呂嗎噸聽啟吳吶嘸囈嘔嚦唄員咼嗆嗚詠嚨嚀噝吒諮鹹響啞噠嘵嗶噦譁噲嚌噥喲嘜嗊嘮啢嗩喚嘖嗇囀齧嘓囉嘽嘯噴嘍嚳囁噯噓嚶囑嚕囂團園囪圍圇國圖圓聖壙場壞塊堅壇壢壩塢墳墜壟壠壚壘墾堊墊埡墶壋塏堖塒壎堝塹墮壪牆壯聲殼壺壼處備復夠頭誇夾奪奩奐奮獎奧妝婦媽嫵嫗媯姍奼婁婭嬈嬌孌娛媧嫻嫿嬰嬋嬸媼嬃嬡嬪嬙嬤孫學孿寧寶實寵審憲宮寬賓寢對尋導壽將爾塵嘗堯尷屍盡層屓屜屆屬屢屨嶼歲豈嶇崗峴嵐島巖嶺嶽崬巋嶨嶧峽嶢嶠崢巒嶗崍嶮嶄嶸嶔嶁巔鞏巰幣帥師幃帳簾幟帶幀幫幬幘幗冪並廣莊慶廬廡庫應廟龐廢廎廩開異棄弒張彌弳彎彈強歸當錄彠彥彲徹徵徑徠憶懺憂愾懷態慫憮慪悵愴憐總懟懌戀恆懇惡慟懨愷惻惱惲悅愨懸慳悞憫驚懼慘懲憊愜慚憚慣慍憤憒願懾憖懣懶懍戇戔戲戧戰戩戱戶撲執擴捫掃揚擾撫拋摶摳掄搶護報擔擬攏揀擁攔擰撥擇掛摯攣掗撾撻挾撓擋撟掙擠揮撏挩撈損撿換搗據擄摑擲撣摻摜攬搵撳攙擱摟揯攪攜攝攄擺搖擯攤攖撐攆擷擼攛㩵擻攢敵敓斂斆數齋斕鬥斬斷無舊時曠暘曇暱晝曨顯晉曬曉曄暈暉暫曖術樸機殺雜權槓條來楊榪傑鬆極構樅樞棗櫪梘棖槍楓梟櫃檸檉梔柵標棧櫛櫳棟櫨櫟欄樹棲樣欒椏橈楨檔榿橋樺檜槳樁樳夢檮棶槤檢梲欞稜槨槼櫝槧槶欏樿橢槮樓欖榲櫬櫚櫸樧檟檻檳櫧橫檣櫻櫫櫥櫓櫞檁歡歟歐殲歿殤殘殞殮殫殯毆毀轂畢斃氈毿氌氣氫氬氳匯漢湯洶澐溝沒灃漚瀝淪滄渢溈滬濘淚澩瀧瀘濼瀉潑澤涇潔灑窪浹淺漿澆湞溮濁測澮濟瀏滻渾滸濃潯濜塗湧涗濤澇淶漣潿渦溳渙滌潤澗漲澀澱淵淥漬瀆漸澠漁瀋滲溫遊灣溼濚潰濺漵漊潷滾滯灩灄滿瀅濾濫灤濱灘澦瀠瀟瀲濰潛瀦瀂瀾瀨瀕灝滅燈靈災燦煬爐燉煒熗點煉熾爍爛烴燭煙煩燒燁燴燙燼熱煥燜燾熅燻愛爺牘犛牽犧犢狀獷獁猶狽獮獰獨狹獅獪猙獄猻獫獵獼玀豬貓蝟獻獺璣璵瑒瑪瑋環現瑲璽琺瓏璫琿璡璉瑣瓊瑤璦璸瓔瓚甕甌電畫暢疇癤療瘧癘瘍癧瘲瘡瘋皰痾癰痙癢瘂癆瘓癇癉瘮瘞瘻癟癱癮癭癩癬癲皚皺皸盞鹽監蓋盜盤瞘眥矓睜睞瞼瞶瞞矚矯磯礬礦碭碼磚硨硯碸礪礱礫礎硜碩硤磽磑礄確磠礙磧磣鹼禮禡禕禰禎禱禍稟祿禪離禿稈種祕積稱穢穠穭稅穌穩穡穭窮竊竅窵窯竄窩窺竇窶豎競篤筍筆筧箋籠籩築篳篩簹箏籌篔籤篠簡籙簀篋籜籮簞簫簣簍籃籛籬籪籟糴類秈糶糲粵糞糧糝餱餈緊縶縕緪糹糾紆紅紂纖紇約級紈纊紀紉緯紜紘純紕紗綱納紝縱綸紛紙紋紡紵紖紐紓線紺紲紱練組紳細織終縐絆紼絀紹繹經紿綁絨結絝繞絰絎繪給絢絳絡絕絞統綆綃絹繡綌綏絛繼綈績緒綾緓續綺緋綽鞝緄繩維綿綬繃綢綯綹綣綜綻綰綠綴緇緙緗緘緬纜緹緲緝縕繢緦綞緞緶線緱縋緩締縷編緡緣縉縛縟縝縫縗縞纏縭縊縑繽縹縵縲纓縮繆繅纈繚繕繒韁繾繰繯繳纘罌網羅罰罷羆羈羥羨翹翽翬耮耬聳恥聶聾職聹聯聵聰肅腸膚骯餚腎腫脹脅膽勝朧腖臚脛膠脈膾髒臍腦膿臠腳脫腡臉臘醃膕顎膩靦膃騰臏羶臢輿捨艤艦艙艫艱豔藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇薴蘋範莖蘢蔦塋煢繭荊薦薘莢蕘蓽萴蕎薈薺盪榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蒕蕆蕢蔣蔞醟藍薊蘺蕷鎣驀虆薔蘞藺藹薀蘄蘊藪蘚蘊櫱虜慮虛蟲虯蟣蝨雖蝦蠆蝕蟻螞蠁蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑螿蟎蠨釁銜補襯袞襖嫋褘襪襲襏裝襠褌褳襝褲襉褸襤襴見觀覎規覓視覘覽覺覬覡覿覥覦覯覲覷觴觸觶誾讋譽謄訁計訂訃認譏訐訌討讓訕訖託訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談讅誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖豶貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗贊贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋躊蹤躓躑躡蹣躕躥躪躦軀轀車軋軌軒軑軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞輬輟輜輳輻輯轀輸轡轅轄輾轆轍轔辭闢辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郟鄶鄭鄆酈鄖鄲酇醞醱醬釅釃釀醞採釋裡鑑鑾鏨釒釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鉅鈍鈔鐘鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鉋鈰鉉鉈鉍鈮鈹鐸鉶銬銠鉺鋩錏銪鋮鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鎩鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺鍩錯錨錛錡鍀錁錕錩錫錮鑼錘錐錦鑕鍁錈鍃錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鐨鎇鏌鎮鎛鎘鑷钂鐫鎳鎿鎦鎬鎊鎰鎵鑌鎔鏢鏜鏝鏍鏰鏞鏡鏑鏃鏇鏐鐔钁鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑱鑲長門閂閃閆閈閉問闖閏闈閒閎間閔閌悶閘鬧閨聞闥閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隯隉隕險隨隱隸雋難僱雛讎靂霧霽黴霢靄靚靝靜靨韃鞽韉韝韋韌韍韓韙韞韜韻頁頂頃頇項順須頊頑顧頓頎頒頌頏預顱領頗頸頡頰頲頜潁熲頦頤頻頮頹頷頴穎顆題顒顎顓顏額顳顢顛顙顥纇顫顬顰顴風颺颭颮颯颶颸颼颻飀飄飆飈飛饗饜飠飣飢飥餳飩餼飪飫飭飯飲餞飾飽飼飿飴餌饒餉餄餎餃餏餅餑餖餓餘餒餕餜餛餡館餷饋餶餿饞饁饃餺餾饈饉饅饊饌饢馬馭馱馴馳驅馹駁驢駔駛駟駙駒騶駐駝駑駕驛駘驍罵駰驕驊駱駭駢驫驪騁驗騂駸駿騏騎騍騅騌驌驂騙騭騤騷騖驁騮騫騸驃騾驄驏驟驥驦驤髏髖髕鬢鬹魘魎魚魛魢魷魨魯魴䰾魺鮁鮃鯰鱸鮋鮓鮒鮊鮑鱟鮍鮐鮭鮚鮳鮪鮞鮦鰂鮜鱠鱭鮫鮮鮺鯗鱘鯁鱺鰱鰹鯉鰣鰷鯀鯊鯇鮶鯽鯒鯖鯪鯕鯫鯡鯤鯧鯝鯢鯰鯛鯨鰺鯴鯔鱝鰈鰏鱨鯷鰮鰃鰓鱷鰍鰒鰉鰁鱂鯿鰠鰲鰭鰨鰥鰩鰟鰜鰳鰾鱈鱉鰻鰵鱅䲁鰼鱖鱔鱗鱒鱯鱤鱧鱣䲘鳥鳩雞鳶鳴鳲鷗鴉鶬鴇鴆鴣鶇鸕鴨鴞鴦鴒鴟鴝鴛鷽鴕鷥鷙鴯鴰鵂鴴鵃鴿鸞鴻鵐鵓鸝鵑鵠鵝鵒鷳鵜鵡鵲鶓鵪鵾鵯鵬鵮鶉鶊鵷鷫鶘鶡鶚鶻鶖鷀鶥鶩鷊鷂鶲鶹鶺鷁鶼鶴鷖鸚鷓鷚鷯鷦鷲鷸鷺䴉鸇鷹鸌鸏鸛鸘鹺麥麩麴麵麼黃黌黶黷黲黽黿鼂鼉鼴齊齏齒齔齕齗齟齡齙齠齜齦齬齪齲齷龍龔龕龜䃮䥑鿓鎶';

  static _init() {
    if (S2TConverter._charMap) return;
    const map = new Map();
    const s = S2TConverter.S_CHARS;
    const t = S2TConverter.T_CHARS;
    const len = Math.min(s.length, t.length);
    for (let i = 0; i < len; i++) {
      if (s[i] !== t[i]) {
        map.set(s[i], t[i]);
      }
    }
    // Sort phrases longest first for greedy matching
    S2TConverter._phraseEntries = S2TConverter.PHRASE_PAIRS.slice().sort((a, b) => b[0].length - a[0].length);
    S2TConverter._charMap = map;
  }

  static toTraditional(input) {
    if (!input || typeof input !== 'string') return input || '';
    // Quick ASCII bypass
    if (/^[\x00-\x7F]*$/.test(input)) return input;

    S2TConverter._init();

    // 1. Protect / apply contextual multi-char phrases using Private Use Area tokens
    let text = input;
    const replacements = [];
    for (let i = 0; i < S2TConverter._phraseEntries.length; i++) {
      const [simp, trad] = S2TConverter._phraseEntries[i];
      if (text.includes(simp)) {
        const token = String.fromCharCode(0xE000 + replacements.length);
        replacements.push({ token, trad });
        text = text.split(simp).join(token);
      }
    }

    // 2. Character-by-character O(N) lookup
    const map = S2TConverter._charMap;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += map.get(ch) || ch;
    }

    // 3. Restore contextual phrase tokens
    for (let i = 0; i < replacements.length; i++) {
      const { token, trad } = replacements[i];
      out = out.split(token).join(trad);
    }

    return out;
  }

  static convertLyricsList(list) {
    if (!Array.isArray(list)) return list;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      if (item.text) {
        item.text = S2TConverter.toTraditional(item.text);
      }
      if (Array.isArray(item.words)) {
        for (let w = 0; w < item.words.length; w++) {
          if (item.words[w] && item.words[w].text) {
            item.words[w].text = S2TConverter.toTraditional(item.words[w].text);
          }
        }
      }
    }
    return list;
  }
}

class LrcParser {
  static isMetadataLine(text) {
    if (!text) return true;
    const clean = text.trim();
    if (clean.length < 2) return true;

    // Filter pure divider symbols (---, ***, ...)
    if (/^[\-_~*=·\s.]{2,}$/.test(clean)) return true;

    // Filter common production / credit prefixes
    const metaRegex = /^(作詞|作词|作曲|編曲|编曲|製作|制作|監製|监制|混音|母帶|母带|錄音|录音|吉他|貝斯|贝斯|鼓手|鍵盤|键盘|和聲|和声|弦樂|弦乐|企劃|企划|統籌|统筹|發行|发行|出品|詞|词|曲|編|编|OP|SP|Prod|Produced|Written|Arranged|Mixed|Mastered|Lyrics|Lyricist|Music|Composer|Vocal|Singer|Artist|Album|歌手|專輯|专辑|歌名|曲名)[:：\s\/／、]/i;
    if (metaRegex.test(clean)) return true;

    const pureMetaRegex = /^(純音樂|纯音乐|請欣賞|请欣赏|Instrumental|Intro|Interlude|Outro|Music|Ending)$/i;
    if (pureMetaRegex.test(clean)) return true;

    const creditRegex = /^(Written by|Composed by|Arranged by|Produced by|Directed by|Mastered by|Mixed by|Lyrics by|Music by)/i;
    if (creditRegex.test(clean)) return true;

    return false;
  }

  static normalizeKey(str) {
    return S2TConverter.toTraditional(String(str || ''))
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\-_.,!?'":;()\[\]【】「」『』《》〈〉~·•]/g, '')
      .trim();
  }

  /**
   * Smart YouTube / YouTube Music / GSMTC Track Title & Artist Cleaner
   * Handles:
   * - "BABYMONSTER - 'DESERVE' M/V" -> title: "DESERVE", artist: "BABYMONSTER"
   * - "[MV] GFRIEND(여자친구) _ Rough(시간을 달려서)" -> title: "Rough(시간을 달려서)", artist: "GFRIEND(여자친구)"
   * - "盧廣仲 Crowd Lu 【魚仔】 Official MV" -> title: "魚仔", artist: "盧廣仲 Crowd Lu"
   * - "BABYMONSTER - Topic" -> artist: "BABYMONSTER"
   */
  static cleanTrackInfo(rawTitle, rawArtist) {
    let artist = String(rawArtist || '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*[\(\[](Official|YouTube|Channel|VEVO|Music|Entertainment|Labels?)[\.\s\w]*[\)\]]/gi, '')
      .replace(/\b(VEVO|Official YouTube Channel|Official Channel)\b/gi, '')
      .replace(/\s*[\(\[](feat|ft|with)[\.\s\w]*[\)\]]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    let title = String(rawTitle || '')
      // Strip leading tags like [MV], [Official Video], [4K]
      .replace(/^\s*[\[\(【](mv|m\/v|official|music video|lyric|audio|live|4k|hd|teaser|clip|special|performance)[^\]\)】]*[\]\)】]\s*/gi, '')
      // Strip trailing video noise in brackets/parentheses
      .replace(/\s*[\(\[【](feat|ft|with|official|music video|mv|m\/v|audio|remix|version|ver\.|live|hd|4k|lyric video|lyrics|visualizer|performance|special clip|dance practice)[^)\]]*[\)\]】]/gi, '')
      // Strip bare trailing M/V or Official Video
      .replace(/\s+\b(official\s+music\s+video|official\s+video|official\s+audio|official\s+mv|music\s+video|lyric\s+video|m\/v|mv)\b.*$/i, '')
      .replace(/ - \w+ remix$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    let extractedArtist = '';
    let extractedTitle = '';

    // 1. Check if title contains "Artist - Title" or "Artist _ Title"
    const dashMatch = title.match(/^(.+?)\s+(?:[-–—_]|\/\/)\s+(.+)$/);
    if (dashMatch) {
      const left = dashMatch[1].trim();
      const right = dashMatch[2].trim();
      const normArtist = LrcParser.normalizeKey(artist);
      const normLeft = LrcParser.normalizeKey(left);

      const isGenericChannel = !artist || /1thek|smtown|jyp|hybe|yg\s*entertainment|stone\s*music|kakao|genie|bugs|딩고|dingo|the\s*first\s*take|팀이어|添翼|滾石|相信音樂|華研|愛貝克思/i.test(artist);

      if (normArtist && (normLeft.includes(normArtist) || normArtist.includes(normLeft))) {
        title = right;
      } else if (isGenericChannel) {
        extractedArtist = left;
        title = right;
      } else {
        extractedTitle = right;
        extractedArtist = left;
      }
    }

    // 2. Check if title wraps the actual song name in quotes or CJK brackets:
    // e.g. "BABYMONSTER 'DESERVE'" or "盧廣仲 Crowd Lu 【魚仔】"
    const bracketMatch = title.match(/^(.*?)\s*(?:['"‘’“”「」『』《》【】])([^'"‘’“”「」『』《》【】]{2,})(?:['"‘’“”「」『』《》【】])\s*(.*)$/);
    if (bracketMatch) {
      const prefix = bracketMatch[1].replace(/^[\s\-–—_]+|[\s\-–—_]+$/g, '').trim();
      const innerSong = bracketMatch[2].trim();
      if (innerSong.length >= 2) {
        if (!extractedArtist && prefix && prefix.length >= 2) {
          extractedArtist = prefix;
        }
        extractedTitle = innerSong;
        // If prefix matches known artist, strip prefix immediately
        const normArtist = LrcParser.normalizeKey(artist || extractedArtist);
        const normPrefix = LrcParser.normalizeKey(prefix);
        if (!prefix || (normArtist && (normPrefix.includes(normArtist) || normArtist.includes(normPrefix)))) {
          title = innerSong;
        }
      }
    }

    // Remove surrounding quotes if any remain
    title = title.replace(/^['"‘’“”「」『』《》【】]+|['"‘’“”「」『』《》【】]+$/g, '').trim();
    if (!artist && extractedArtist) {
      artist = extractedArtist;
    }

    return {
      cleanTitle: title,
      cleanArtist: artist,
      altTitle: extractedTitle && extractedTitle !== title ? extractedTitle : '',
      altArtist: extractedArtist && extractedArtist !== artist ? extractedArtist : ''
    };
  }

  /**
   * Parse LyricsPlus JSON (Apple Music / QQ Music / Musixmatch Syllable & Line Sync)
   */
  static parseLyricsPlus(json) {
    const rows = Array.isArray(json?.lyrics)
      ? json.lyrics
      : (Array.isArray(json?.data?.lyrics) ? json.data.lyrics : []);
    if (!rows || rows.length === 0) return [];

    const result = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowTimeMs = Number(row?.time);
      const rowDurMs = Number(row?.duration);
      const syllabus = Array.isArray(row?.syllabus) ? row.syllabus : [];

      const words = [];
      const bgWords = [];

      for (let s = 0; s < syllabus.length; s++) {
        const syl = syllabus[s];
        const tMs = Number(syl?.time);
        const dMs = Number(syl?.duration);
        const txt = String(syl?.text ?? '');
        if (!Number.isFinite(tMs) || !txt) continue;

        const wStart = tMs / 1000;
        const wEnd = (Number.isFinite(dMs) && dMs > 0) ? (tMs + dMs) / 1000 : wStart + 0.25;

        if (syl?.isBackground) {
          bgWords.push({ time: wStart, end: wEnd, text: txt });
        } else {
          words.push({ time: wStart, end: wEnd, text: txt });
        }
      }

      const activeWords = words.length > 0 ? words : bgWords;
      // Clamp monotonic word times
      for (let w = 1; w < activeWords.length; w++) {
        if (activeWords[w].time < activeWords[w - 1].time) {
          activeWords[w].time = activeWords[w - 1].time;
        }
        if (activeWords[w].end < activeWords[w].time) {
          activeWords[w].end = activeWords[w].time + 0.15;
        }
      }

      const startTime = Number.isFinite(rowTimeMs)
        ? rowTimeMs / 1000
        : (activeWords.length > 0 ? activeWords[0].time : null);
      if (startTime === null) continue;

      const lineText = (words.length > 0 && bgWords.length > 0)
        ? words.map(w => w.text).join('').trim()
        : (String(row?.text ?? '').trim() || activeWords.map(w => w.text).join('').trim());

      if (!lineText) continue;

      if (startTime < 22.0 && LrcParser.isMetadataLine(lineText)) {
        continue;
      }

      let endTime = (Number.isFinite(rowTimeMs) && Number.isFinite(rowDurMs) && rowDurMs > 0)
        ? (rowTimeMs + rowDurMs) / 1000
        : (activeWords.length > 0 ? activeWords[activeWords.length - 1].end : null);

      result.push({
        time: Math.max(0, startTime),
        endTime: endTime && endTime > startTime ? endTime : null,
        text: lineText,
        words: activeWords.length > 1 ? activeWords : null
      });
    }

    result.sort((a, b) => a.time - b.time);

    // Deduplicate identical consecutive lines at identical timestamps
    const deduplicated = [];
    for (let item of result) {
      const prev = deduplicated[deduplicated.length - 1];
      if (!prev || prev.text !== item.text || Math.abs(prev.time - item.time) > 0.5) {
        deduplicated.push(item);
      }
    }
    return S2TConverter.convertLyricsList(deduplicated);
  }

  static parseTTML(xmlText) {
    if (!xmlText || typeof DOMParser === 'undefined') return [];
    try {
      const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
      if (doc.querySelector('parsererror')) return [];
      const nodes = Array.from(doc.getElementsByTagNameNS('*', 'p'));
      const toSeconds = (raw) => {
        if (!raw) return NaN;
        const v = String(raw).trim();
        if (/^\d+(?:\.\d+)?s$/.test(v)) return parseFloat(v);
        const m = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d+))?$/);
        if (!m) return NaN;
        return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) +
          (m[4] ? Number('0.' + m[4]) : 0);
      };
      const result = [];
      for (const p of nodes) {
        const begin = toSeconds(p.getAttribute('begin'));
        if (!Number.isFinite(begin)) continue;
        const end = toSeconds(p.getAttribute('end'));
        const spans = Array.from(p.getElementsByTagNameNS('*', 'span'));
        const words = [];
        for (const span of spans) {
          const wt = toSeconds(span.getAttribute('begin'));
          const we = toSeconds(span.getAttribute('end'));
          const txt = (span.textContent || '').replace(/\s+/g, ' ');
          if (Number.isFinite(wt) && txt.trim()) {
            words.push({ time: wt, end: Number.isFinite(we) && we > wt ? we : wt + 0.22, text: txt });
          }
        }
        const text = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        result.push({ time: begin, endTime: Number.isFinite(end) && end > begin ? end : null,
          text, words: words.length > 1 ? words : null });
      }
      result.sort((a, b) => a.time - b.time);
      return S2TConverter.convertLyricsList(result);
    } catch (e) { return []; }
  }

  /**
   * Parse Standard & Enhanced LRC (with [offset:+/-ms] and <mm:ss.xx> word tags)
   */
  static parseLRC(text) {
    if (!text) return [];
    const temp = [];
    const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const timeReg = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const inlineWordReg = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g;

    // 1. Check for [offset:+/-ms] tag in LRC header
    let globalOffsetSec = 0.0;
    const offsetMatch = String(text).match(/\[offset:\s*([+-]?\d+)\s*\]/i);
    if (offsetMatch) {
      const offsetMs = parseInt(offsetMatch[1], 10);
      if (Number.isFinite(offsetMs)) {
        // In LRC specification, positive offset means lyrics appear earlier (subtract from timestamp)
        globalOffsetSec = -offsetMs / 1000;
      }
    }

    const parseTimeParts = (m, s, msStr) => {
      const min = parseInt(m, 10);
      const sec = parseInt(s, 10);
      const ms = msStr ? parseInt(String(msStr).padEnd(3, '0').slice(0, 3), 10) : 0;
      return min * 60 + sec + ms / 1000;
    };

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      let match;
      const lineTimes = [];
      timeReg.lastIndex = 0;
      while ((match = timeReg.exec(line)) !== null) {
        lineTimes.push(parseTimeParts(match[1], match[2], match[3]));
      }

      if (lineTimes.length === 0) continue;

      // Strip line timestamps and optional speaker prefix (v1:, bg:)
      let rawContent = line
        .replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '')
        .replace(/^(?:v\d{1,3}|bg)\s*:\s*/i, '')
        .trim();

      // Check for Enhanced LRC inline word tags <mm:ss.xx>
      const words = [];
      if (/<\d{1,3}:\d{2}/.test(rawContent)) {
        inlineWordReg.lastIndex = 0;
        let wm;
        while ((wm = inlineWordReg.exec(rawContent)) !== null) {
          const wTime = Math.max(0, parseTimeParts(wm[1], wm[2], wm[3]) + globalOffsetSec);
          const wText = wm[4];
          if (wText) {
            words.push({ time: wTime, end: wTime + 0.25, text: wText });
          }
        }
        for (let i = 0; i < words.length - 1; i++) {
          words[i].end = Math.max(words[i].time + 0.05, words[i + 1].time);
        }
        rawContent = rawContent.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim();
      }

      if (!rawContent || /^(by|ar|ti|al|offset|re|ve):/i.test(rawContent)) {
        continue;
      }

      for (const rawTime of lineTimes) {
        const totalSeconds = Math.max(0, rawTime + globalOffsetSec);
        if (totalSeconds < 22.0 && LrcParser.isMetadataLine(rawContent)) {
          continue;
        }
        temp.push({
          time: totalSeconds,
          endTime: words.length > 0 ? words[words.length - 1].end : null,
          text: rawContent,
          words: words.length > 1 ? words : null
        });
      }
    }

    temp.sort((a, b) => a.time - b.time);

    // Remove consecutive identical duplicates
    const deduplicated = [];
    let lastText = '';
    let lastTime = -10;
    for (let item of temp) {
      if (item.text !== lastText || (item.time - lastTime) > 8.0) {
        deduplicated.push(item);
        lastText = item.text;
        lastTime = item.time;
      }
    }
    return S2TConverter.convertLyricsList(deduplicated);
  }

  static parsePlain(text) {
    if (!text) return [];
    const rawLines = String(text).split('\n').map(l => l.trim()).filter(l => l);
    const cleanList = [];
    let lastT = '';
    rawLines.forEach((l, idx) => {
      if (idx < 6 && LrcParser.isMetadataLine(l)) return;
      if (l !== lastT) {
        cleanList.push({ time: idx * 4.0, endTime: (idx + 1) * 4.0, text: l, words: null });
        lastT = l;
      }
    });
    return S2TConverter.convertLyricsList(cleanList);
  }

  /**
   * YTM_Immersion Smart Candidate Scorer for LRCLIB search results
   */
  static pickBestLrcLibHit(items, wantTitle, wantArtist, wantDuration = 0) {
    if (!Array.isArray(items) || items.length === 0) return null;

    const targetTitle = LrcParser.normalizeKey(wantTitle);
    const targetArtist = LrcParser.normalizeKey(wantArtist);
    const targetDur = Number(wantDuration) > 20 ? Number(wantDuration) : null;
    const variantKeywords = /\b(remix|live|instrumental|karaoke|cover|sped\s*up|slowed|nightcore|8d|acoustic|demo|ver\.|version)\b/i;
    const wantHasVariant = variantKeywords.test(wantTitle);

    let bestItem = null;
    let bestScore = -Infinity;

    for (const item of items) {
      if (!item) continue;
      const hasSynced = Boolean(item.syncedLyrics && item.syncedLyrics.trim());
      const hasPlain = Boolean(item.plainLyrics && item.plainLyrics.trim());
      if (!hasSynced && !hasPlain) continue;

      let score = hasSynced ? 150 : 10;

      const candRawTitle = String(item.trackName || item.track_name || item.name || '');
      const candRawArtist = String(item.artistName || item.artist_name || item.artist || '');
      const candTitle = LrcParser.normalizeKey(candRawTitle);
      const candArtist = LrcParser.normalizeKey(candRawArtist);

      // 1. Title Matching
      if (targetTitle && candTitle) {
        if (candTitle === targetTitle) {
          score += 100;
        } else if (targetTitle.includes(candTitle) || candTitle.includes(targetTitle)) {
          score += 45;
        } else {
          score -= 50;
        }
      }

      // 2. Penalize unwanted Remix / Live / Instrumental variants
      if (!wantHasVariant && variantKeywords.test(candRawTitle)) {
        score -= 85;
      }

      // 3. Artist Matching
      if (targetArtist && candArtist) {
        if (candArtist === targetArtist) {
          score += 70;
        } else if (candArtist.includes(targetArtist) || targetArtist.includes(candArtist)) {
          score += 40;
        } else {
          score -= 25;
        }
      }

      // 4. Duration Closeness
      const candDur = Number(item.duration);
      if (targetDur && Number.isFinite(candDur) && candDur > 0) {
        const diff = Math.abs(candDur - targetDur);
        if (diff <= 2.5) score += 55;
        else if (diff <= 6.0) score += 25;
        else if (diff <= 12.0) score += 5;
        else score -= Math.min(60, diff * 1.5);
      }

      // 5. Reject broken 1~3 line fragments
      if (hasSynced) {
        const lineCount = item.syncedLyrics.split('\n').length;
        if (lineCount < 5) score -= 120;
      }

      // 6. 🇰🇷 Korean Hangul Defense (Preserve Authentic Hangul over English translations)
      const hasKoreanInTarget = /[\uac00-\ud7af]/.test(wantTitle) || /[\uac00-\ud7af]/.test(wantArtist);
      const isKnownKpop = /\b(illit|newjeans|aespa|ive|le sserafim|twice|blackpink|babymonster|itzy|nmixx|bts|seventeen|stray kids|gidle|g-i-dle|kiss of life)\b/i.test(wantArtist) ||
                          /\b(illit|newjeans|aespa|ive|le sserafim|twice|blackpink|babymonster|itzy|nmixx|bts|seventeen|stray kids|gidle|g-i-dle|kiss of life)\b/i.test(wantTitle);
      if (hasKoreanInTarget || isKnownKpop) {
        const lyricsText = (item.syncedLyrics || item.plainLyrics || '');
        const hasKoreanInCand = /[\uac00-\ud7af]/.test(lyricsText);
        if (hasKoreanInCand) {
          score += 120; // Massive boost for genuine Hangul lyrics
        } else {
          score -= 90;  // Strong penalty for English-only romanization / translation
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    return bestItem;
  }
}

class LrcCache {
  static get(queryKey) {
    try {
      const data = localStorage.getItem(`aod_lrc_v2_${queryKey}`);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.length >= 3) {
          return S2TConverter.convertLyricsList(parsed);
        }
      }
    } catch (e) {}
    return null;
  }

  static set(queryKey, list) {
    try {
      if (queryKey && list && list.length >= 3) {
        localStorage.setItem(`aod_lrc_v2_${queryKey}`, JSON.stringify(list));
      }
    } catch (e) {}
  }
}

class LyricsEngine {
  constructor(options = {}) {
    this.viewport = document.getElementById(options.viewportId || 'lyricsViewport');
    this.track = document.getElementById(options.trackId || 'lyricsTrack');
    this.onSeek = options.onSeek || null;
    this.onDurationResolved = options.onDurationResolved || null;

    this.lyrics = [];
    this.currentIndex = -1;
    this.currentTrackQuery = '';
    this.sessionId = 0;
    this.activeController = null;
    this.noLyricsTimer = null;
    this.offset = 0.0;
    this.trackDuration = 210;
    this.lastSyncTime = 0.0;
    this.lastWipeStep = -1;
    this.candidates = [];
    this.selectedCandidateIndex = -1;
    this.onCandidatesChanged = options.onCandidatesChanged || null;

    this.bindViewportOffsetWheel();
    this.reset();
  }

  /**
   * Allow fine-tuning lyric offset with Mouse Wheel over the lyrics viewport (±0.25s)
   * Middle-click resets offset to 0.0s.
   */
  bindViewportOffsetWheel() {
    if (!this.viewport) return;
    this.viewport.addEventListener('wheel', (e) => {
      if (!this.lyrics || this.lyrics.length === 0) return;
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.25 : -0.25;
      this.offset = Math.max(-30.0, Math.min(30.0, this.offset + step));
    }, { passive: false });

    this.viewport.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.offset = 0.0;
      }
    });
  }

  // ==========================================================================
  // Public Deep Interface
  // ==========================================================================

  setTrack(trackInfo, isNew = true) {
    if (!trackInfo || !trackInfo.title) {
      this.reset();
      return;
    }

    const cleaned = LrcParser.cleanTrackInfo(trackInfo.title, trackInfo.artist);
    const { cleanTitle, cleanArtist } = cleaned;
    if (!cleanTitle) {
      this.reset();
      return;
    }

    const queryKey = `${cleanTitle}_${cleanArtist}`;
    if (Number(trackInfo.duration) > 0) this.trackDuration = Number(trackInfo.duration);

    // If same track is already loaded or currently being fetched, do not abort in-flight request!
    if (queryKey === this.currentTrackQuery) {
      if (this.lyrics.length > 0) {
        if (isNew) {
          this.offset = 0.0;
          this.resetToStart();
        }
        return;
      }
      if (this.activeController) {
        return;
      }
    }

    this.currentTrackQuery = queryKey;
    this.offset = 0.0;
    this.candidates = [];
    this.selectedCandidateIndex = -1;
    if (typeof this.onCandidatesChanged === 'function') this.onCandidatesChanged([]);
    this.cancelRequests();
    this.sessionId++;
    const session = this.sessionId;

    // 0ms instant purge of prior song DOM
    this.purgeDOM();

    // Check local cache
    const cached = LrcCache.get(queryKey);
    if (cached) {
      // Show cached lyrics immediately, but still refresh provider candidates in the
      // background so the user can switch to a better source for this same track.
      this.applyLyrics(cached, session);
    }
    this.fetchOnline(cleaned, queryKey, session, trackInfo.duration || 0);
  }

  sync(currentTime, isPaused = false) {
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      this.lastSyncTime = currentTime;
    }
    if (!this.lyrics || this.lyrics.length === 0) return;

    const effectiveTime = Math.max(0, currentTime + this.offset);
    const firstItem = this.lyrics[0];
    const lastItem = this.lyrics[this.lyrics.length - 1];

    // 1. Outro Fade Out (4.0s after last line fades to 100% pure black)
    const lastEndTime = lastItem.endTime || (lastItem.time + 4.0);
    if (lastItem && effectiveTime > Math.max(lastItem.time + 4.0, lastEndTime + 2.5)) {
      if (this.currentIndex !== -999) {
        this.currentIndex = -999;
        if (this.track) {
          Array.from(this.track.children).forEach(el => {
            el.className = 'lyric-line is-outro-faded';
          });
        }
      }
      return;
    }

    // 2. Intro Anchor Lock (locks on line 0 during instrumental intro)
    if (firstItem && effectiveTime < firstItem.time) {
      if (this.currentIndex !== 0) {
        this.currentIndex = 0;
        this.scrollToIndex(0, true);
      }
      if (this.track && this.track.children[0]) {
        this.track.children[0].style.setProperty('--wipe-progress', '0%');
      }
      return;
    }

    // 3. Binary Search for Current Line (O(log N))
    let low = 0;
    let high = this.lyrics.length - 1;
    let targetIndex = -1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (effectiveTime >= this.lyrics[mid].time) {
        targetIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (targetIndex >= 0) {
      if (targetIndex !== this.currentIndex) {
        this.currentIndex = targetIndex;
        this.lastWipeStep = -1;
        this.scrollToIndex(targetIndex, true);
      }

      // 4. Syllable-Accurate / Line Wipe Progress Calculation (Throttled to 5% steps to prevent 144Hz DOM style thrashing)
      const currentItem = this.lyrics[targetIndex];
      const nextItem = this.lyrics[targetIndex + 1];
      let ratio = 0.0;

      if (currentItem.words && currentItem.words.length > 1) {
        const words = currentItem.words;
        let completedChars = 0;
        let totalChars = 0;
        for (let w = 0; w < words.length; w++) {
          const word = words[w];
          const wLen = Math.max(1, word.text.length);
          totalChars += wLen;
          if (effectiveTime >= word.end) {
            completedChars += wLen;
          } else if (effectiveTime > word.time) {
            const wDur = Math.max(0.05, word.end - word.time);
            completedChars += wLen * Math.min(1.0, (effectiveTime - word.time) / wDur);
          }
        }
        ratio = totalChars > 0 ? Math.min(1.0, Math.max(0.0, completedChars / totalChars)) : 0.0;
      } else {
        const startTime = currentItem.time;
        const naturalEnd = currentItem.endTime
          ? currentItem.endTime
          : (nextItem ? Math.min(nextItem.time, startTime + 5.5) : (startTime + 4.5));
        const duration = Math.max(0.5, naturalEnd - startTime);
        const elapsed = Math.max(0, effectiveTime - startTime);
        ratio = Math.min(1.0, Math.max(0.0, elapsed / duration));
      }

      const wipeStep = Math.round(ratio * 20);
      if (wipeStep !== this.lastWipeStep) {
        this.lastWipeStep = wipeStep;
        const percentStr = (wipeStep * 5) + '%';
        if (this.track && this.track.children[targetIndex]) {
          this.track.children[targetIndex].style.setProperty('--wipe-progress', percentStr);
        }
      }
    }
  }

  reset() {
    this.cancelRequests();
    this.sessionId++;
    this.lyrics = [];
    this.currentIndex = -1;
    this.currentTrackQuery = '';
    this.offset = 0.0;
    this.candidates = [];
    this.selectedCandidateIndex = -1;
    this.trackDuration = 210;

    if (this.noLyricsTimer) {
      clearTimeout(this.noLyricsTimer);
      this.noLyricsTimer = null;
    }

    this.purgeDOM();
  }

  loadLocalLRC(text) {
    this.cancelRequests();
    this.sessionId++;
    const parsed = LrcParser.parseLRC(text);
    if (parsed.length > 0) {
      this.applyLyrics(parsed, this.sessionId);
    }
  }

  // ==========================================================================
  // Internal Multi-Source Fetch Implementation
  // ==========================================================================

  cancelRequests() {
    if (this.activeController) {
      try {
        this.activeController.abort();
      } catch (e) {}
      this.activeController = null;
    }
  }

  purgeDOM() {
    if (this.track) {
      this.track.style.transition = 'none';
      this.track.innerHTML = '';
      this.track.style.opacity = '0';
      this.track.style.transform = 'translateY(110px)';
    }
  }

  resetToStart() {
    this.currentIndex = -1;
    if (this.lyrics && this.lyrics.length > 0) {
      this.scrollToIndex(0, false);
      if (this.track) {
        Array.from(this.track.children).forEach(el => {
          el.style.setProperty('--wipe-progress', '0%');
        });
      }
    } else {
      this.purgeDOM();
    }
  }

  fetchWithTimeout(url, options = {}, timeoutMs = 4000, parentSignal = null) {
    const ctrl = new AbortController();
    const onParentAbort = () => {
      try { ctrl.abort(); } catch (e) {}
    };
    if (parentSignal) {
      if (parentSignal.aborted) {
        onParentAbort();
      } else {
        parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }
    }
    const timer = setTimeout(() => {
      try { ctrl.abort(); } catch (e) {}
    }, timeoutMs);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => {
      clearTimeout(timer);
      if (parentSignal) {
        try { parentSignal.removeEventListener('abort', onParentAbort); } catch (e) {}
      }
    });
  }

  async fetchFromLyricsPlus(title, artist, durationSec, signal) {
    if (!title) return null;
    const params = new URLSearchParams({ title, source: 'apple,lyricsplus,musixmatch,qq,spotify' });
    if (artist) params.set('artist', artist);
    if (durationSec && durationSec > 20) {
      params.set('duration', String(Math.round(durationSec)));
    }
    const queryStr = params.toString();

    const mirrorPromises = LYRICSPLUS_MIRRORS.map(async (base) => {
      const res = await this.fetchWithTimeout(`${base}/v2/lyrics/get?${queryStr}`, {
        method: 'GET',
        cache: 'no-store'
      }, 3800, signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.error) throw new Error('API Error');
      const parsed = LrcParser.parseLyricsPlus(json);
      if (!parsed || parsed.length < 3) throw new Error('Empty lyrics');
      return { lyrics: parsed, provider: String(json?.metadata?.source || json?.provider || json?.type || 'aggregated') };
    });

    try {
      return await Promise.any(mirrorPromises);
    } catch (e) {
      return null;
    }
  }

  async fetchFromBetterLyrics(title, artist, durationSec, signal) {
    if (!title && !artist) return null;
    const params = new URLSearchParams({
      s: title || '', a: artist || '', al: '', d: String(Math.max(0, Math.round(durationSec || 0)))
    });
    try {
      const response = await this.fetchWithTimeout(`https://api.betterlyrics.org/getLyrics?${params.toString()}`, {
        method: 'GET', cache: 'no-store'
      }, 3800, signal);
      if (!response.ok) return null;
      const data = await response.json();
      const parsed = LrcParser.parseTTML(data?.ttml);
      return parsed.length >= 3 ? { lyrics: parsed, confidence: Number(data?.score) || 0 } : null;
    } catch (e) {
      return null;
    }
  }

  scoreCandidate(candidate, wantedTitle, wantedArtist, durationSec) {
    const norm = v => LrcParser.normalizeKey(String(v || ''));
    const wt = norm(wantedTitle), wa = norm(wantedArtist);
    const ct = norm(candidate.title), ca = norm(candidate.artist);
    let score = 30;
    if (wt && ct === wt) score += 70;
    else if (wt && (ct.includes(wt) || wt.includes(ct))) score += 25;
    if (wa && ca === wa) score += 45;
    else if (wa && ca && (ca.includes(wa) || wa.includes(ca))) score += 20;
    const lines = candidate.lyrics || [];
    if (lines.some(line => line.words && line.words.length > 1)) score += 35;
    if (lines.length < 5) score -= 70;
    const last = lines.length ? (lines[lines.length - 1].endTime || lines[lines.length - 1].time) : 0;
    if (durationSec > 0 && last > 0) {
      const delta = Math.abs(last - durationSec);
      if (delta <= 8) score += 12;
      else if (delta > 45) score -= 25;
    }
    const hasKoreanInTarget = /[\uac00-\ud7af]/.test(wantedTitle || '') || /[\uac00-\ud7af]/.test(wantedArtist || '');
    const isKnownKpop = /\b(illit|newjeans|aespa|ive|le sserafim|twice|blackpink|babymonster|itzy|nmixx|bts|seventeen|stray kids|gidle|g-i-dle|kiss of life)\b/i.test(`${wantedArtist || ''} ${wantedTitle || ''}`);
    if ((hasKoreanInTarget || isKnownKpop) && lines.length > 0) {
      const sampleText = lines.map(l => l.text || '').join(' ');
      if (/[\uac00-\ud7af]/.test(sampleText)) score += 65;
      else score -= 45;
    }
    score += Math.round(Math.max(0, Math.min(1, candidate.confidence || 0)) * 20);
    return score;
  }

  async fetchFromLrcLib(title, artist, durationSec, signal) {
    if (!title) return null;

    // 1. Try exact /api/get when artist is known
    if (artist) {
      try {
        const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
        const res = await this.fetchWithTimeout(getUrl, {}, 4000, signal);
        if (res.ok) {
          const data = await res.json();
          if (data && data.syncedLyrics) {
            const parsed = LrcParser.parseLRC(data.syncedLyrics);
            if (parsed.length >= 3) return parsed;
          }
        }
      } catch (e) {
        if (signal && signal.aborted) return null;
      }
    }

    // 2. Search /api/search (try structured track_name + artist_name first to avoid FTS5 503 on short CJK/Hangul titles)
    const searchUrls = [];
    if (artist) {
      searchUrls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`);
      searchUrls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`);
    }
    searchUrls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}`);
    searchUrls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(title)}`);

    for (const searchUrl of searchUrls) {
      if (signal && signal.aborted) return null;
      try {
        const res = await this.fetchWithTimeout(searchUrl, {}, 4000, signal);
        if (!res.ok) continue;
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) continue;

        const best = LrcParser.pickBestLrcLibHit(list, title, artist, durationSec);
        if (best) {
          const parsed = best.syncedLyrics
            ? LrcParser.parseLRC(best.syncedLyrics)
            : LrcParser.parsePlain(best.plainLyrics);
          if (parsed && parsed.length >= 3) {
            return parsed;
          }
        }
      } catch (e) {
        if (signal && signal.aborted) return null;
      }
    }
    return null;
  }

  async fetchOnline(cleaned, queryKey, session, durationSec = 0) {
    this.activeController = new AbortController();
    const controller = this.activeController;
    const signal = controller.signal;
    const { cleanTitle, cleanArtist, altTitle, altArtist } = cleaned;
    const pairs = [];
    const pushPair = (t, a) => {
      const tt = String(t || '').trim(), aa = String(a || '').trim();
      if (!tt) return;
      if (!pairs.some(p => p.title === tt && p.artist === aa)) pairs.push({ title: tt, artist: aa });
    };

    const addDecomposedPairs = (baseT, baseA) => {
      pushPair(baseT, baseA);
      const cleanA = String(baseA || '').replace(/\s*[\(\[（【][^)\]）】]+[\)\]）】]\s*/g, ' ').trim();
      if (cleanA && cleanA !== baseA) pushPair(baseT, cleanA);
      const parenMatch = String(baseT || '').match(/^(.+?)\s*[\(\[（【]([^)\]）】]{2,})[\)\]）】]\s*$/);
      if (parenMatch) {
        const outer = parenMatch[1].trim();
        const inner = parenMatch[2].trim();
        // Prefer inner Latin/English title (e.g. "CHOOM" from "춤 (CHOOM)") first as fallback, then outer
        pushPair(inner, cleanA || baseA);
        pushPair(outer, cleanA || baseA);
      }
    };

    if (altTitle || altArtist) {
      addDecomposedPairs(altTitle || cleanTitle, altArtist || cleanArtist);
    }
    addDecomposedPairs(cleanTitle, cleanArtist);

    let collected = [];
    const commitCollected = () => {
      if (this.sessionId !== session || signal.aborted) return false;
      const seen = new Set();
      const deduped = collected.filter(c => {
        const key = c.source + '|' + c.lyrics.slice(0, 8).map(x => `${Math.round(x.time * 10)}:${x.text}`).join('|');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const c of deduped) {
        c.score = this.scoreCandidate(c, cleanTitle, cleanArtist, durationSec);
        c.hasSyllables = c.lyrics.some(line => line.words && line.words.length > 1);
        c.duration = c.lyrics.length ? (c.lyrics[c.lyrics.length - 1].endTime || c.lyrics[c.lyrics.length - 1].time) : 0;
      }
      deduped.sort((a, b) => b.score - a.score);
      this.candidates = deduped.slice(0, 5);
      this.selectedCandidateIndex = this.candidates.length ? 0 : -1;
      if (typeof this.onCandidatesChanged === 'function') this.onCandidatesChanged(this.getCandidateSummary());
      const chosen = this.candidates[0];
      if (chosen) {
        LrcCache.set(queryKey, chosen.lyrics);
        this.applyLyrics(chosen.lyrics, session);
        return true;
      }
      return false;
    };

    try {
      for (const pair of pairs) {
        if (this.sessionId !== session || signal.aborted) return;

        const pLrc = this.fetchFromLrcLib(pair.title, pair.artist, durationSec, signal).then(lrc => {
          if (lrc && lrc.length >= 3) {
            collected.push({ source: 'LRCLIB', title: pair.title, artist: pair.artist, lyrics: lrc });
            commitCollected();
          }
        }).catch(() => {});

        const pPlus = this.fetchFromLyricsPlus(pair.title, pair.artist, durationSec, signal).then(plus => {
          if (plus?.lyrics && plus.lyrics.length >= 3) {
            collected.push({ source: `LyricsPlus (${plus.provider})`, title: pair.title, artist: pair.artist, lyrics: plus.lyrics });
            commitCollected();
          }
        }).catch(() => {});

        const pBetter = this.fetchFromBetterLyrics(pair.title, pair.artist, durationSec, signal).then(better => {
          if (better?.lyrics?.length >= 3) {
            collected.push({ source: 'Better Lyrics', title: pair.title, artist: pair.artist, lyrics: better.lyrics, confidence: better.confidence });
            commitCollected();
          }
        }).catch(() => {});

        await Promise.allSettled([pLrc, pPlus, pBetter]);
        if (this.sessionId !== session || signal.aborted) return;

        // If we already found a strong candidate from this pair, stop querying fallback pairs
        if (this.candidates.length > 0 && this.candidates[0].score >= 60) {
          break;
        }
      }

      if (this.sessionId !== session || signal.aborted) return;
      if (!this.candidates.length) {
        this.setFallbackTitleDisplay(cleanTitle);
      }
    } catch (e) {
      if (this.sessionId === session && !signal.aborted && !this.candidates.length) {
        this.setFallbackTitleDisplay(cleanTitle);
      }
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  getCandidateSummary() {
    return this.candidates.map((c, index) => ({ index, source: c.source, title: c.title, artist: c.artist,
      score: c.score, duration: c.duration, hasSyllables: !!c.hasSyllables }));
  }

  selectCandidate(index) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= this.candidates.length) return false;
    this.selectedCandidateIndex = i;
    this.applyLyrics(this.candidates[i].lyrics, this.sessionId);
    if (typeof this.onCandidatesChanged === 'function') this.onCandidatesChanged(this.getCandidateSummary());
    return true;
  }

  searchManually(title, artist = '') {
    const t = String(title || '').trim(), a = String(artist || '').trim();
    if (t) this.setTrack({ title: t, artist: a, duration: this.trackDuration }, true);
  }

  applyLyrics(list, session) {
    if (this.sessionId !== session) return;
    this.lyrics = list;
    this.currentIndex = -1;

    // Compute track duration estimate
    if (this.lyrics.length > 0) {
      const lastLine = this.lyrics[this.lyrics.length - 1];
      const lastEnd = lastLine.endTime || (lastLine.time + 8.0);
      this.trackDuration = Math.max(120, lastEnd + 4.0);
      if (this.onDurationResolved) {
        this.onDurationResolved(this.trackDuration);
      }
    }

    this.renderDOM();
    if (this.lastSyncTime > 0.05) {
      this.sync(this.lastSyncTime, false);
    } else {
      this.scrollToIndex(0, false);
    }
  }

  setFallbackTitleDisplay(songName) {
    this.lyrics = [];
    this.currentIndex = -1;
    if (this.track) {
      if (songName) {
        this.track.innerHTML = `<div class="lyric-line is-active" id="fallbackTitleLine">🎵 ${songName}</div>`;
        this.track.style.transition = 'opacity 0.6s ease, transform 0.4s ease';
        this.track.style.opacity = '1';
        this.track.style.transform = 'translateY(110px)';

        this.noLyricsTimer = setTimeout(() => {
          const titleLine = document.getElementById('fallbackTitleLine');
          if (titleLine) {
            titleLine.className = 'lyric-line is-outro-faded';
          }
        }, 5000);
      } else {
        this.purgeDOM();
      }
    }
  }

  renderDOM() {
    if (!this.track) return;
    if (!this.lyrics || this.lyrics.length === 0) {
      this.purgeDOM();
      return;
    }

    const fragment = document.createDocumentFragment();
    this.lyrics.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'lyric-line';
      el.dataset.idx = idx;
      el.textContent = item.text;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onSeek) {
          this.onSeek(item.time);
        }
      });
      fragment.appendChild(el);
    });

    this.track.innerHTML = '';
    this.track.appendChild(fragment);
    this.track.style.opacity = '1';
    this.track.style.transition = 'opacity 0.4s ease, transform 0.48s cubic-bezier(0.16, 1, 0.3, 1)';
  }

  scrollToIndex(index, animate = true) {
    if (!this.track || !this.viewport) return;
    const lines = this.track.children;
    if (!lines || lines.length === 0) return;

    const targetEl = lines[index];
    if (!targetEl) return;

    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      let wantClass = 'lyric-line';
      if (i === index) {
        wantClass = 'lyric-line is-active';
      } else if (i === index - 1) {
        wantClass = 'lyric-line is-prev';
      } else if (i === index + 1) {
        wantClass = 'lyric-line is-next';
      }
      if (el.className !== wantClass) {
        el.className = wantClass;
      }
    }

    const viewportHeight = this.viewport.clientHeight || 290;
    const targetCenterY = targetEl.offsetTop + targetEl.offsetHeight / 2;
    const translateY = (viewportHeight / 2) - targetCenterY;

    if (!animate) {
      this.track.style.transition = 'none';
      this.track.style.transform = `translateY(${translateY}px)`;
      void this.track.offsetWidth;
      this.track.style.transition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      this.track.style.transform = `translateY(${translateY}px)`;
    }
  }
}

// Attach globally for browser / WebView2 loading
window.LyricsEngine = LyricsEngine;
window.LrcParser = LrcParser;
window.LrcCache = LrcCache;
window.S2TConverter = S2TConverter;
