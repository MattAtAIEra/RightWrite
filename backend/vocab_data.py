"""
康軒版 114學年度第2學期 四年級國語 生字資料
Source: resource/*.xlsx (課本生字語詞與詞條解釋)
"""

# 每課生字資料：課號 -> {title, characters: [{char, similar_wrong, examples}], compounds: [{word, examples}]}
VOCAB_DATA = {
    1: {
        "title": "一束鮮花",
        "characters": [
            {"char": "潔", "similar_wrong": ["結", "浩"], "examples": ["潔身自愛"]},
            {"char": "環", "similar_wrong": ["還", "壞"], "examples": ["充足的睡眠，是保持健康的重要一環。", "社會環境"]},
            {"char": "境", "similar_wrong": ["鏡", "竟"], "examples": ["環境清幽", "學無止境"]},
            {"char": "甚", "similar_wrong": ["其", "某"], "examples": ["你這種態度簡直是欺人太甚了！", "日甚一日", "我不但不了解這件事，甚至聽都沒聽過。"]},
            {"char": "至", "similar_wrong": ["致", "到"], "examples": ["由古至今"]},
            {"char": "懶", "similar_wrong": ["賴", "爛"], "examples": ["懶得理人"]},
            {"char": "梳", "similar_wrong": ["疏", "流"], "examples": []},
            {"char": "髒", "similar_wrong": ["臟", "藏"], "examples": ["他的房間又髒又亂。", "快到餐廳去吃，別髒了我的房間。"]},
            {"char": "臭", "similar_wrong": ["嗅", "奧"], "examples": ["無聲無臭", "遺臭萬年"]},
            {"char": "雜", "similar_wrong": ["維", "誰"], "examples": ["南北雜貨", "圖書室內有多種雜誌，可供讀者借閱"]},
            {"char": "調", "similar_wrong": ["週", "凋"], "examples": ["風調雨順", "調皮的孩子通常都很聰明。", "南腔北調"]},
            {"char": "叢", "similar_wrong": ["從", "欉"], "examples": []},
            {"char": "暢", "similar_wrong": ["腸", "場"], "examples": []},
            {"char": "格", "similar_wrong": ["絡", "閣"], "examples": ["格格不入", "感冒藥水每次喝一格，三餐飯後服用。", "那本書放在書架的第三格。"]},
            {"char": "言", "similar_wrong": ["信", "語"], "examples": ["難言之隱", "七言詩", "一家之言"]}
        ],
        "compounds": [
            {"word": "潔白", "examples": ["她穿了一身潔白的衣服，看起來像天女下凡。"]},
            {"word": "環境", "examples": ["社會環境、學習環境、居住環境"]},
            {"word": "甚至", "examples": ["他忙得甚至連吃飯時間都沒有。"]},
            {"word": "懶散", "examples": ["為了避免退休後日漸懶散，他決定投身社會的公益活動。"]},
            {"word": "雜亂", "examples": ["他日夜繁忙，疏於打理家務，屋內雜亂不堪。"]},
            {"word": "調和", "examples": ["他們倆人爭執不休，你還是居中調和調和吧！", "廚師善於調和五味，烹飪佳餚。"]},
            {"word": "雜草叢生", "examples": ["後院荒廢已久，處處雜草叢生。"]},
            {"word": "舒暢", "examples": ["身心舒暢"]},
            {"word": "格格不入", "examples": ["這幅西洋油畫掛在古色古香的大廳上，顯得格格不入。"]},
            {"word": "自言自語", "examples": ["只見他高興得手舞足蹈，自言自語，不知有什麼奇思妙想？"]}
        ],
    },
    2: {
        "title": "心動不如行動",
        "characters": [
            {"char": "川", "similar_wrong": ["州", "穿"], "examples": []},
            {"char": "缺", "similar_wrong": ["決", "快"], "examples": []},
            {"char": "窮", "similar_wrong": ["穹", "宮"], "examples": ["無窮無盡", "窮山惡水"]},
            {"char": "繼", "similar_wrong": ["績", "斷"], "examples": []},
            {"char": "研", "similar_wrong": ["形", "刑"], "examples": []},
            {"char": "既", "similar_wrong": ["即", "概"], "examples": ["既成事實", "既醉且飽"]},
            {"char": "租", "similar_wrong": ["祖", "組"], "examples": ["吉屋出租"]},
            {"char": "備", "similar_wrong": ["傭", "憊"], "examples": ["備嘗辛苦"]},
            {"char": "缽", "similar_wrong": ["砵", "鉢"], "examples": ["沿門托缽"]},
            {"char": "緣", "similar_wrong": ["綠", "線"], "examples": ["緣木求魚", "那位師父沿街化緣。"]},
            {"char": "達", "similar_wrong": ["逢", "遠"], "examples": ["直達車", "知書達禮"]},
            {"char": "慚", "similar_wrong": ["暫", "斬"], "examples": []},
            {"char": "愧", "similar_wrong": ["鬼", "魂"], "examples": []},
            {"char": "慮", "similar_wrong": ["慣", "濾"], "examples": []},
            {"char": "絆", "similar_wrong": ["伴", "拌"], "examples": []}
        ],
        "compounds": [
            {"word": "窮困", "examples": ["雖然家境清寒，生活窮困，他仍然勤奮向學。"]},
            {"word": "三餐不繼", "examples": ["他因生意失敗，導致全家三餐不繼。"]},
            {"word": "研讀", "examples": ["老師指導我們研讀課外書刊，以增廣知識。"]},
            {"word": "準備", "examples": ["明天的宴會我不準備參加了。", "事前有充分的準備，臨時才不會手忙腳亂。"]},
            {"word": "化緣", "examples": ["為籌措修繕古剎的經費，住持和尚到處化緣。"]},
            {"word": "到達", "examples": ["依目前的情形估計，我們大約下午三點鐘可到達目的地。"]},
            {"word": "慚愧", "examples": ["本人不才，竟能獲獎，真是慚愧！慚愧！", "他在發現自己做錯事後，感到十分慚愧後悔。"]},
            {"word": "顧慮", "examples": ["確立奮鬥目標後，即當放手去做，不必顧慮太多！"]},
            {"word": "絆腳石", "examples": ["猶豫是成功的絆腳石。"]}
        ],
    },
    3: {
        "title": "選拔動物之星",
        "characters": [
            {"char": "啟", "similar_wrong": ["取", "敢"], "examples": []},
            {"char": "宣", "similar_wrong": ["宜", "官"], "examples": []},
            {"char": "選", "similar_wrong": ["還", "遠"], "examples": []},
            {"char": "勤", "similar_wrong": ["動", "勉"], "examples": ["勤打掃"]},
            {"char": "健", "similar_wrong": ["建", "鍵"], "examples": ["老來多健忘"]},
            {"char": "厲", "similar_wrong": ["歷", "曆"], "examples": ["雷厲風行", "正言厲色"]},
            {"char": "蝸", "similar_wrong": ["渦", "鍋"], "examples": ["蝸牛走過的地方，會留下一道白色透明的黏液。"]},
            {"char": "寸", "similar_wrong": ["村", "吋"], "examples": ["方寸已亂"]},
            {"char": "駱", "similar_wrong": ["洛", "路"], "examples": []},
            {"char": "駝", "similar_wrong": ["陀", "馱"], "examples": ["彎腰駝背"]},
            {"char": "皺", "similar_wrong": ["鄒", "縐"], "examples": ["皺眉頭"]},
            {"char": "眉", "similar_wrong": ["媚", "屑"], "examples": ["眉清目秀", "幾經調查，案情終於有點眉目了。", "近在眉目之間"]},
            {"char": "艘", "similar_wrong": ["搜", "叟"], "examples": ["一艘船"]},
            {"char": "艇", "similar_wrong": ["廷", "挺"], "examples": []},
            {"char": "拭", "similar_wrong": ["試", "式"], "examples": []}
        ],
        "compounds": [
            {"word": "啟事", "examples": ["尋人啟事、道歉啟事、遺失啟事"]},
            {"word": "宣傳", "examples": ["他是這位名歌手的宣傳，幹練又有衝勁。", "這部影片的主角近日將隨片來臺，進行宣傳。"]},
            {"word": "選拔", "examples": ["他在這次歌唱選拔大賽中表現優異，從眾多參賽者中脫穎而出。"]},
            {"word": "勤奮", "examples": ["他工作勤奮，正一步步朝自己的理想前進。"]},
            {"word": "剛健", "examples": ["剛健中正、剛健篤實"]},
            {"word": "厲害", "examples": ["他的劍法非常厲害，一般人根本不是他的對手。", "他看了那幕驚險的鏡頭，心跳得很厲害。"]},
            {"word": "蝸牛", "examples": ["蝸牛走過的地方，會留下一道白色透明的黏液。　△篆愁君、水牛兒　◎"]},
            {"word": "駱駝", "examples": ["駱駝的胃裡有可儲水的小泡泡，所以牠可以好幾天不喝水。　△沙漠之舟　◎"]},
            {"word": "眉頭", "examples": ["他心情不佳，終日眉頭深鎖。"]},
            {"word": "遊艇", "examples": ["每逢假日，他喜歡和幾個朋友乘遊艇到外海垂釣。　◎"]},
            {"word": "拭目以待", "examples": ["他撰寫的新書即將出版，許多讀者都拭目以待。"]}
        ],
    },
    4: {
        "title": "米食飄香",
        "characters": [
            {"char": "稻", "similar_wrong": ["蹈", "陶"], "examples": []},
            {"char": "米", "similar_wrong": ["迷", "咪"], "examples": ["百米賽跑"]},
            {"char": "粒", "similar_wrong": ["位", "粗"], "examples": ["一粒砂子"]},
            {"char": "蘿", "similar_wrong": ["羅", "邏"], "examples": []},
            {"char": "蔔", "similar_wrong": ["卜", "撲"], "examples": []},
            {"char": "漿", "similar_wrong": ["獎", "將"], "examples": []},
            {"char": "蒸", "similar_wrong": ["丞", "拯"], "examples": ["蒸蒸日上"]},
            {"char": "鹹", "similar_wrong": ["減", "咸"], "examples": []},
            {"char": "財", "similar_wrong": ["材", "才"], "examples": []},
            {"char": "粿", "similar_wrong": ["裹", "果"], "examples": []},
            {"char": "艾", "similar_wrong": ["交", "叉"], "examples": ["方興未艾", "期期艾艾", "問題既然發生了，就應該力謀解決之道，一味自怨自艾是無濟於事的。"]},
            {"char": "康", "similar_wrong": ["庚", "糠"], "examples": ["康莊大道", "小康之家"]},
            {"char": "粽", "similar_wrong": ["棕", "蹤"], "examples": ["這家店賣的粽子很好吃。"]},
            {"char": "推", "similar_wrong": ["堆", "誰"], "examples": ["推陳出新"]},
            {"char": "陳", "similar_wrong": ["陣", "除"], "examples": []}
        ],
        "compounds": [
            {"word": "稻米", "examples": ["政府推出許多用稻米製作的點心食譜，以鼓勵國民多多食用。"]},
            {"word": "蘿蔔糕", "examples": ["過年時媽媽總會買塊蘿蔔糕，以討個好采頭。"]},
            {"word": "米漿", "examples": ["一杯米漿，一根油條，就是他多年來固定不變的早餐。"]},
            {"word": "發財", "examples": ["您最近在哪兒發財？", "他為了發財，不惜從事投機事業。"]},
            {"word": "艾草", "examples": []},
            {"word": "健康", "examples": ["健康就是人生最大的財富。"]},
            {"word": "粽子", "examples": []},
            {"word": "推陳出新", "examples": ["本公司的產品要不斷的推陳出新，以迎合顧客的需求。"]}
        ],
    },
    5: {
        "title": "讀書報告-藍色小洋裝",
        "characters": [
            {"char": "籍", "similar_wrong": ["藉", "借"], "examples": []},
            {"char": "繪", "similar_wrong": ["會", "檜"], "examples": ["繪影繪聲"]},
            {"char": "版", "similar_wrong": ["板", "販"], "examples": ["今天的報紙共有十六版。", "這本書已出至十二版。"]},
            {"char": "介", "similar_wrong": ["界", "芥"], "examples": ["一介不取", "一介書生"]},
            {"char": "峽", "similar_wrong": ["狹", "俠"], "examples": ["長江三峽", "臺灣海峽"]},
            {"char": "玉", "similar_wrong": ["王", "主"], "examples": ["錦衣玉食", "這件事多謝您的玉成。"]},
            {"char": "泣", "similar_wrong": ["位", "粒"], "examples": ["泣下如雨"]},
            {"char": "敏", "similar_wrong": ["每", "悔"], "examples": []},
            {"char": "癢", "similar_wrong": ["養", "氧"], "examples": ["那推銷員的三寸不爛之舌，說得她心癢癢的，差點就買了他介紹的產品。"]},
            {"char": "麥", "similar_wrong": ["來", "表"], "examples": []},
            {"char": "封", "similar_wrong": ["對", "討"], "examples": ["故步自封", "一封信"]},
            {"char": "淺", "similar_wrong": ["殘", "踐"], "examples": []},
            {"char": "查", "similar_wrong": ["察", "茶"], "examples": []},
            {"char": "酵", "similar_wrong": ["教", "孝"], "examples": []},
            {"char": "讚", "similar_wrong": ["贊", "暫"], "examples": []}
        ],
        "compounds": [
            {"word": "書籍", "examples": ["王教授將他生平珍愛的一些書籍捐贈給圖書館。"]},
            {"word": "出版", "examples": ["這位作家的新作即將出版，預約可享八折優待。"]},
            {"word": "簡介", "examples": ["一般國家公園多備有手冊，簡介園內的環境和歷史。"]},
            {"word": "哭泣", "examples": ["他個性堅強，遇到挫折從不哭泣。"]},
            {"word": "過敏", "examples": ["他一向神經過敏，別人的一句閒話就會使他煩惱半天。", "藥物過敏、花粉過敏"]},
            {"word": "發癢", "examples": ["她看見自己喜愛的物品卻無力購買時，心裡直發癢。", "他因皮膚過敏而全身發癢。"]},
            {"word": "麥芽糖", "examples": ["糖葫蘆外面裹著一層麥芽糖，甜甜的，是小孩子喜歡的零食。"]},
            {"word": "封面", "examples": ["這本書的封面設計很別緻。"]},
            {"word": "發酵", "examples": ["酵母菌行發酵作用時，可以將糖分解為酒精和二氧化碳。"]},
            {"word": "讚嘆", "examples": ["面對尼加拉瀑布的壯麗景觀，我不禁讚嘆大自然的奧妙神奇。"]}
        ],
    },
    6: {
        "title": "我愛鹿港",
        "characters": [
            {"char": "插", "similar_wrong": ["播", "抽"], "examples": ["兩肋插刀"]},
            {"char": "拌", "similar_wrong": ["伴", "絆"], "examples": ["這兩人拌嘴是司空見慣的。"]},
            {"char": "磚", "similar_wrong": ["轉", "傳"], "examples": []},
            {"char": "昂", "similar_wrong": ["卯", "印"], "examples": ["慷慨激昂"]},
            {"char": "繁", "similar_wrong": ["緊", "繫"], "examples": []},
            {"char": "葫", "similar_wrong": ["湖", "糊"], "examples": ["這葫蘆香包好可愛。"]},
            {"char": "蘆", "similar_wrong": ["盧", "爐"], "examples": []},
            {"char": "彎", "similar_wrong": ["灣", "戀"], "examples": []},
            {"char": "狹", "similar_wrong": ["峽", "陝"], "examples": []},
            {"char": "窄", "similar_wrong": ["炸", "作"], "examples": []},
            {"char": "喻", "similar_wrong": ["愉", "偷"], "examples": ["不言而喻"]},
            {"char": "曉", "similar_wrong": ["澆", "繞"], "examples": []},
            {"char": "井", "similar_wrong": ["阱", "丼"], "examples": ["井然有序", "市井小民"]},
            {"char": "芬", "similar_wrong": ["分", "紛"], "examples": ["含芳吐芬"]},
            {"char": "芳", "similar_wrong": ["方", "防"], "examples": ["流芳萬世", "芳心大動"]}
        ],
        "compounds": [
            {"word": "穿插", "examples": ["這部戰爭片穿插著淒美的愛情故事。", "在一大束紅玫瑰中穿插一些白色的滿天星，別具一番風貌。"]},
            {"word": "紅磚", "examples": ["我老家的房子，是用一塊塊的紅磚砌成的。"]},
            {"word": "昂貴", "examples": ["進口的名牌貨品價格都比較昂貴。"]},
            {"word": "繁榮", "examples": ["由於財經策略運用成功，臺灣經濟日益繁榮。"]},
            {"word": "葫蘆", "examples": ["爸爸將成熟的葫蘆晒乾後剖開挖空，製成水瓢。"]},
            {"word": "彎彎曲曲", "examples": ["這條山路彎彎曲曲，非常難走。"]},
            {"word": "狹窄", "examples": ["心地狹窄的人很難過著輕鬆快樂的生活。", "自從那條狹窄的外環道路拓寬後，塞車的狀況改善不少。"]},
            {"word": "家喻戶曉", "examples": ["她是家喻戶曉的大明星，因此一舉一動都格外引人注目。"]},
            {"word": "芬芳", "examples": ["他的人格高尚，德性芬芳，足以為人楷模。", "百花競吐芬芳。"]}
        ],
    },
    7: {
        "title": "未來的模樣",
        "characters": [
            {"char": "跡", "similar_wrong": ["蹟", "積"], "examples": []},
            {"char": "移", "similar_wrong": ["侈", "多"], "examples": []},
            {"char": "搭", "similar_wrong": ["答", "塔"], "examples": []},
            {"char": "輸", "similar_wrong": ["偷", "愉"], "examples": []},
            {"char": "鍵", "similar_wrong": ["健", "建"], "examples": []},
            {"char": "盤", "similar_wrong": ["般", "搬"], "examples": []},
            {"char": "饑", "similar_wrong": ["機", "肌"], "examples": []},
            {"char": "荒", "similar_wrong": ["慌", "謊"], "examples": []},
            {"char": "配", "similar_wrong": ["妃", "肥"], "examples": []},
            {"char": "均", "similar_wrong": ["句", "勻"], "examples": []},
            {"char": "遷", "similar_wrong": ["千", "韆"], "examples": []},
            {"char": "致", "similar_wrong": ["緻", "至"], "examples": []},
            {"char": "惡", "similar_wrong": ["壁", "亞"], "examples": []},
            {"char": "攜", "similar_wrong": ["擕", "纜"], "examples": []},
            {"char": "眨", "similar_wrong": ["貶", "乏"], "examples": []}
        ],
        "compounds": [
            {"word": "足跡", "examples": []},
            {"word": "移動", "examples": []},
            {"word": "傳輸", "examples": []},
            {"word": "鍵盤", "examples": []},
            {"word": "饑荒", "examples": []},
            {"word": "分配", "examples": []},
            {"word": "平均", "examples": []},
            {"word": "變遷", "examples": []},
            {"word": "導致", "examples": []},
            {"word": "惡化", "examples": []},
            {"word": "攜手", "examples": []}
        ],
    },
    8: {
        "title": "動物老師的智慧",
        "characters": [
            {"char": "眾", "similar_wrong": ["聚", "象"], "examples": []},
            {"char": "領", "similar_wrong": ["嶺", "零"], "examples": []},
            {"char": "獨", "similar_wrong": ["濁", "觸"], "examples": []},
            {"char": "厚", "similar_wrong": ["原", "后"], "examples": []},
            {"char": "蹼", "similar_wrong": ["撲", "鋪"], "examples": []},
            {"char": "趾", "similar_wrong": ["址", "止"], "examples": []},
            {"char": "膜", "similar_wrong": ["模", "漠"], "examples": []},
            {"char": "構", "similar_wrong": ["購", "溝"], "examples": []},
            {"char": "潛", "similar_wrong": ["淺", "替"], "examples": []},
            {"char": "易", "similar_wrong": ["場", "昜"], "examples": []},
            {"char": "壁", "similar_wrong": ["璧", "避"], "examples": []},
            {"char": "舉", "similar_wrong": ["與", "學"], "examples": []},
            {"char": "究", "similar_wrong": ["穿", "突"], "examples": []},
            {"char": "肢", "similar_wrong": ["技", "枝"], "examples": []},
            {"char": "絕", "similar_wrong": ["決", "缺"], "examples": []}
        ],
        "compounds": [
            {"word": "與眾不同", "examples": []},
            {"word": "看家本領", "examples": []},
            {"word": "得天獨厚", "examples": []},
            {"word": "腳趾", "examples": []},
            {"word": "構造", "examples": []},
            {"word": "輕易", "examples": []},
            {"word": "壁虎", "examples": []},
            {"word": "輕而易舉", "examples": []},
            {"word": "研究", "examples": []},
            {"word": "肢體", "examples": []},
            {"word": "身懷絕技", "examples": []}
        ],
    },
    9: {
        "title": "向太空出發",
        "characters": [
            {"char": "僅", "similar_wrong": ["謹", "堇"], "examples": []},
            {"char": "號", "similar_wrong": ["虎", "嚎"], "examples": []},
            {"char": "姆", "similar_wrong": ["母", "拇"], "examples": []},
            {"char": "斯", "similar_wrong": ["期", "其"], "examples": []},
            {"char": "仍", "similar_wrong": ["扔", "乃"], "examples": []},
            {"char": "津", "similar_wrong": ["律", "聿"], "examples": []},
            {"char": "嘗", "similar_wrong": ["常", "賞"], "examples": []},
            {"char": "試", "similar_wrong": ["拭", "式"], "examples": []},
            {"char": "測", "similar_wrong": ["側", "則"], "examples": []},
            {"char": "署", "similar_wrong": ["暑", "薯"], "examples": []},
            {"char": "億", "similar_wrong": ["憶", "意"], "examples": []},
            {"char": "翁", "similar_wrong": ["公", "甕"], "examples": []},
            {"char": "嚮", "similar_wrong": ["響", "鄉"], "examples": []},
            {"char": "引", "similar_wrong": ["弓", "印"], "examples": []},
            {"char": "催", "similar_wrong": ["摧", "崔"], "examples": []}
        ],
        "compounds": [
            {"word": "不僅", "examples": []},
            {"word": "阿姆斯壯", "examples": []},
            {"word": "津津樂道", "examples": []},
            {"word": "嘗試", "examples": []},
            {"word": "探測", "examples": []},
            {"word": "太空總署", "examples": []},
            {"word": "大富翁", "examples": ["他希望有朝一日能成為世界數一數二的(______)。"]},
            {"word": "嚮往", "examples": []},
            {"word": "吸引", "examples": []},
            {"word": "催生", "examples": []}
        ],
    },
    10: {
        "title": "小青蛙想看海",
        "characters": [
            {"char": "豪", "similar_wrong": ["毫", "壕"], "examples": []},
            {"char": "忽", "similar_wrong": ["勿", "物"], "examples": []},
            {"char": "瞧", "similar_wrong": ["憔", "焦"], "examples": []},
            {"char": "灘", "similar_wrong": ["攤", "難"], "examples": []},
            {"char": "苔", "similar_wrong": ["台", "胎"], "examples": []},
            {"char": "滾", "similar_wrong": ["袞", "混"], "examples": []},
            {"char": "禁", "similar_wrong": ["緊", "僅"], "examples": []},
            {"char": "際", "similar_wrong": ["祭", "察"], "examples": []},
            {"char": "廣", "similar_wrong": ["擴", "曠"], "examples": []},
            {"char": "丈", "similar_wrong": ["仗", "杖"], "examples": []},
            {"char": "災", "similar_wrong": ["炎", "灰"], "examples": []},
            {"char": "旱", "similar_wrong": ["早", "汗"], "examples": []},
            {"char": "耗", "similar_wrong": ["毛", "粍"], "examples": []},
            {"char": "遺", "similar_wrong": ["遣", "遮"], "examples": []},
            {"char": "憾", "similar_wrong": ["撼", "感"], "examples": []}
        ],
        "compounds": [
            {"word": "自豪", "examples": []},
            {"word": "忽然", "examples": []},
            {"word": "打滾", "examples": []},
            {"word": "禁不住", "examples": ["她的身子一向嬌弱，(______)這種變化無常的天氣。"]},
            {"word": "一望無際", "examples": []},
            {"word": "寬廣", "examples": []},
            {"word": "萬丈", "examples": ["(____)光芒"]},
            {"word": "水災", "examples": []},
            {"word": "旱災", "examples": []},
            {"word": "耗盡", "examples": []},
            {"word": "遺憾", "examples": []}
        ],
    },
    11: {
        "title": "窗前的月光",
        "characters": [
            {"char": "皎", "similar_wrong": ["校", "較"], "examples": []},
            {"char": "瘦", "similar_wrong": ["叟", "搜"], "examples": []},
            {"char": "嫦", "similar_wrong": ["常", "裳"], "examples": []},
            {"char": "娥", "similar_wrong": ["蛾", "鵝"], "examples": []},
            {"char": "搗", "similar_wrong": ["島", "倒"], "examples": []},
            {"char": "吳", "similar_wrong": ["呈", "吞"], "examples": []},
            {"char": "霜", "similar_wrong": ["雙", "箱"], "examples": []},
            {"char": "映", "similar_wrong": ["英", "央"], "examples": []},
            {"char": "勾", "similar_wrong": ["句", "釣"], "examples": []},
            {"char": "浮", "similar_wrong": ["符", "付"], "examples": []},
            {"char": "盞", "similar_wrong": ["淺", "棧"], "examples": []},
            {"char": "否", "similar_wrong": ["不", "杯"], "examples": []},
            {"char": "舊", "similar_wrong": ["舅", "臼"], "examples": []},
            {"char": "淚", "similar_wrong": ["類", "累"], "examples": []},
            {"char": "孤", "similar_wrong": ["弧", "狐"], "examples": []}
        ],
        "compounds": [
            {"word": "皎潔", "examples": []},
            {"word": "嫦娥", "examples": []},
            {"word": "吳剛", "examples": []},
            {"word": "冰霜", "examples": []},
            {"word": "映照", "examples": []},
            {"word": "浮現", "examples": []},
            {"word": "是否", "examples": []},
            {"word": "依舊", "examples": []},
            {"word": "淚水", "examples": []},
            {"word": "孤單", "examples": []}
        ],
    },
    12: {
        "title": "如來佛的手掌心",
        "characters": [
            {"char": "乖", "similar_wrong": ["乘", "刮"], "examples": []},
            {"char": "筋", "similar_wrong": ["斤", "勁"], "examples": []},
            {"char": "斗", "similar_wrong": ["抖", "升"], "examples": []},
            {"char": "箍", "similar_wrong": ["姑", "古"], "examples": []},
            {"char": "喚", "similar_wrong": ["換", "渙"], "examples": []},
            {"char": "掀", "similar_wrong": ["欣", "翻"], "examples": []},
            {"char": "修", "similar_wrong": ["休", "條"], "examples": []},
            {"char": "咒", "similar_wrong": ["呪", "兄"], "examples": []},
            {"char": "橘", "similar_wrong": ["菊", "局"], "examples": []},
            {"char": "擋", "similar_wrong": ["當", "黨"], "examples": []},
            {"char": "掏", "similar_wrong": ["淘", "陶"], "examples": []},
            {"char": "齊", "similar_wrong": ["濟", "劑"], "examples": []},
            {"char": "聖", "similar_wrong": ["怪", "聲"], "examples": []},
            {"char": "砰", "similar_wrong": ["碰", "坪"], "examples": []},
            {"char": "壓", "similar_wrong": ["押", "厭"], "examples": []}
        ],
        "compounds": [
            {"word": "乖乖", "examples": []},
            {"word": "筋斗雲", "examples": []},
            {"word": "金箍棒", "examples": []},
            {"word": "呼風喚雨", "examples": []},
            {"word": "掀翻", "examples": []},
            {"word": "修行", "examples": []},
            {"word": "咒語", "examples": []},
            {"word": "掏出", "examples": ["他(____)口袋中的糖果，分給大家吃。"]},
            {"word": "齊天大聖", "examples": []},
            {"word": "壓住", "examples": []}
        ],
    },
}

TOTAL_LESSONS = 12
SEMESTER_NAME = "114學年度第2學期"
GRADE = "四年級"
PUBLISHER = "康軒版"

# 期中考範圍：第1-6課，期末考範圍：第7-12課
MIDTERM_RANGE = (1, 6)
FINAL_RANGE = (7, 12)


def get_lessons_in_range(start: int, end: int) -> dict:
    """Get vocabulary data for a range of lessons."""
    return {k: v for k, v in VOCAB_DATA.items() if start <= k <= end}


def get_all_characters_in_range(start: int, end: int) -> list[dict]:
    """Get all characters for a range of lessons, with lesson info."""
    chars = []
    for lesson_num, lesson_data in VOCAB_DATA.items():
        if start <= lesson_num <= end:
            for c in lesson_data["characters"]:
                chars.append({
                    "char": c["char"],
                    "similar_wrong": c["similar_wrong"],
                    "examples": c.get("examples", []),
                    "lesson": lesson_num,
                    "lesson_title": lesson_data["title"],
                })
    return chars
