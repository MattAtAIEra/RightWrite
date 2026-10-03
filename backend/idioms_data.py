"""
一字千金 — 成語資料庫

每一筆成語包含：
- idiom:   正確的四字成語
- wrong:   可置換的錯別字清單，每一項是 (位置, 錯字)。位置從 0 開始。
           錯字取自台灣學生常見的同音字或形近字。
- meaning: 簡短解釋（結果畫面顯示用）

出題時隨機挑一個成語，再從 wrong 中隨機挑一組，把該位置的字換掉。
"""
from __future__ import annotations

import random

IDIOMS: list[dict] = [
    {"idiom": "一鳴驚人", "wrong": [(1, "嗚")], "meaning": "平時沒有特別表現，一下子做出讓人驚訝的成績。"},
    {"idiom": "再接再厲", "wrong": [(3, "勵")], "meaning": "一次又一次地繼續努力，不鬆懈。"},
    {"idiom": "按部就班", "wrong": [(1, "步")], "meaning": "按照一定的順序和步驟做事。"},
    {"idiom": "川流不息", "wrong": [(0, "穿")], "meaning": "像河水一樣不停地流動，形容人車很多。"},
    {"idiom": "一籌莫展", "wrong": [(1, "愁")], "meaning": "一點辦法也想不出來。"},
    {"idiom": "迫不及待", "wrong": [(2, "急")], "meaning": "急得不能再等待。"},
    {"idiom": "走投無路", "wrong": [(1, "頭")], "meaning": "無路可走，陷入絕境。"},
    {"idiom": "名列前茅", "wrong": [(3, "矛")], "meaning": "名次排在最前面。"},
    {"idiom": "黯然失色", "wrong": [(0, "暗")], "meaning": "相比之下顯得遜色許多。"},
    {"idiom": "一如既往", "wrong": [(2, "繼")], "meaning": "完全和過去一樣。"},
    {"idiom": "莫名其妙", "wrong": [(1, "明")], "meaning": "說不出其中的道理，讓人搞不懂。"},
    {"idiom": "自暴自棄", "wrong": [(1, "爆")], "meaning": "自己看輕自己，不求上進。"},
    {"idiom": "融會貫通", "wrong": [(1, "匯")], "meaning": "把各方面的知識融合起來，徹底理解。"},
    {"idiom": "事半功倍", "wrong": [(3, "備")], "meaning": "只用一半的力氣，卻得到加倍的效果。"},
    {"idiom": "絡繹不絕", "wrong": [(0, "落")], "meaning": "人或車馬前後相接，連續不斷。"},
    {"idiom": "相形見絀", "wrong": [(3, "拙")], "meaning": "互相比較之下，顯出不足。"},
    {"idiom": "一鼓作氣", "wrong": [(1, "股")], "meaning": "趁著勁頭大的時候一口氣把事情做完。"},
    {"idiom": "心無旁騖", "wrong": [(3, "鶩")], "meaning": "專心一意，不分心。"},
    {"idiom": "粗製濫造", "wrong": [(2, "爛")], "meaning": "做東西草率馬虎，只求數量不求品質。"},
    {"idiom": "不省人事", "wrong": [(1, "醒")], "meaning": "昏迷過去，失去知覺。"},
    {"idiom": "迥然不同", "wrong": [(0, "迴")], "meaning": "差別非常大，完全不一樣。"},
    {"idiom": "針鋒相對", "wrong": [(1, "峰")], "meaning": "雙方立場完全對立，互不相讓。"},
    {"idiom": "一帆風順", "wrong": [(1, "凡")], "meaning": "事情進行得非常順利。"},
    {"idiom": "一絲不苟", "wrong": [(1, "思")], "meaning": "做事認真細心，一點也不馬虎。"},
    {"idiom": "不可思議", "wrong": [(3, "義")], "meaning": "無法想像，難以理解。"},
    {"idiom": "全神貫注", "wrong": [(2, "灌")], "meaning": "全部精神集中在一件事上。"},
    {"idiom": "守株待兔", "wrong": [(1, "珠")], "meaning": "死守老方法，妄想不勞而獲。"},
    {"idiom": "畫蛇添足", "wrong": [(0, "劃")], "meaning": "多做了不必要的事，反而壞事。"},
    {"idiom": "井底之蛙", "wrong": [(1, "低")], "meaning": "見識狹小的人。"},
    {"idiom": "對牛彈琴", "wrong": [(2, "談")], "meaning": "對不懂道理的人講道理，白費力氣。"},
    {"idiom": "亡羊補牢", "wrong": [(2, "捕")], "meaning": "出了問題後趕快補救，還不算太晚。"},
    {"idiom": "掩耳盜鈴", "wrong": [(3, "玲")], "meaning": "自己騙自己，以為別人不知道。"},
    {"idiom": "拔苗助長", "wrong": [(1, "描")], "meaning": "急著求成，反而把事情弄壞。"},
    {"idiom": "自相矛盾", "wrong": [(2, "茅")], "meaning": "自己的言行前後互相衝突。"},
    {"idiom": "杯弓蛇影", "wrong": [(3, "景")], "meaning": "疑神疑鬼，自己嚇自己。"},
    {"idiom": "杞人憂天", "wrong": [(2, "優")], "meaning": "為不必要的事情擔心。"},
    {"idiom": "愚公移山", "wrong": [(0, "遇")], "meaning": "有恆心、有毅力，再難的事也能做成。"},
    {"idiom": "精衛填海", "wrong": [(2, "添")], "meaning": "意志堅定，不怕困難。"},
    {"idiom": "一舉兩得", "wrong": [(3, "德")], "meaning": "做一件事同時得到兩種好處。"},
    {"idiom": "半途而廢", "wrong": [(3, "費")], "meaning": "事情做到一半就放棄。"},
    {"idiom": "三心二意", "wrong": [(3, "義")], "meaning": "猶豫不決，不專心。"},
    {"idiom": "專心一致", "wrong": [(3, "至")], "meaning": "集中心思在一件事情上。"},
    {"idiom": "五顏六色", "wrong": [(1, "言")], "meaning": "顏色很多，非常繽紛。"},
    {"idiom": "千變萬化", "wrong": [(1, "便")], "meaning": "變化非常多。"},
    {"idiom": "日新月異", "wrong": [(3, "易")], "meaning": "每天每月都有新的變化和進步。"},
    {"idiom": "美不勝收", "wrong": [(2, "盛")], "meaning": "美好的東西太多，看不完。"},
    {"idiom": "興高采烈", "wrong": [(2, "彩")], "meaning": "興致高昂，情緒熱烈。"},
    {"idiom": "興致勃勃", "wrong": [(1, "緻")], "meaning": "興趣很濃厚的樣子。"},
    {"idiom": "隨心所欲", "wrong": [(3, "慾")], "meaning": "完全按照自己的心意去做。"},
    {"idiom": "無精打采", "wrong": [(3, "彩")], "meaning": "精神不好，提不起勁。"},
    {"idiom": "垂頭喪氣", "wrong": [(2, "桑")], "meaning": "失望沮喪、沒有精神的樣子。"},
    {"idiom": "氣喘如牛", "wrong": [(1, "穿")], "meaning": "呼吸急促，像牛一樣大聲喘氣。"},
    {"idiom": "汗流浹背", "wrong": [(2, "夾")], "meaning": "汗水流得濕透了背部。"},
    {"idiom": "目不轉睛", "wrong": [(3, "晴")], "meaning": "眼睛一直看著，不轉動，形容專注。"},
    {"idiom": "夜以繼日", "wrong": [(2, "既")], "meaning": "日夜不停地做事。"},
    {"idiom": "廢寢忘食", "wrong": [(1, "侵")], "meaning": "忘了睡覺和吃飯，非常專心。"},
    {"idiom": "聚精會神", "wrong": [(2, "匯")], "meaning": "集中全部精神。"},
    {"idiom": "身體力行", "wrong": [(2, "立")], "meaning": "親自去做，努力實行。"},
    {"idiom": "風和日麗", "wrong": [(3, "利")], "meaning": "天氣晴朗溫暖，微風舒適。"},
    {"idiom": "鳥語花香", "wrong": [(1, "雨")], "meaning": "鳥兒鳴叫，花兒芬芳，形容春天美景。"},
    {"idiom": "萬紫千紅", "wrong": [(1, "姿")], "meaning": "各種花朵盛開，色彩繽紛。"},
    {"idiom": "滿載而歸", "wrong": [(1, "戴")], "meaning": "裝得滿滿地回來，收穫豐富。"},
    {"idiom": "不計其數", "wrong": [(1, "記")], "meaning": "多到數不清。"},
    {"idiom": "層出不窮", "wrong": [(0, "曾")], "meaning": "接連不斷地出現。"},
    {"idiom": "不勝枚舉", "wrong": [(2, "玫")], "meaning": "太多了，無法一個一個列舉。"},
    {"idiom": "畢恭畢敬", "wrong": [(0, "必")], "meaning": "態度非常恭敬。"},
    {"idiom": "恍然大悟", "wrong": [(3, "誤")], "meaning": "忽然完全明白過來。"},
    {"idiom": "恰到好處", "wrong": [(0, "洽")], "meaning": "正好達到最適當的程度。"},
    {"idiom": "耳目一新", "wrong": [(3, "心")], "meaning": "聽到、看到的都變得新鮮有趣。"},
    {"idiom": "津津有味", "wrong": [(3, "未")], "meaning": "吃得很香，或對事情興趣濃厚。"},
    {"idiom": "爭先恐後", "wrong": [(3, "候")], "meaning": "搶著向前，怕落在後面。"},
    {"idiom": "大驚失色", "wrong": [(1, "警")], "meaning": "嚇得臉色都變了。"},
    {"idiom": "原形畢露", "wrong": [(2, "必")], "meaning": "本來的面目完全顯露出來。"},
    {"idiom": "言不由衷", "wrong": [(3, "中")], "meaning": "說的話不是出自真心。"},
    {"idiom": "大公無私", "wrong": [(3, "思")], "meaning": "處事公正，沒有私心。"},
    {"idiom": "一視同仁", "wrong": [(3, "人")], "meaning": "對所有人都同樣看待，不分厚薄。"},
    {"idiom": "眾志成城", "wrong": [(1, "至")], "meaning": "大家團結一致，力量像城牆一樣堅固。"},
    {"idiom": "和藹可親", "wrong": [(1, "靄")], "meaning": "態度溫和，容易親近。"},
    {"idiom": "無微不至", "wrong": [(3, "致")], "meaning": "照顧得非常周到細心。"},
    {"idiom": "深思熟慮", "wrong": [(1, "私")], "meaning": "反覆仔細地考慮。"},
    {"idiom": "應接不暇", "wrong": [(3, "瑕")], "meaning": "事情太多，來不及應付。"},
    {"idiom": "一塵不染", "wrong": [(1, "陳")], "meaning": "非常乾淨，一點灰塵也沒有。"},
    {"idiom": "無所適從", "wrong": [(2, "是")], "meaning": "不知道該聽誰的、該怎麼做。"},
    {"idiom": "心曠神怡", "wrong": [(3, "宜")], "meaning": "心情開朗，精神愉快。"},
    {"idiom": "悠然自得", "wrong": [(0, "優")], "meaning": "悠閒自在，心情舒暢。"},
    {"idiom": "得意忘形", "wrong": [(3, "型")], "meaning": "高興得失去常態。"},
    {"idiom": "得心應手", "wrong": [(1, "新")], "meaning": "做事順手，非常熟練。"},
    {"idiom": "一見如故", "wrong": [(3, "顧")], "meaning": "第一次見面就像老朋友一樣。"},
    {"idiom": "瓜熟蒂落", "wrong": [(2, "帝")], "meaning": "時機成熟，事情自然成功。"},
    {"idiom": "水落石出", "wrong": [(1, "洛")], "meaning": "事情的真相完全顯露出來。"},
    {"idiom": "隨機應變", "wrong": [(1, "即")], "meaning": "依照情況的變化靈活處理。"},
    {"idiom": "刻不容緩", "wrong": [(2, "溶")], "meaning": "情勢緊急，一刻也不能拖延。"},
    {"idiom": "不脛而走", "wrong": [(1, "徑")], "meaning": "消息沒有人傳卻很快傳開。"},
    {"idiom": "一諾千金", "wrong": [(1, "若")], "meaning": "說話守信用，承諾非常有價值。"},
    {"idiom": "開門見山", "wrong": [(2, "建")], "meaning": "說話或寫文章一開始就直接進入主題。"},
    {"idiom": "異口同聲", "wrong": [(0, "一")], "meaning": "大家說的話完全一樣。"},
    {"idiom": "虎頭蛇尾", "wrong": [(1, "投")], "meaning": "開始很有氣勢，後來卻草草結束。"},
    {"idiom": "狼吞虎嚥", "wrong": [(3, "燕")], "meaning": "吃東西又急又猛。"},
    {"idiom": "畫龍點睛", "wrong": [(3, "晴")], "meaning": "在關鍵處加上一筆，使整體更生動。"},
    {"idiom": "畫餅充飢", "wrong": [(2, "沖")], "meaning": "用空想來安慰自己。"},
    {"idiom": "望梅止渴", "wrong": [(2, "只")], "meaning": "用想像來安慰自己。"},
    {"idiom": "聞雞起舞", "wrong": [(0, "文")], "meaning": "有志氣的人及時奮發努力。"},
    {"idiom": "鐵杵成針", "wrong": [(3, "真")], "meaning": "只要有恆心，再難的事都能成功。"},
    {"idiom": "水滴石穿", "wrong": [(3, "川")], "meaning": "持之以恆，小力量也能成大事。"},
    {"idiom": "風平浪靜", "wrong": [(3, "淨")], "meaning": "沒有風浪，形容平靜無事。"},
    {"idiom": "晴空萬里", "wrong": [(0, "睛")], "meaning": "天空晴朗，一片雲也沒有。"},
    {"idiom": "一言九鼎", "wrong": [(3, "頂")], "meaning": "說話很有份量、很有影響力。"},
    {"idiom": "九牛一毛", "wrong": [(3, "矛")], "meaning": "極大數量中微不足道的一點。"},
    {"idiom": "百發百中", "wrong": [(1, "髮")], "meaning": "每一次都命中目標。"},
    {"idiom": "入木三分", "wrong": [(3, "份")], "meaning": "形容書法有力，或分析深刻。"},
    {"idiom": "聲東擊西", "wrong": [(2, "繫")], "meaning": "製造假象迷惑對方，攻其不備。"},
    {"idiom": "東張西望", "wrong": [(1, "漲")], "meaning": "四處張望。"},
    {"idiom": "不翼而飛", "wrong": [(1, "異")], "meaning": "東西突然不見了。"},
    {"idiom": "拾金不昧", "wrong": [(3, "味")], "meaning": "撿到錢財不私藏，交還失主。"},
    {"idiom": "樂不思蜀", "wrong": [(3, "屬")], "meaning": "快樂得忘了回家。"},
    {"idiom": "寧缺勿濫", "wrong": [(3, "爛")], "meaning": "寧可缺少，也不要隨便湊數。"},
    {"idiom": "功虧一簣", "wrong": [(3, "潰")], "meaning": "差最後一步而沒有成功。"},
    {"idiom": "鋌而走險", "wrong": [(0, "挺")], "meaning": "走投無路時採取冒險的行動。"},
    {"idiom": "肆無忌憚", "wrong": [(3, "彈")], "meaning": "放肆任意，毫無顧忌。"},
    {"idiom": "變本加厲", "wrong": [(3, "利")], "meaning": "比原來更加嚴重。"},
    {"idiom": "一蹶不振", "wrong": [(1, "厥")], "meaning": "跌倒後就再也站不起來，形容失敗後無法恢復。"},
    {"idiom": "披星戴月", "wrong": [(2, "載")], "meaning": "早出晚歸，非常辛勞。"},
    {"idiom": "鍥而不捨", "wrong": [(0, "契")], "meaning": "堅持不放棄。"},
    {"idiom": "魚目混珠", "wrong": [(2, "渾")], "meaning": "用假的東西冒充真的。"},
    {"idiom": "如火如荼", "wrong": [(3, "茶")], "meaning": "氣勢旺盛、熱烈。"},
    {"idiom": "誨人不倦", "wrong": [(0, "悔")], "meaning": "教導別人非常耐心，不覺得疲倦。"},
    {"idiom": "博覽群書", "wrong": [(0, "搏")], "meaning": "廣泛地閱讀各種書籍。"},
    {"idiom": "情不自禁", "wrong": [(3, "盡")], "meaning": "感情激動，控制不住自己。"},
    {"idiom": "歡欣鼓舞", "wrong": [(2, "股")], "meaning": "高興得手舞足蹈。"},
    {"idiom": "不知所措", "wrong": [(3, "錯")], "meaning": "不知道該怎麼辦。"},
    {"idiom": "無可奈何", "wrong": [(2, "耐")], "meaning": "沒有任何辦法。"},
    {"idiom": "眉開眼笑", "wrong": [(2, "演")], "meaning": "非常高興的樣子。"},
    {"idiom": "興味盎然", "wrong": [(2, "昂")], "meaning": "興趣濃厚的樣子。"},
    {"idiom": "心平氣和", "wrong": [(2, "汽")], "meaning": "心情平靜，態度溫和。"},
    {"idiom": "口是心非", "wrong": [(3, "飛")], "meaning": "嘴上說的和心裡想的不一樣。"},
    {"idiom": "唇亡齒寒", "wrong": [(1, "忘")], "meaning": "關係密切，利害相關。"},
    {"idiom": "坐井觀天", "wrong": [(2, "關")], "meaning": "眼界狹小，見識有限。"},
    {"idiom": "咫尺天涯", "wrong": [(3, "崖")], "meaning": "距離很近卻像隔得很遠。"},
    {"idiom": "螳臂當車", "wrong": [(2, "擋")], "meaning": "不自量力，做不可能辦到的事。"},
    {"idiom": "鬼斧神工", "wrong": [(1, "釜")], "meaning": "技藝精巧，像神仙做的一樣。"},
    {"idiom": "光陰似箭", "wrong": [(3, "劍")], "meaning": "時間過得非常快。"},
    {"idiom": "棋逢敵手", "wrong": [(1, "縫")], "meaning": "遇到實力相當的對手。"},
]


def all_characters() -> set[str]:
    """回傳所有會以書法字型顯示的字（正確字＋錯字），供字型子集化使用。"""
    chars: set[str] = set()
    for item in IDIOMS:
        chars.update(item["idiom"])
        for _, wrong_char in item["wrong"]:
            chars.add(wrong_char)
    return chars


def make_question(item: dict) -> dict:
    """把一筆成語資料變成一道題目：挑一組錯字置換進去。"""
    pos, wrong_char = random.choice(item["wrong"])
    idiom = item["idiom"]
    display = idiom[:pos] + wrong_char + idiom[pos + 1:]
    return {
        "idiom": idiom,
        "display": display,
        "wrong_index": pos,
        "wrong_char": wrong_char,
        "correct_char": idiom[pos],
        "meaning": item["meaning"],
    }


def pick_questions(count: int = 5) -> list[dict]:
    """隨機挑選 count 個不重複的成語並製成題目。"""
    chosen = random.sample(IDIOMS, min(count, len(IDIOMS)))
    return [make_question(item) for item in chosen]


def _validate() -> None:
    seen = set()
    for item in IDIOMS:
        idiom = item["idiom"]
        assert len(idiom) == 4, f"{idiom} 不是四個字"
        assert idiom not in seen, f"{idiom} 重複"
        seen.add(idiom)
        for pos, wrong_char in item["wrong"]:
            assert 0 <= pos < 4, f"{idiom} 位置錯誤 {pos}"
            assert len(wrong_char) == 1, f"{idiom} 錯字 {wrong_char} 不是單一字元"
            assert wrong_char != idiom[pos], f"{idiom} 位置 {pos} 的錯字與正確字相同"
            assert wrong_char not in idiom, f"{idiom} 的錯字 {wrong_char} 已出現在成語中"


_validate()
