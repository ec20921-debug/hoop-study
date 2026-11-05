// HOOP STUDY — 英検5級プログラムのデータ（2026-11-05 追加）
// 問題はすべてこのアプリのために新しく作ったもの。公式の過去問は転載しない（公式ページへのリンクだけ）
// 形式は公式の過去問で確認：筆記25問（大問1=15・大問2=5・大問3=5）／リスニング25問（第1部=10・第2部=5・第3部=10）／英文は2回放送

const EIKEN = {
  name: '英検5級',
  date: '2027-01-17',       // 本番の日
  goal: 0.8,                // アプリの中の目標（公式の合格点ではない。公式は正答数の目安を出していない）
  // 大問ごとの本番の問題数（予想スコアの計算に使う）
  counts: { r1: 15, r2: 5, r3: 5, l1: 10, l2: 5, l3: 10 },
  readingMin: 25,           // リーディングの本番の時間（分）
  listenAnswerSec: 10,      // 模試のリスニングで、放送のあと答える時間（秒）
  officialUrl: 'https://www.eiken.or.jp/eiken/exam/grade_5/',
  speed: 0.85,              // 読み上げの速さ
  reward: 'はま寿司',        // 合格のごほうび（2026-11-05 Daisuke 決定）。変えるならここだけ
};

// 大問の名前
const EK_PARTS = {
  w: { name: '単語', icon: '📖', long: '英検5級の単語', how: '意味をえらぶ。かんたんな単語は早く卒業できる' },
  r1: { name: '大問1 語句', icon: '✏️', long: '大問1：（　）に入る語をえらぶ', how: '本番は15問。単語と文法' },
  r2: { name: '大問2 会話', icon: '💬', long: '大問2：会話の（　）に入る文をえらぶ', how: '本番は5問。前後の話とつながる返事' },
  r3: { name: '大問3 並べかえ', icon: '🧩', long: '大問3：①〜④を並べかえる', how: '本番は5問。答えるのは「1番目と3番目」' },
  l1: { name: 'リスニング1 応答', icon: '🎧', long: 'リスニング第1部：絵を見て、返事をえらぶ', how: '本番は10問。返事は3つとも放送だけ（字は出ない）' },
  l2: { name: 'リスニング2 対話', icon: '👂', long: 'リスニング第2部：対話と質問を聞く', how: '本番は5問。答えは紙に書いてある4つから' },
  l3: { name: 'リスニング3 絵', icon: '🖼️', long: 'リスニング第3部：絵に合う文をえらぶ', how: '本番は10問。3つの文を聞いて、番号で答える' },
};

// 作戦（本番までの4段階）。menu：毎日のメニューの大問を順番に回す（苦手がはっきりしたら、ルーレットより苦手を優先する）
const EK_PHASES = [
  { id: 'base', title: '基礎練', until: '2026-11-30', text: '単語と大問1で土台づくり。リスニングは聞き取りに慣れる。', words: 12, read: ['r1', 'r1', 'r3', 'r1', 'r2'], listen: ['l3', 'l1', 'l3', 'l1', 'l2'] },
  { id: 'tactics', title: '戦術練習', until: '2026-12-24', text: '並べかえ・会話・リスニング3部。本番の形に慣れる。ミニ模試を2回。', words: 8, read: ['r2', 'r3', 'r1', 'r3', 'r2'], listen: ['l1', 'l2', 'l3', 'l2', 'l1'] },
  { id: 'games', title: '練習試合', until: '2027-01-10', text: '冬休みは本番模試と公式の過去問。時間を計って通しで解く。', words: 8, read: ['r1', 'r2', 'r3'], listen: ['l2', 'l1', 'l3'] },
  { id: 'final', title: '最終調整', until: '2027-01-16', text: 'まちがえた問題だけ。前の日は軽くして早く寝る。', words: 8, read: ['r1', 'r3', 'r2'], listen: ['l1', 'l3', 'l2'] },
];

// 模試の予定（from の日からホームと英検カップに「やろう」と出る。予定なので、遅れても大丈夫）
const EK_MOCKS = [
  { id: 'mini1', kind: 'mini', name: 'ミニ模試①', from: '2026-12-05' },
  { id: 'mini2', kind: 'mini', name: 'ミニ模試②', from: '2026-12-19' },
  { id: 'full1', kind: 'full', name: '本番模試①', from: '2026-12-26' },
  { id: 'full2', kind: 'full', name: '本番模試②', from: '2027-01-02' },
];
// ミニ模試の問題数（リーディング10問・リスニング10問）
const EK_MINI = { r1: 6, r2: 2, r3: 2, l1: 4, l2: 2, l3: 4 };
// 実力チェック（いちばん最初に1回。15問・約5分）
const EK_SCOUT = { w: 3, r1: 3, r2: 2, r3: 2, l1: 2, l2: 1, l3: 2 };
// 本番模試の専用問題（各リストの最後の分。ふだんのメニューには出さず、模試の点が暗記でふくらまないようにする）
const EK_MOCK_ONLY = { r1: 30, r2: 10, r3: 10, l1: 20, l2: 10, l3: 20 };
// おぼえ直しの間隔（箱の番号 → 次に出すまでの日数）。箱3以上で「おぼえた」
const EK_INTERVAL = [1, 3, 7, 14, 30];
const EK_MASTERED_BOX = 3;
// 単語の表示上の目標（本番までに「おぼえた」にしたい語数）
const EK_WORD_GOAL = 300;

// 当日のチェック（公式：一次試験はマークシート・HB の黒鉛筆かシャープペンシル・消しゴム。サインペンやボールペンは無効）
const EK_DAY_CHECKS = [
  { id: 'c1', label: '受験票・集合時間・持ち物を、学校や塾の案内で確かめた' },
  { id: 'c2', label: 'HB の黒えんぴつかシャープペンシルと、消しゴムを入れた（ボールペン・サインペンはダメ）' },
  { id: 'c3', label: 'マークシートのぬり方を確かめた（はみ出さない・消すときはきれいに）' },
  { id: 'c4', label: 'リーディング25分の使い方を決めた（迷ったら印をつけて先へ。最後に見直す）' },
  { id: 'c5', label: 'リスニングは2回読まれる。1回目で聞いて、2回目でたしかめる' },
  { id: 'c6', label: '大問3は「1番目と3番目」の組み合わせを答える。書きこんでから選ぶ' },
  { id: 'c7', label: '前の日は早くねる 🌙' },
];

// ---------- 単語（よく出そうな順のグループ。tier 1 → 2 の順に出す）[英語, 意味] ----------
const EK_WORD_GROUPS = [
  { id: 'verb1', tier: 1, w: [
    ['go', '行く'], ['come', '来る'], ['get', '手に入れる'], ['have', '持っている'], ['make', '作る'], ['take', '取る・持っていく'],
    ['use', '使う'], ['want', 'ほしい'], ['like', '好きだ'], ['know', '知っている'], ['see', '見える・会う'], ['look', '（目を向けて）見る'],
    ['watch', '（じっと）見る'], ['listen', '聞く'], ['speak', '話す'], ['read', '読む'], ['write', '書く'], ['study', '勉強する'],
    ['play', '（スポーツを）する・演奏する'], ['run', '走る'], ['walk', '歩く'], ['swim', '泳ぐ'], ['sing', '歌う'], ['cook', '料理する・料理人'],
    ['eat', '食べる'], ['drink', '飲む'], ['sleep', '眠る'], ['sit', 'すわる'], ['stand', '立つ'], ['open', '開ける'],
    ['close', '閉じる'], ['wash', '洗う'], ['clean', 'そうじする'], ['help', '手伝う'], ['live', '住む'], ['buy', '買う'],
  ] },
  { id: 'time', tier: 1, w: [
    ['Sunday', '日曜日'], ['Monday', '月曜日'], ['Tuesday', '火曜日'], ['Wednesday', '水曜日'], ['Thursday', '木曜日'], ['Friday', '金曜日'], ['Saturday', '土曜日'],
    ['January', '1月'], ['February', '2月'], ['March', '3月'], ['April', '4月'], ['May', '5月'], ['June', '6月'],
    ['July', '7月'], ['August', '8月'], ['September', '9月'], ['October', '10月'], ['November', '11月'], ['December', '12月'],
    ['morning', '朝'], ['afternoon', '午後'], ['evening', '夕方'], ['night', '夜'], ['today', '今日'], ['tomorrow', '明日'],
    ['week', '週'], ['month', '月（つき）'], ['year', '年'], ['hour', '1時間'], ['minute', '分（ふん）'], ['spring', '春'], ['summer', '夏'], ['fall', '秋'], ['winter', '冬'], ['season', '季節'], ['birthday', '誕生日'], ['time', '時間・時刻'],
  ] },
  { id: 'school', tier: 1, w: [
    ['school', '学校'], ['class', '授業・クラス'], ['classroom', '教室'], ['teacher', '先生'], ['student', '生徒'], ['desk', '机'],
    ['chair', 'いす'], ['book', '本'], ['notebook', 'ノート'], ['pen', 'ペン'], ['pencil', 'えんぴつ'], ['eraser', '消しゴム'], ['ruler', '定規'],
    ['bag', 'かばん'], ['homework', '宿題'], ['test', 'テスト'], ['question', '質問'], ['library', '図書館'], ['gym', '体育館'],
    ['subject', '教科'], ['math', '数学'], ['science', '理科'], ['English', '英語'], ['history', '歴史'], ['art', '美術'],
    ['music', '音楽'], ['song', '歌'], ['club', '部活・クラブ'], ['team', 'チーム'], ['word', '単語'], ['page', 'ページ'], ['story', '物語'],
    ['dictionary', '辞書'], ['computer', 'コンピューター'], ['picture', '絵・写真'], ['letter', '手紙'], ['name', '名前'], ['friend', '友だち'],
  ] },
  { id: 'family', tier: 1, w: [
    ['mother', '母'], ['father', '父'], ['sister', '姉・妹'], ['brother', '兄・弟'], ['parent', '親'], ['grandmother', '祖母'],
    ['grandfather', '祖父'], ['aunt', 'おば'], ['uncle', 'おじ'], ['son', '息子'], ['daughter', '娘'], ['baby', '赤ちゃん'],
    ['family', '家族'], ['boy', '男の子'], ['girl', '女の子'], ['man', '男の人'], ['woman', '女の人'], ['child', '子ども'],
    ['people', '人々'], ['doctor', '医者'], ['nurse', '看護師'], ['singer', '歌手'], ['player', '選手'],
  ] },
  { id: 'adj1', tier: 1, w: [
    ['big', '大きい'], ['small', '小さい'], ['long', '長い'], ['short', '短い・背が低い'], ['tall', '背が高い'], ['old', '古い・年をとった'],
    ['new', '新しい'], ['young', '若い'], ['good', 'よい'], ['bad', '悪い'], ['nice', 'すてきな'], ['happy', '幸せな'],
    ['sad', '悲しい'], ['sick', '病気の'], ['busy', 'いそがしい'], ['hungry', 'おなかがすいた'], ['thirsty', 'のどがかわいた'], ['tired', '疲れた'],
    ['hot', '暑い・熱い'], ['cold', '寒い・冷たい'], ['warm', 'あたたかい'], ['cool', 'すずしい'], ['fast', '速い'], ['slow', 'おそい・ゆっくりの'],
    ['easy', '簡単な'], ['difficult', '難しい'], ['high', '（山などが）高い'], ['beautiful', '美しい'], ['cute', 'かわいい'], ['favorite', 'いちばん好きな'],
    ['sunny', '晴れた'], ['rainy', '雨の'], ['cloudy', 'くもった'], ['snowy', '雪の'], ['windy', '風の強い'], ['kind', '親切な'],
  ] },
  { id: 'food', tier: 1, w: [
    ['breakfast', '朝食'], ['lunch', '昼食'], ['dinner', '夕食'], ['rice', 'ごはん・米'], ['bread', 'パン'], ['egg', 'たまご'],
    ['meat', '肉'], ['fish', '魚'], ['chicken', 'とり肉'], ['fruit', '果物'], ['apple', 'りんご'], ['orange', 'オレンジ'],
    ['banana', 'バナナ'], ['strawberry', 'いちご'], ['tomato', 'トマト'], ['potato', 'じゃがいも'], ['vegetable', '野菜'], ['salad', 'サラダ'],
    ['soup', 'スープ'], ['cake', 'ケーキ'], ['cookie', 'クッキー'], ['milk', '牛乳'], ['water', '水'], ['juice', 'ジュース'],
    ['food', '食べ物'], ['tea', 'お茶'], ['coffee', 'コーヒー'], ['sugar', '砂糖'], ['pizza', 'ピザ'], ['sandwich', 'サンドイッチ'], ['hamburger', 'ハンバーガー'],
  ] },
  { id: 'prep', tier: 1, w: [
    ['in', '〜の中に'], ['on', '〜の上に'], ['under', '〜の下に'], ['by', '〜のそばに・〜で'], ['with', '〜といっしょに'], ['for', '〜のために'],
    ['from', '〜から'], ['near', '〜の近くに'], ['after', '〜のあとに'], ['before', '〜の前に'], ['about', '〜について'], ['and', '〜と…'],
    ['but', 'しかし'], ['or', 'または'], ['very', 'とても'], ['too', '〜もまた・〜すぎる'], ['often', 'よく・しばしば'], ['always', 'いつも'],
    ['usually', 'ふつうは'], ['sometimes', 'ときどき'], ['every', '毎〜'], ['well', 'じょうずに'], ['here', 'ここに'], ['there', 'そこに'],
    ['now', '今'], ['together', 'いっしょに'], ['again', 'もう一度'], ['really', '本当に'],
  ] },
  { id: 'question', tier: 1, w: [
    ['what', '何'], ['who', 'だれ'], ['when', 'いつ'], ['where', 'どこ'], ['which', 'どちら'], ['whose', 'だれの'], ['why', 'なぜ'], ['how', 'どのように'],
  ] },
  { id: 'phrase', tier: 1, w: [
    ['get up', '起きる'], ['go to bed', '寝る'], ['look at', '〜を見る'], ['listen to', '〜を聞く'], ['sit down', 'すわる'], ['stand up', '立ち上がる'],
    ['come in', '入る'], ['a lot of', 'たくさんの'], ['at home', '家で'], ['after school', '放課後'], ['be good at', '〜が得意だ'], ['go home', '家に帰る'],
    ['take a picture', '写真をとる'], ['have lunch', '昼食を食べる'], ['in the morning', '朝に'], ['every day', '毎日'], ['How much', 'いくら'], ['How many', 'いくつ'],
    ['How old', '何歳'], ['See you.', 'またね。'], ['Thank you.', 'ありがとう。'], ['You\'re welcome.', 'どういたしまして。'], ['Excuse me.', 'すみません。'], ['I\'m sorry.', 'ごめんなさい。'],
  ] },
  { id: 'town', tier: 2, w: [
    ['town', '町'], ['city', '都市'], ['country', '国'], ['station', '駅'], ['bus', 'バス'], ['train', '電車'],
    ['car', '車'], ['bike', '自転車'], ['taxi', 'タクシー'], ['plane', '飛行機'], ['ship', '船'], ['shop', '店'],
    ['store', '店・ストア'], ['supermarket', 'スーパー'], ['bookstore', '本屋'], ['restaurant', 'レストラン'], ['hospital', '病院'], ['post office', '郵便局'],
    ['bank', '銀行'], ['museum', '博物館'], ['zoo', '動物園'], ['park', '公園'], ['beach', '海辺'], ['mountain', '山'],
    ['river', '川'], ['lake', '湖'], ['sea', '海'], ['street', '通り'], ['bridge', '橋'], ['tree', '木'],
    ['flower', '花'], ['star', '星'], ['moon', '月（空の）'], ['sky', '空'], ['rain', '雨'], ['snow', '雪'], ['weather', '天気'],
  ] },
  { id: 'home', tier: 2, w: [
    ['house', '家'], ['home', '家庭・家に'], ['room', '部屋'], ['kitchen', '台所'], ['bathroom', '浴室'], ['bedroom', '寝室'],
    ['living room', '居間'], ['door', 'ドア'], ['window', '窓'], ['table', 'テーブル'], ['bed', 'ベッド'], ['sofa', 'ソファ'],
    ['phone', '電話'], ['clock', '時計（置き時計・かけ時計）'], ['camera', 'カメラ'], ['box', '箱'], ['cup', 'カップ'],
    ['glass', 'コップ'], ['dish', '皿'], ['fork', 'フォーク'], ['spoon', 'スプーン'], ['knife', 'ナイフ'], ['key', 'かぎ'],
    ['garden', '庭'], ['wall', 'かべ'], ['towel', 'タオル'], ['radio', 'ラジオ'], ['piano', 'ピアノ'], ['guitar', 'ギター'], ['violin', 'バイオリン'],
  ] },
  { id: 'sport', tier: 2, w: [
    ['sport', 'スポーツ'], ['soccer', 'サッカー'], ['baseball', '野球'], ['basketball', 'バスケットボール'], ['tennis', 'テニス'], ['volleyball', 'バレーボール'],
    ['badminton', 'バドミントン'], ['game', '試合'], ['ball', 'ボール'], ['racket', 'ラケット'], ['bat', 'バット'], ['pool', 'プール'], ['practice', '練習する'], ['jump', '跳ぶ'], ['catch', '捕る'], ['throw', '投げる'], ['win', '勝つ'], ['ride', '乗る'],
  ] },
  { id: 'animal', tier: 2, w: [
    ['animal', '動物'], ['dog', '犬'], ['cat', 'ねこ'], ['bird', '鳥'], ['horse', '馬'], ['rabbit', 'うさぎ'],
    ['lion', 'ライオン'], ['tiger', 'トラ'], ['bear', 'クマ'], ['elephant', 'ゾウ'], ['monkey', 'サル'], ['panda', 'パンダ'],
    ['pig', 'ブタ'], ['cow', '牛'], ['mouse', 'ネズミ'], ['pet', 'ペット'],
  ] },
  { id: 'things', tier: 2, w: [
    ['shirt', 'シャツ'], ['skirt', 'スカート'], ['pants', 'ズボン'], ['shoes', 'くつ'], ['socks', 'くつ下'], ['hat', 'ぼうし（つばが一周）'],
    ['cap', 'ぼうし（つばが前だけ）'], ['coat', 'コート'], ['jacket', '上着'], ['sweater', 'セーター'], ['dress', 'ワンピース'], ['umbrella', 'かさ'],
    ['money', 'お金'], ['ticket', '切符・チケット'], ['present', 'プレゼント'], ['card', 'カード'], ['doll', '人形'], ['toy', 'おもちゃ'],
    ['red', '赤'], ['blue', '青'], ['yellow', '黄色'], ['green', '緑'], ['black', '黒'], ['white', '白'], ['brown', '茶色'], ['pink', 'ピンク'], ['purple', '紫'], ['color', '色'],
  ] },
  { id: 'verb2', tier: 2, w: [
    ['learn', '学ぶ'], ['teach', '教える'], ['think', '思う'], ['love', '大好きだ'], ['hear', '聞こえる'], ['talk', 'おしゃべりする'],
    ['say', '言う'], ['tell', '伝える'], ['dance', '踊る'], ['start', '始める'], ['stop', '止まる'], ['work', '働く'],
    ['drive', '運転する'], ['fly', '飛ぶ'], ['draw', '（線で）描く'], ['paint', '（絵の具で）描く'], ['visit', '訪ねる'], ['wait', '待つ'],
    ['meet', '会う（出会う）'], ['need', '必要とする'], ['give', '与える'], ['sell', '売る'], ['stay', '滞在する'], ['enjoy', '楽しむ'], ['find', '見つける'], ['ask', 'たずねる'],
  ] },
  { id: 'num', tier: 2, w: [
    ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5'], ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'], ['ten', '10'],
    ['eleven', '11'], ['twelve', '12'], ['thirteen', '13'], ['fourteen', '14'], ['fifteen', '15'], ['sixteen', '16'], ['seventeen', '17'], ['eighteen', '18'], ['nineteen', '19'], ['twenty', '20'], ['thirty', '30'],
    ['forty', '40'], ['fifty', '50'], ['sixty', '60'], ['seventy', '70'], ['eighty', '80'], ['ninety', '90'],
    ['hundred', '100'], ['first', '1番目の'], ['second', '2番目の'], ['third', '3番目の'],
  ] },
];

// 単語の選択肢に同時に出さない組（意味が近くて、どちらも正解に見えるもの）
const EK_NOT_TOGETHER = [
  ['shop', 'store'], ['house', 'home'], ['see', 'look', 'watch', 'meet'], ['speak', 'talk', 'say', 'tell'], ['listen', 'hear'], ['by', 'near'],
  ['tall', 'high'], ['cup', 'glass'], ['hat', 'cap'], ['study', 'learn'], ['draw', 'paint'], ['like', 'love'], ['town', 'city'], ['sea', 'beach'],
  ['small', 'short'], ['start', 'open'], ['stop', 'stay'], ['cold', 'cool'], ['hot', 'warm'], ['come in', 'go home'], ['sit', 'sit down'], ['stand', 'stand up'],
  ['look', 'look at'], ['listen', 'listen to'], ['pants', 'jacket'], ['clock', 'time', 'hour'], ['in the morning', 'morning'],
];

// ---------- 大問1：短文の語句空所補充 [文, [正解, まちがい×3], 日本語, ヒント] ----------
// 選択肢は表示の時にまぜる（最初に書いたものが正解）。最後の EK_MOCK_ONLY.r1 問は本番模試の専用
const EK_R1 = [
  // 単語：名詞
  ['My mother is in the (   ). She is cooking dinner.', ['kitchen', 'library', 'station', 'hospital'], '母は台所にいます。夕食を料理しています。', 'cook（料理する）がヒント。料理する場所は kitchen'],
  ['I read many books at the school (   ).', ['library', 'pool', 'kitchen', 'gym'], '私は学校の図書館でたくさんの本を読みます。', 'library＝図書館'],
  ['Ken has a new (   ). He rides it to school.', ['bike', 'desk', 'cake', 'song'], 'ケンは新しい自転車を持っています。それに乗って学校へ行きます。', 'ride（乗る）がヒント'],
  ['It is very cold today. Please wear your (   ).', ['coat', 'ruler', 'apple', 'notebook'], '今日はとても寒いです。コートを着てください。', 'wear＝着る。着るものは coat'],
  ['It\'s raining. Take your (   ).', ['umbrella', 'eraser', 'bread', 'piano'], '雨がふっています。かさを持っていきなさい。', 'rain＝雨。umbrella＝かさ'],
  ['A: What is your favorite (   )? B: I like spring.', ['season', 'sport', 'food', 'animal'], 'A：いちばん好きな季節は何？ B：春が好き。', 'spring（春）は season（季節）のひとつ'],
  ['December is the last (   ) of the year.', ['month', 'day', 'week', 'hour'], '12月は1年の最後の月です。', 'December＝12月 → month（月）'],
  ['Wednesday comes after (   ).', ['Tuesday', 'Thursday', 'Saturday', 'Friday'], '水曜日は火曜日のあとに来ます。', '月→火→水→木→金。after＝〜のあと'],
  ['A week has seven (   ).', ['days', 'months', 'years', 'hours'], '1週間は7日あります。', ''],
  ['My mother\'s mother is my (   ).', ['grandmother', 'sister', 'aunt', 'daughter'], '母の母は私の祖母です。', ''],
  ['My father\'s brother is my (   ).', ['uncle', 'aunt', 'son', 'grandmother'], '父の兄弟は私のおじです。', 'uncle＝おじ／aunt＝おば'],
  ['Lions and tigers are (   ).', ['animals', 'fruits', 'colors', 'sports'], 'ライオンとトラは動物です。', ''],
  ['Apples and oranges are (   ).', ['fruits', 'animals', 'subjects', 'months'], 'りんごとオレンジは果物です。', ''],
  ['I drink (   ) every morning.', ['milk', 'desks', 'windows', 'pencils'], '私は毎朝、牛乳を飲みます。', 'drink＝飲む。飲めるものを選ぶ'],
  ['We have math and science (   ) on Monday.', ['classes', 'chairs', 'clocks', 'doors'], '月曜日は数学と理科の授業があります。', 'class＝授業'],
  ['A: What is your (   )? B: It\'s Yuki Tanaka.', ['name', 'color', 'shop', 'bus'], 'A：お名前は？ B：田中ユキです。', ''],
  // 単語：動詞
  ['I (   ) to bed at ten every night.', ['go', 'eat', 'read', 'wash'], '私は毎晩10時に寝ます。', 'go to bed＝寝る。セットで覚えよう'],
  ['Please (   ) the door. It\'s cold.', ['close', 'eat', 'swim', 'sing'], 'ドアを閉めてください。寒いです。', ''],
  ['My sister can (   ) the piano very well.', ['play', 'drink', 'ride', 'open'], '姉はピアノをとてもじょうずにひけます。', 'play the piano＝ピアノをひく'],
  ['We (   ) English at school.', ['study', 'eat', 'sleep', 'swim'], '私たちは学校で英語を勉強します。', ''],
  ['Mr. Tanaka (   ) math at our school.', ['teaches', 'eats', 'drinks', 'rides'], '田中先生は私たちの学校で数学を教えています。', 'teach＝教える。主語が I・you 以外の1人なので s がつく（ch の後は es）'],
  ['I want to (   ) a new bag. How much is this one?', ['buy', 'drink', 'sing', 'swim'], '新しいかばんを買いたいです。これはいくらですか。', 'How much（いくら）がヒント'],
  ['Let\'s (   ) a picture here.', ['take', 'eat', 'go', 'drink'], 'ここで写真をとろう。', 'take a picture＝写真をとる'],
  ['I (   ) my grandmother every Sunday.', ['visit', 'drink', 'open', 'close'], '私は毎週日曜日に祖母を訪ねます。', 'visit＝訪ねる'],
  ['My brother (   ) his car on Sundays.', ['washes', 'drinks', 'sings', 'sleeps'], '兄は日曜日に車を洗います。', 'wash＝洗う。sh の後は es'],
  ['(   ) down, please.', ['Sit', 'Eat', 'Drink', 'Read'], 'どうぞすわってください。', 'sit down＝すわる'],
  ['Please get (   ). It\'s seven o\'clock.', ['up', 'of', 'at', 'to'], '起きなさい。7時ですよ。', 'get up＝起きる'],
  ['I (   ) to music in my room.', ['listen', 'look', 'watch', 'see'], '私は部屋で音楽を聞きます。', 'listen to ＋音楽'],
  ['We (   ) TV after dinner.', ['watch', 'listen', 'go', 'come'], '私たちは夕食のあとテレビを見ます。', 'watch TV＝テレビを見る'],
  ['Can you (   ) Japanese?', ['speak', 'eat', 'drink', 'go'], 'あなたは日本語を話せますか。', ''],
  // 単語：形容詞・副詞
  ['This bag is too (   ). I want a small one.', ['big', 'young', 'hungry', 'sunny'], 'このかばんは大きすぎます。小さいのがほしいです。', 'small の反対は big'],
  ['I\'m (   ). Let\'s eat lunch.', ['hungry', 'tall', 'new', 'rainy'], 'おなかがすいた。お昼を食べよう。', ''],
  ['My grandfather is eighty years (   ).', ['old', 'tall', 'long', 'high'], '祖父は80歳です。', '〜 years old＝〜歳'],
  ['This river is very (   ).', ['long', 'hungry', 'young', 'busy'], 'この川はとても長いです。', ''],
  ['Mt. Fuji is very (   ).', ['high', 'hungry', 'young', 'sad'], '富士山はとても高いです。', '山の高さは high（人の背は tall）'],
  ['Yuki can run very (   ).', ['fast', 'tall', 'new', 'old'], 'ユキはとても速く走れます。', ''],
  ['The test is very (   ). I can\'t answer the questions.', ['difficult', 'easy', 'cute', 'hungry'], 'テストはとても難しいです。問題に答えられません。', ''],
  ['A: How is the weather? B: It\'s (   ).', ['sunny', 'hungry', 'tall', 'old'], 'A：天気はどう？ B：晴れだよ。', 'weather（天気）に合う語'],
  ['That\'s my (   ) song. I listen to it every day.', ['favorite', 'tall', 'hungry', 'sick'], 'あれは私のいちばん好きな歌です。毎日聞きます。', ''],
  ['Emi speaks English very (   ).', ['well', 'good', 'nice', 'fine'], 'エミは英語をとてもじょうずに話します。', '動詞（speak）を説明するのは well'],
  // 前置詞
  ['Our school starts (   ) 8:30.', ['at', 'in', 'on', 'of'], '学校は8時30分に始まります。', '時刻は at'],
  ['I play tennis (   ) Sundays.', ['on', 'at', 'in', 'of'], '私は日曜日にテニスをします。', '曜日は on'],
  ['My birthday is (   ) July.', ['in', 'on', 'at', 'of'], '私の誕生日は7月です。', '月は in'],
  ['I go to school (   ) bus.', ['by', 'on', 'at', 'of'], '私はバスで学校へ行きます。', '乗り物は by bus・by bike'],
  ['The picture is (   ) the wall.', ['on', 'at', 'from', 'to'], 'その絵はかべにかかっています。', 'on はくっついている感じ'],
  ['I\'m (   ) Canada.', ['from', 'of', 'to', 'at'], '私はカナダの出身です。', 'be from ＝〜の出身'],
  ['I play soccer (   ) my friends.', ['with', 'of', 'at', 'on'], '私は友だちとサッカーをします。', 'with＝〜といっしょに'],
  ['This present is (   ) you.', ['for', 'of', 'at', 'in'], 'このプレゼントはあなたへのものです。', 'for＝〜のために'],
  ['Let\'s go (   ) the park.', ['to', 'of', 'at', 'on'], '公園へ行こう。', 'go to ＋場所'],
  ['Emi lives (   ) Tokyo.', ['in', 'on', 'of', 'to'], 'エミは東京に住んでいます。', ''],
  ['This is a picture (   ) my family.', ['of', 'at', 'on', 'to'], 'これは私の家族の写真です。', 'of＝〜の'],
  ['Let\'s talk (   ) our club.', ['about', 'from', 'by', 'under'], '私たちの部活について話そう。', 'about＝〜について'],
  // 文法：be 動詞
  ['I (   ) a junior high school student.', ['am', 'is', 'are', 'be'], '私は中学生です。', 'I のときは am'],
  ['Tom and I (   ) good friends.', ['are', 'am', 'is', 'be'], 'トムと私はいい友だちです。', '2人以上は are'],
  ['(   ) you a basketball player?', ['Are', 'Is', 'Am', 'Do'], 'あなたはバスケットボールの選手ですか。', 'player（名詞）なので be 動詞。you は are'],
  ['My parents (   ) at home now.', ['are', 'is', 'am', 'be'], '両親は今、家にいます。', 'parents は複数'],
  ['A: Is Mr. Smith your teacher? B: Yes, he (   ).', ['is', 'does', 'am', 'are'], 'A：スミスさんはあなたの先生ですか。 B：はい、そうです。', 'Is で聞かれたら is で答える'],
  ['A: Are you busy now? B: No, I\'m (   ).', ['not', 'no', 'do', 'am'], 'A：今いそがしい？ B：いいえ、いそがしくありません。', "I'm not"],
  // 文法：do / does
  ['(   ) your sister play the piano?', ['Does', 'Do', 'Is', 'Are'], 'お姉さんはピアノをひきますか。', '主語が I・you 以外の1人（your sister）で play があるので Does'],
  ['A: Do you have a pet? B: Yes, I (   ).', ['do', 'am', 'is', 'are'], 'A：ペットを飼っている？ B：はい、飼っています。', 'Do で聞かれたら do で答える'],
  ['A: Does Mike like sushi? B: No, he (   ).', ['doesn\'t', 'don\'t', 'isn\'t', 'aren\'t'], 'A：マイクはおすしが好き？ B：いいえ、好きではありません。', 'Does で聞かれたら doesn\'t'],
  ['I (   ) have a brother.', ['don\'t', 'not', 'am', 'isn\'t'], '私には兄弟がいません。', '一般動詞の否定は don\'t'],
  ['My father (   ) drink coffee.', ['doesn\'t', 'don\'t', 'isn\'t', 'aren\'t'], '父はコーヒーを飲みません。', '主語が I・you 以外の1人（My father）は doesn\'t'],
  ['Aya (   ) tennis after school.', ['plays', 'play', 'playing', 'to play'], 'アヤは放課後にテニスをします。', '主語が I・you 以外の1人で今のこと → s をつける（3単現）'],
  ['My brother (   ) math very much.', ['likes', 'like', 'liking', 'to like'], '兄は数学がとても好きです。', '3単現の s'],
  ['He (   ) to school by bike.', ['goes', 'go', 'going', 'to go'], '彼は自転車で学校へ行きます。', 'go → goes（o で終わる語は es）'],
  ['She (   ) English very hard.', ['studies', 'study', 'studys', 'studying'], '彼女はとても一生けんめい英語を勉強します。', '子音＋y は y を i にかえて es'],
  ['Mr. Brown (   ) a big dog.', ['has', 'have', 'having', 'is'], 'ブラウンさんは大きな犬を飼っています。', 'have の3単現は has'],
  // 文法：can
  ['I can (   ) fast.', ['run', 'runs', 'running', 'to run'], '私は速く走れます。', 'can の後ろは動詞の原形（そのままの形）'],
  ['(   ) you swim?', ['Can', 'Are', 'Is', 'Am'], 'あなたは泳げますか。', ''],
  ['A: Can your sister ride a bike? B: Yes, she (   ).', ['can', 'is', 'does', 'do'], 'A：妹さんは自転車に乗れる？ B：はい、乗れます。', 'Can で聞かれたら can で答える'],
  // 文法：進行形
  ['I am (   ) lunch now.', ['eating', 'eat', 'eats', 'to eat'], '私は今、昼ごはんを食べています。', 'am ＋ ing'],
  ['Look! The children are (   ) in the park.', ['running', 'run', 'runs', 'to run'], '見て！ 子どもたちが公園で走っています。', 'run は n を重ねて running'],
  ['My mother (   ) cooking now.', ['is', 'are', 'am', 'be'], '母は今、料理をしています。', ''],
  ['A: What are you doing? B: I\'m (   ) a letter.', ['writing', 'write', 'writes', 'to write'], 'A：何をしているの？ B：手紙を書いています。', 'write は e をとって writing'],
];
// 文法の続き＋本番模試の専用問題は下で足す（大きいので分けて書く）
EK_R1.push(
  ['Yumi is (   ) in the pool.', ['swimming', 'swim', 'swims', 'to swim'], 'ユミはプールで泳いでいます。', 'swim は m を重ねて swimming'],
  ['A: Are you studying? B: Yes, I (   ).', ['am', 'do', 'is', 'are'], 'A：勉強しているの？ B：はい、しています。', 'Are you 〜? には I am で答える'],
  // 文法：命令文
  ['Let\'s (   ) soccer.', ['play', 'plays', 'playing', 'to play'], 'サッカーをしよう。', 'Let\'s の後ろは動詞の原形'],
  ['Please don\'t (   ) in the classroom.', ['run', 'runs', 'running', 'to run'], '教室で走らないでください。', ''],
  ['(   ) open the window. It\'s cold.', ['Don\'t', 'Not', 'Doesn\'t', 'Isn\'t'], '窓を開けないで。寒いよ。', '「〜しないで」は Don\'t ＋動詞'],
  ['(   ) quiet in the library.', ['Be', 'Is', 'Are', 'Am'], '図書館では静かにしなさい。', 'quiet は様子を表す語。命令文は Be で始める'],
  // 文法：疑問詞
  ['(   ) do you live? I live in Chiba.', ['Where', 'What', 'Who', 'When'], 'どこに住んでいますか。千葉です。', '場所を答えているので Where'],
  ['(   ) is your birthday? It\'s May 5.', ['When', 'Where', 'Who', 'Which'], '誕生日はいつですか。5月5日です。', '日付を答えているので When'],
  ['(   ) is that boy? He\'s my brother.', ['Who', 'What', 'Where', 'When'], 'あの男の子はだれ？ 私の弟です。', '人を聞く時は Who'],
  ['(   ) bag is this? It\'s Tom\'s.', ['Whose', 'Who', 'Where', 'When'], 'これはだれのかばん？ トムのです。', 'Whose ＋名詞＝だれの〜'],
  ['(   ) old is your brother?', ['How', 'What', 'Who', 'When'], 'お兄さんは何歳ですか。', 'How old＝何歳'],
  ['How (   ) pens do you have?', ['many', 'much', 'old', 'long'], 'ペンを何本持っていますか。', '数を聞く時は How many ＋複数形'],
  ['How (   ) is this hat? It\'s 2,000 yen.', ['much', 'many', 'old', 'tall'], 'このぼうしはいくらですか。2,000円です。', '値段は How much'],
  ['(   ) time do you get up?', ['What', 'Who', 'Where', 'How'], '何時に起きますか。', 'What time＝何時'],
  ['(   ) do you go to school? By bus.', ['How', 'What', 'Who', 'Whose'], 'どうやって学校へ行きますか。バスで。', '方法を聞く時は How'],
  ['(   ) do you want, rice or bread?', ['Which', 'Who', 'Where', 'When'], 'ごはんとパン、どちらがほしいですか。', 'A or B から選ぶ時は Which'],
  ['What (   ) you doing?', ['are', 'do', 'is', 'am'], '何をしているの？', 'doing があるので be 動詞（進行形）'],
  ['What (   ) your sister do on Sundays?', ['does', 'do', 'is', 'are'], 'お姉さんは日曜日に何をしますか。', '主語が I・you 以外の1人なので does'],
  // 文法：代名詞
  ['This is my friend. (   ) name is Emi.', ['Her', 'She', 'Hers', 'Him'], 'こちらは私の友だちです。彼女の名前はエミです。', '「〜の」は her'],
  ['That boy is Ken. I know (   ).', ['him', 'he', 'his', 'she'], 'あの男の子はケンです。私は彼を知っています。', '「〜を」は him'],
  ['These are my parents. I love (   ).', ['them', 'they', 'their', 'we'], 'こちらは私の両親です。大好きです。', '「〜を」は them'],
  ['Is this (   ) bag, Mary?', ['your', 'you', 'yours', 'she'], 'メアリー、これはあなたのかばん？', '後ろに名詞があるので your'],
  ['A: Whose pen is this? B: It\'s (   ).', ['mine', 'my', 'me', 'I'], 'A：これはだれのペン？ B：私のです。', '「私のもの」は mine'],
  ['We have a dog. (   ) name is Pochi.', ['Its', 'It', 'They', 'Them'], '犬を飼っています。その名前はポチです。', '「それの」は its'],
  ['Mike and I are in the tennis club. (   ) practice every day.', ['We', 'He', 'She', 'Our'], 'マイクと私はテニス部です。私たちは毎日練習します。', 'Mike and I ＝ We'],
  // 文法：名詞の形
  ['I have two (   ).', ['brothers', 'brother', 'a brother', 'brother\'s'], '私には兄弟が2人います。', '2つ以上は複数形'],
  ['These (   ) are very nice.', ['dishes', 'dish', 'dishs', 'a dish'], 'これらのお皿はとてもすてきです。', 'sh の後は es'],
  ['I have (   ) orange.', ['an', 'a', 'two', 'many'], '私はオレンジを1つ持っています。', '母音で始まる語の前は an'],
  ['This is (   ) old book.', ['an', 'a', 'two', 'these'], 'これは古い本です。', 'old は母音で始まるので an'],
  ['I like (   ). They are cute.', ['cats', 'cat', 'a cat', 'the cat'], '私はねこが好きです。かわいいです。', '「〜が好き」は複数形。They ともつながる'],
  // ===== ここから本番模試の専用（ふだんのメニューには出さない） =====
  // 本番模試①
  ['My father works at a (   ). He is a doctor.', ['hospital', 'zoo', 'pool', 'bookstore'], '父は病院で働いています。医者です。', 'doctor＝医者'],
  ['A: What (   ) is it today? B: It\'s Tuesday.', ['day', 'time', 'color', 'sport'], 'A：今日は何曜日？ B：火曜日です。', 'What day＝何曜日'],
  ['Please (   ) your name here.', ['write', 'drink', 'swim', 'sleep'], 'ここに名前を書いてください。', ''],
  ['It\'s (   ) in winter here. We often have snow.', ['cold', 'hungry', 'young', 'long'], 'ここは冬は寒いです。よく雪がふります。', ''],
  ['We have a test (   ) Friday.', ['on', 'at', 'of', 'to'], '金曜日にテストがあります。', '曜日は on'],
  ['Tom and Lisa (   ) in the same class.', ['are', 'is', 'am', 'be'], 'トムとリサは同じクラスです。', '2人なので are'],
  ['(   ) your father drive a car?', ['Does', 'Do', 'Is', 'Are'], 'お父さんは車を運転しますか。', ''],
  ['My sister (   ) to the library on Saturdays.', ['goes', 'go', 'going', 'to go'], '姉は土曜日に図書館へ行きます。', '3単現'],
  ['She can (   ) very well.', ['sing', 'sings', 'singing', 'to sing'], '彼女はとてもじょうずに歌えます。', 'can ＋原形'],
  ['Look at that man. He is (   ) a bike.', ['riding', 'ride', 'rides', 'to ride'], 'あの男の人を見て。自転車に乗っています。', 'ride は e をとって riding'],
  ['(   ) is your bag? It\'s on the chair.', ['Where', 'Who', 'When', 'Whose'], 'かばんはどこ？ いすの上です。', ''],
  ['How (   ) dogs does Ken have?', ['many', 'much', 'old', 'tall'], 'ケンは犬を何匹飼っていますか。', ''],
  ['That is Ms. Hill. Do you know (   )?', ['her', 'she', 'hers', 'he'], 'あちらはヒルさんです。彼女を知っていますか。', '「〜を」は her'],
  ['I have three (   ) in my bag.', ['books', 'book', 'a book', 'book\'s'], 'かばんに本が3冊あります。', ''],
  ['We (   ) lunch at twelve thirty.', ['have', 'go', 'come', 'sit'], '私たちは12時30分に昼食を食べます。', 'have lunch＝昼食を食べる'],
  // 本番模試②
  ['I want to be a (   ). I like cooking very much.', ['cook', 'doctor', 'teacher', 'singer'], '私は料理人になりたいです。料理が大好きです。', ''],
  ['A: What (   ) do you like? B: I like blue.', ['color', 'sport', 'food', 'month'], 'A：何色が好き？ B：青が好き。', 'blue は color'],
  ['We can see many animals at the (   ).', ['zoo', 'bank', 'library', 'post office'], '動物園ではたくさんの動物が見られます。', ''],
  ['Please (   ) at this picture.', ['look', 'see', 'watch', 'read'], 'この写真を見てください。', 'look at＝〜を見る'],
  ['I\'m (   ). I want some water.', ['thirsty', 'tall', 'cute', 'old'], 'のどがかわきました。水がほしいです。', ''],
  ['My grandmother (   ) in Osaka.', ['lives', 'live', 'living', 'to live'], '祖母は大阪に住んでいます。', '3単現'],
  ['The bookstore is (   ) the station.', ['near', 'of', 'to', 'from'], '本屋は駅の近くにあります。', 'near＝〜の近く'],
  ['I get up at six (   ) the morning.', ['in', 'on', 'at', 'of'], '私は朝6時に起きます。', 'in the morning'],
  ['A: Are those your shoes? B: No, they (   ).', ['aren\'t', 'isn\'t', 'don\'t', 'doesn\'t'], 'A：あれはあなたのくつ？ B：いいえ、ちがいます。', 'Are で聞かれたら aren\'t'],
  ['Ken doesn\'t (   ) soccer.', ['play', 'plays', 'playing', 'to play'], 'ケンはサッカーをしません。', 'doesn\'t ＋原形'],
  ['Be careful! Don\'t (   ) here.', ['swim', 'swims', 'swimming', 'to swim'], '気をつけて！ ここで泳いではいけません。', 'Don\'t ＋原形'],
  ['A: (   ) sport do you like? B: I like volleyball.', ['What', 'Who', 'Where', 'When'], 'A：何のスポーツが好き？ B：バレーボールが好き。', 'What ＋名詞'],
  ['A: What is Emi doing? B: She is (   ) to music.', ['listening', 'listen', 'listens', 'to listen'], 'A：エミは何をしている？ B：音楽を聞いています。', 'is ＋ ing'],
  ['This cap is (   ). It\'s not your cap.', ['mine', 'my', 'me', 'I'], 'このぼうしは私のです。あなたのではありません。', '「私のもの」は mine'],
  ['Those (   ) are from Australia.', ['koalas', 'koala', 'a koala', 'koala\'s'], 'あのコアラたちはオーストラリアから来ました。', 'those の後ろは複数形'],
);

// ---------- 大問2：会話文の文空所補充 [[[話し手, 文], [話し手, 文]], [正解, まちがい×3], 日本語, ヒント] ----------
const EK_R2 = [
  [[['Boy', 'What are you eating, Lisa?'], ['Girl', '(   ) It\'s very good.']], ['A cookie.', 'At home.', 'On Sunday.', 'My brother.'], '男の子：リサ、何を食べているの？ 女の子：クッキーだよ。とてもおいしいよ。', 'What（何）に答える'],
  [[['Teacher', 'Is this your notebook, Taro?'], ['Student', '(   ) Thank you, Ms. Green.']], ['Yes, it is.', 'No, I can\'t.', 'I\'m fine.', 'It\'s a pen.'], '先生：タロウ、これはあなたのノート？ 生徒：はい、そうです。ありがとうございます、グリーン先生。', 'Is this に Yes, it is'],
  [[['Girl', 'Do you like dogs, Ben?'], ['Boy', '(   ) I have two.']], ['Yes, I do.', 'No, it isn\'t.', 'I\'m eleven.', 'Here you are.'], '女の子：ベン、犬は好き？ 男の子：うん、好きだよ。2匹飼っているんだ。', ''],
  [[['Mother', 'It\'s time for dinner, Kate.'], ['Girl', '(   )']], ['OK, Mom.', 'You\'re welcome, Mom.', 'I\'m sorry, Dad.', 'Nice to meet you.'], '母：ケイト、夕ごはんの時間よ。 女の子：はーい、お母さん。', ''],
  [[['Boy', 'How do you go to school?'], ['Girl', '(   )']], ['By bike.', 'At eight.', 'It\'s my bag.', 'Every day.'], '男の子：どうやって学校へ行くの？ 女の子：自転車だよ。', 'How（どうやって）に方法で答える'],
  [[['Man', 'What time is it now?'], ['Woman', '(   )']], ['It\'s ten thirty.', 'It\'s Sunday.', 'It\'s rainy.', 'It\'s on the desk.'], '男性：今何時ですか。 女性：10時30分です。', ''],
  [[['Girl 1', 'I like your new hat.'], ['Girl 2', '(   ) It\'s from my aunt.']], ['Thank you.', 'Good night.', 'I\'m sorry.', 'See you.'], '女の子1：その新しいぼうし、いいね。 女の子2：ありがとう。おばからもらったの。', 'ほめられたら Thank you.'],
  [[['Boy', 'Whose umbrella is this?'], ['Girl', '(   )']], ['It\'s my mother\'s.', 'It\'s in the car.', 'It\'s not rainy.', 'It\'s two o\'clock.'], '男の子：これはだれのかさ？ 女の子：母のものです。', 'Whose には「〜のもの」で答える'],
  [[['Woman', 'How much is this T-shirt?'], ['Man', '(   )']], ['It\'s 1,500 yen.', 'It\'s white.', 'It\'s Friday.', 'It\'s very big.'], '女性：このTシャツはいくらですか。 男性：1,500円です。', ''],
  [[['Boy 1', 'Let\'s play basketball after school.'], ['Boy 2', '(   )']], ['That\'s a good idea.', 'You\'re welcome.', 'It\'s my book.', 'At the station.'], '男の子1：放課後バスケをしよう。 男の子2：いいね。', "Let's に賛成する言い方"],
  [[['Girl', 'Who is that woman?'], ['Boy', '(   ) She teaches English.']], ['She\'s Ms. Baker.', 'She\'s at home.', 'She\'s tall.', 'She\'s fine.'], '女の子：あの女の人はだれ？ 男の子：ベーカー先生だよ。英語を教えているんだ。', 'Who には名前や関係で答える'],
  [[['Mother', 'Where is your father, Jim?'], ['Boy', '(   ) He\'s washing the car.']], ['He\'s in the garden.', 'He\'s my father.', 'He\'s forty years old.', 'He\'s a doctor.'], '母：ジム、お父さんはどこ？ 男の子：庭にいるよ。車を洗っているよ。', ''],
  [[['Boy', 'Can you swim, Mary?'], ['Girl', '(   ) I can swim fast.']], ['Yes, I can.', 'No, I don\'t.', 'I\'m a student.', 'It\'s a pool.'], '男の子：メアリー、泳げる？ 女の子：うん、泳げるよ。速く泳げるんだ。', 'Can you に Yes, I can'],
  [[['Man', 'Excuse me. Where is the post office?'], ['Woman', '(   )']], ['It\'s near the park.', 'It\'s a big dog.', 'It\'s 300 yen.', 'It\'s in the morning.'], '男性：すみません。郵便局はどこですか。 女性：公園の近くです。', ''],
  [[['Student', 'Good morning, Mr. Hill.'], ['Teacher', '(   )']], ['Good morning, Emi.', 'Good night, Emi.', 'You\'re welcome, Emi.', 'That\'s all, Emi.'], '生徒：ヒル先生、おはようございます。 先生：おはよう、エミ。', ''],
  [[['Girl', 'What sport do you play?'], ['Boy', '(   )']], ['I play tennis.', 'I\'m thirteen.', 'I go to school.', 'I have a sister.'], '女の子：何のスポーツをしているの？ 男の子：テニスだよ。', ''],
  [[['Boy', 'Happy birthday, Yuki! This is for you.'], ['Girl', '(   )']], ['Thank you very much.', 'No, it isn\'t.', 'Yes, I can.', 'I don\'t know.'], '男の子：ユキ、誕生日おめでとう！ これをどうぞ。 女の子：どうもありがとう。', 'プレゼントをもらったら'],
  [[['Mother', 'Are you hungry, Tom?'], ['Boy', '(   ) Can I have some bread?']], ['Yes, I am.', 'Yes, you can.', 'No, it isn\'t.', 'No, they don\'t.'], '母：トム、おなかすいた？ 男の子：うん、すいた。パンをもらえる？', 'Are you に Yes, I am'],
  [[['Girl 1', 'How many sisters do you have?'], ['Girl 2', '(   )']], ['I have two.', 'I\'m fine.', 'It\'s my sister.', 'She\'s kind.'], '女の子1：姉妹は何人いるの？ 女の子2：2人いるよ。', ''],
  [[['Boy', 'When is the school festival?'], ['Girl', '(   )']], ['It\'s in October.', 'It\'s at school.', 'It\'s very fun.', 'It\'s my class.'], '男の子：文化祭はいつ？ 女の子：10月だよ。', 'When に時で答える'],
  [[['Man', 'Which do you want, tea or coffee?'], ['Woman', '(   )']], ['Tea, please.', 'Yes, I do.', 'No, I don\'t.', 'At the shop.'], '男性：紅茶とコーヒー、どちらがいいですか。 女性：紅茶をお願いします。', 'Which には選んで答える'],
  [[['Girl', 'I\'m sorry, Mr. White. I don\'t have my textbook today.'], ['Teacher', '(   ) Use Mike\'s book.']], ['That\'s OK.', 'Good morning.', 'Nice to meet you.', 'See you later.'], '女の子：ホワイト先生、すみません。今日は教科書がありません。 先生：大丈夫だよ。マイクの本を使いなさい。', ''],
  [[['Boy', 'What is your favorite subject?'], ['Girl', '(   )']], ['I like science.', 'I like cats.', 'I\'m in the music club.', 'It\'s on Monday.'], '男の子：いちばん好きな教科は？ 女の子：理科が好き。', ''],
  [[['Father', 'Good night, Amy.'], ['Girl', '(   )']], ['Good night, Dad.', 'Good morning, Dad.', 'Nice to meet you, Dad.', 'Here you are, Dad.'], '父：おやすみ、エイミー。 女の子：おやすみ、お父さん。', ''],
  [[['Girl', 'Can I use your pen?'], ['Boy', '(   )']], ['Sure. Here you are.', 'Yes, I do.', 'It\'s Sunday.', 'No, you aren\'t.'], '女の子：ペンを使ってもいい？ 男の子：いいよ。はい、どうぞ。', 'Here you are.＝はい、どうぞ'],
  [[['Boy', 'Is your brother a high school student?'], ['Girl', '(   ) He\'s a college student.']], ['No, he isn\'t.', 'Yes, I am.', 'No, he doesn\'t.', 'Yes, she is.'], '男の子：お兄さんは高校生？ 女の子：いいえ、ちがうよ。大学生なの。', ''],
  [[['Woman', 'Nice to meet you, Mr. Lee.'], ['Man', '(   )']], ['Nice to meet you, too.', 'You\'re welcome.', 'See you tomorrow, too.', 'I\'m fine, thanks.'], '女性：はじめまして、リーさん。 男性：こちらこそ、はじめまして。', ''],
  [[['Girl', 'What do you do on Sundays?'], ['Boy', '(   )']], ['I play soccer with my friends.', 'I\'m a good student.', 'It\'s my favorite day.', 'She reads books.'], '女の子：日曜日は何をするの？ 男の子：友だちとサッカーをするよ。', ''],
  [[['Mother', 'Please clean your room, Sam.'], ['Boy', '(   )']], ['All right.', 'It\'s my room.', 'Not at all.', 'You\'re OK.'], '母：サム、部屋をそうじしてね。 男の子：わかった。', ''],
  [[['Boy 1', 'See you tomorrow, Ken.'], ['Boy 2', '(   )']], ['See you.', 'Yes, I am.', 'Good morning.', 'I\'m sorry.'], '男の子1：ケン、また明日。 男の子2：またね。', ''],
  // ===== 本番模試の専用 =====
  [[['Boy', 'Where do you practice basketball?'], ['Girl', '(   )']], ['In the gym.', 'After lunch.', 'With Mary.', 'By train.'], '男の子：バスケットボールはどこで練習するの？ 女の子：体育館で。', 'Where に場所で答える'],
  [[['Mother', 'Is this your cup, Bill?'], ['Boy', '(   ) It\'s Dad\'s.']], ['No, it isn\'t.', 'Yes, I do.', 'No, I don\'t.', 'Yes, you are.'], '母：ビル、これはあなたのカップ？ 男の子：ううん、ちがうよ。お父さんのだよ。', ''],
  [[['Girl', 'How old is your dog?'], ['Boy', '(   )']], ['He\'s three.', 'He\'s brown.', 'He\'s at home.', 'He\'s my pet.'], '女の子：あなたの犬は何歳？ 男の子：3歳だよ。', ''],
  [[['Man', 'Do you have blue T-shirts?'], ['Woman', '(   ) Here you are.']], ['Yes, we do.', 'No, I\'m not.', 'It\'s a shop.', 'At three.'], '男性：青いTシャツはありますか。 女性：はい、ございます。どうぞ。', ''],
  [[['Student', 'Mr. Kato, I don\'t know this word.'], ['Teacher', '(   )']], ['Let\'s look in the dictionary.', 'It\'s my school.', 'I\'m your teacher.', 'See you on Monday.'], '生徒：加藤先生、この単語がわかりません。 先生：辞書で調べてみよう。', ''],
  [[['Girl', 'What are you doing, Dad?'], ['Father', '(   )']], ['I\'m making lunch.', 'I\'m your father.', 'I\'m forty.', 'I\'m in Japan.'], '女の子：お父さん、何をしているの？ 父：お昼ごはんを作っているよ。', 'What are you doing? には ing で'],
  [[['Boy', 'Does your sister like music?'], ['Girl', '(   ) She plays the guitar.']], ['Yes, she does.', 'Yes, she is.', 'No, she can\'t.', 'No, she isn\'t.'], '男の子：お姉さんは音楽が好き？ 女の子：うん、好きだよ。ギターをひくの。', ''],
  [[['Woman', 'Excuse me. Is this seat free?'], ['Man', '(   ) Please sit down.']], ['Yes, it is.', 'It\'s my father.', 'It\'s two dollars.', 'Yes, I can.'], '女性：すみません。この席は空いていますか。 男性：はい、空いています。どうぞすわってください。', ''],
  [[['Girl 1', 'Let\'s go to the zoo on Saturday.'], ['Girl 2', '(   ) I like animals.']], ['Sounds good.', 'You\'re welcome.', 'That\'s my dog.', 'I\'m sorry, I do.'], '女の子1：土曜日に動物園へ行こう。 女の子2：いいね。動物が好きなの。', ''],
  [[['Boy', 'I have a cold today.'], ['Mother', '(   ) Please go to bed.']], ['That\'s too bad.', 'That\'s my bed.', 'Thank you very much.', 'Nice to meet you.'], '男の子：今日はかぜをひいているんだ。 母：それはいけないね。寝なさい。', ''],
];

// ---------- 大問3：語句の並べかえ [日本文, 前の語, [正しい順の4つ], 後ろの語] ----------
// 文のはじめに来る語も小文字（本番と同じ。I や人の名前は大文字のまま）
const EK_R3 = [
  ['あなたのお姉さんは何歳ですか。', 'How', ['old', 'is', 'your', 'sister'], '?'],
  ['ケンは毎朝、牛乳を飲みます。', 'Ken', ['drinks', 'milk', 'every', 'morning'], '.'],
  ['私は放課後にバスケットボールをします。', 'I', ['play', 'basketball', 'after', 'school'], '.'],
  ['あなたの好きな色は何ですか。', 'What', ['is', 'your', 'favorite', 'color'], '?'],
  ['私の父は料理がじょうずです。', 'My', ['father', 'is', 'a good', 'cook'], '.'],
  ['あなたは日曜日にどこへ行きますか。', 'Where', ['do', 'you', 'go', 'on Sundays'], '?'],
  ['あなたのかばんはどこにありますか。', '', ['where', 'is', 'your', 'bag'], '?'],
  ['今、台所のドアを開けてください。', 'Please', ['open', 'the', 'kitchen', 'door'], 'now.'],
  ['私の妹はピアノをひくことができます。', 'My sister', ['can', 'play', 'the', 'piano'], '.'],
  ['彼らは今、公園で走っています。', 'They', ['are', 'running', 'in', 'the'], 'park now.'],
  ['私はかばんの中に本を2冊持っています。', 'I', ['have', 'two', 'books', 'in'], 'my bag.'],
  ['今日は何曜日ですか。', '', ['what', 'day', 'is', 'it'], 'today?'],
  ['ユキは英語を毎日勉強します。', 'Yuki', ['studies', 'English', 'every', 'day'], '.'],
  ['あのネコを見てください。', 'Please', ['look', 'at', 'that', 'cat'], '.'],
  ['私はサッカーがあまり好きではありません。', 'I', ['don\'t', 'like', 'soccer', 'very much'], '.'],
  ['あなたのお父さんはどこで働いていますか。', '', ['where', 'does', 'your father', 'work'], '?'],
  ['ペンを何本持っていますか。', 'How', ['many', 'pens', 'do', 'you'], 'have?'],
  ['私の兄はテレビを見ています。', 'My', ['brother', 'is', 'watching', 'TV'], '.'],
  ['公園で昼食を食べましょう。', 'Let\'s', ['have', 'lunch', 'in', 'the park'], '.'],
  ['この部屋で走ってはいけません。', '', ['don\'t', 'run', 'in', 'this'], 'room.'],
  ['私たちの学校は8時30分に始まります。', 'Our', ['school', 'starts', 'at', 'eight thirty'], '.'],
  ['彼女は東京に住んでいません。', 'She', ['doesn\'t', 'live', 'in', 'Tokyo'], '.'],
  ['あれは私たちの新しい先生です。', 'That', ['is', 'our', 'new', 'teacher'], '.'],
  ['このケーキはいくらですか。', 'How', ['much', 'is', 'this', 'cake'], '?'],
  ['ジムはじょうずに泳ぐことができますか。', '', ['can', 'Jim', 'swim', 'well'], '?'],
  ['私は朝7時に起きます。', 'I', ['get', 'up', 'at', 'seven'], 'in the morning.'],
  ['あなたはどの本がほしいですか。', 'Which', ['book', 'do', 'you', 'want'], '?'],
  ['私の母は毎週日曜日にケーキを作ります。', 'My mother', ['makes', 'a', 'cake', 'every'], 'Sunday.'],
  ['トムとマイクは同じクラスです。', 'Tom and Mike', ['are', 'in', 'the same', 'class'], '.'],
  ['私はバスで学校へ行きます。', 'I', ['go', 'to', 'school', 'by'], 'bus.'],
  // ===== 本番模試の専用 =====
  ['あなたの誕生日はいつですか。', '', ['when', 'is', 'your', 'birthday'], '?'],
  ['アヤは手紙を書いています。', 'Aya', ['is', 'writing', 'a', 'letter'], '.'],
  ['私の祖母は犬を2匹飼っています。', 'My', ['grandmother', 'has', 'two', 'dogs'], '.'],
  ['ビルは野球の選手ではありません。', 'Bill', ['isn\'t', 'a', 'baseball', 'player'], '.'],
  ['あの背の高い女の子はだれですか。', '', ['who', 'is', 'that', 'tall girl'], '?'],
  ['あなたのお母さんは何時に起きますか。', 'What', ['time', 'does', 'your mother', 'get'], 'up?'],
  ['窓を閉めてくれますか。', '', ['can', 'you', 'close', 'the window'], '?'],
  ['私はスポーツがとても好きです。', 'I', ['like', 'sports', 'very', 'much'], '.'],
  ['この絵を見てください。', 'Please', ['look', 'at', 'this', 'picture'], '.'],
  ['彼は土曜日にギターをひきます。', 'He', ['plays', 'the guitar', 'on', 'Saturdays'], '.'],
];

// ---------- リスニング第1部：絵を見て、返事をえらぶ [絵の説明, 話す人, 文, [正解, まちがい×2], 日本語] ----------
// 話す人：b=男の子 g=女の子 m=男性 w=女性。返事の声は app.js の ekReplyVoice が絵の説明から選ぶ
const EK_L1 = [
  ['A girl is showing a boy a small red bag at a store', 'g', 'Do you like this bag?', ['Yes, it\'s very nice.', 'I\'m in the car.', 'It\'s Monday.'], 'このかばん、好き？ — うん、とてもいいね。'],
  ['A boy and his mother are in the kitchen in the morning', 'w', 'Are you ready for school?', ['Yes, I am.', 'No, it isn\'t.', 'At the station.'], '学校の準備はできた？ — はい、できたよ。'],
  ['A teacher is talking to a student next to a desk in a classroom', 'm', 'Whose pen is this?', ['It\'s mine.', 'It\'s blue.', 'It\'s at nine.'], 'これはだれのペン？ — 私のです。'],
  ['Two girls are talking on a street, one is holding a tennis racket', 'g', 'Do you play tennis?', ['Yes, on Sundays.', 'Yes, it\'s hot.', 'No, it\'s a dog.'], 'テニスをするの？ — うん、日曜日にね。'],
  ['A man is standing in front of a shop counter with a shop clerk woman', 'm', 'How much is this hat?', ['It\'s twenty dollars.', 'It\'s my hat.', 'It\'s very cold.'], 'このぼうしはいくらですか。 — 20ドルです。'],
  ['A boy and a girl are looking at a big clock on a wall at school', 'g', 'What time is the music class?', ['At two o\'clock.', 'In the classroom.', 'With Ms. Kato.'], '音楽の授業は何時？ — 2時だよ。'],
  ['A mother and her daughter are looking at a dog in a park', 'w', 'Is that your friend\'s dog?', ['Yes, it is.', 'Yes, I can.', 'No, I don\'t.'], 'あれは友だちの犬？ — うん、そうだよ。'],
  ['A boy is eating a sandwich at a table and his father is sitting across from him', 'm', 'Do you want some more?', ['No, thank you.', 'Good night.', 'I\'m eleven.'], 'もっとほしい？ — ううん、もういいよ。'],
  ['Two boys are in a gym with a basketball', 'b', 'Let\'s play basketball.', ['OK, let\'s go.', 'It\'s in my bag.', 'You\'re welcome.'], 'バスケをしよう。 — うん、やろう。'],
  ['A girl is holding out a birthday present box to another girl', 'g', 'This is for you.', ['Thank you.', 'I\'m sorry.', 'See you.'], 'これ、あなたに。 — ありがとう。'],
  ['A woman is asking a man for directions on a street next to a map', 'w', 'Where is the bank?', ['It\'s by the park.', 'It\'s Friday.', 'I\'m a doctor.'], '銀行はどこですか。 — 公園のそばです。'],
  ['A boy is holding a math notebook, talking with a girl at their desks', 'b', 'Is math easy for you?', ['No, it\'s difficult.', 'No, it\'s my desk.', 'Yes, I\'m twelve.'], '数学は簡単？ — ううん、難しいよ。'],
  ['A girl is talking on the phone at home', 'g', 'Hello. This is Emi. Is Mary home?', ['Yes. Just a minute.', 'Yes, it\'s a pen.', 'No, I\'m eating.'], 'もしもし、エミです。メアリーはいますか。 — はい、少し待ってね。'],
  ['A boy and his grandmother are looking at flowers in a garden', 'w', 'Do you like these flowers?', ['Yes, they\'re beautiful.', 'Yes, I\'m ten.', 'No, it\'s a car.'], 'この花は好き？ — うん、きれいだね。'],
  ['A student is standing in front of a teacher holding a report in a hallway', 'm', 'Is that your homework?', ['Yes, here you are.', 'No, I\'m fine.', 'At home, please.'], 'それは宿題？ — はい、どうぞ。'],
  ['A boy and a girl are at a bus stop, a bus is coming', 'b', 'Is this your bus?', ['No, mine is number 5.', 'No, it\'s my hat.', 'Yes, I like cats.'], 'これはきみのバス？ — ううん、私のは5番なの。'],
  ['A girl is pointing at a picture of a family on the wall, a boy is looking at it', 'b', 'Who is this man?', ['He\'s my uncle.', 'He\'s in the kitchen.', 'He\'s sixty.'], 'この男の人はだれ？ — おじだよ。'],
  ['A girl and her father are at a dinner table with a pizza on it', 'm', 'How is the pizza?', ['It\'s very good.', 'It\'s on Sunday.', 'It\'s my father.'], 'ピザはどう？ — とてもおいしいよ。'],
  ['A boy is wearing a coat at the front door, his mother is behind him', 'w', 'Have a nice day.', ['You, too.', 'Yes, I do.', 'It\'s a coat.'], 'いってらっしゃい。 — お母さんもね。'],
  ['Two children are at a swimming pool, one is pointing at the water', 'g', 'Can you swim?', ['Yes, a little.', 'Yes, it\'s mine.', 'No, thanks.'], '泳げる？ — うん、少しね。'],
  // ===== 本番模試の専用 =====
  ['A boy and a girl are in a music room, the girl is holding a violin', 'b', 'Is that your violin?', ['Yes, it\'s new.', 'Yes, I\'m thirteen.', 'No, on Monday.'], 'それはきみのバイオリン？ — うん、新しいの。'],
  ['A woman is showing a blue T-shirt to a man at a clothes shop', 'w', 'Do you like this color?', ['Yes, I like blue.', 'Yes, it\'s five dollars.', 'No, I\'m not.'], 'この色は好きですか。 — はい、青が好きです。'],
  ['A boy is standing by a bicycle, talking to a girl in front of a school', 'g', 'How do you come to school?', ['By bike.', 'At eight.', 'With my bag.'], 'どうやって学校へ来るの？ — 自転車だよ。'],
  ['A father and a son are at a train station looking at a train schedule board', 'b', 'When does the train come?', ['In ten minutes.', 'At the station.', 'To Tokyo.'], '電車はいつ来るの？ — 10分後だよ。'],
  ['Two girls are eating lunch at school and one is holding an apple', 'g', 'Do you want this apple?', ['Yes, thank you.', 'Yes, I\'m fine.', 'No, it isn\'t.'], 'このりんご、ほしい？ — うん、ありがとう。'],
  ['A boy is in a library, asking a librarian woman at the counter about a book', 'b', 'Excuse me. Where are the science books?', ['They\'re over there.', 'They\'re very old.', 'They\'re mine.'], 'すみません。理科の本はどこですか。 — あちらです。'],
  ['A mother is looking at a boy who is holding his head, in a living room', 'w', 'Are you OK?', ['No, I\'m sick.', 'No, it\'s Tuesday.', 'Yes, I can.'], '大丈夫？ — ううん、具合が悪いんだ。'],
  ['A man and a woman are meeting and shaking hands in an office', 'm', 'Nice to meet you.', ['Nice to meet you, too.', 'Good night.', 'I\'m busy today.'], 'はじめまして。 — こちらこそ、はじめまして。'],
  ['A girl is holding a camera, talking to her friend in front of a big tree', 'g', 'Can I take a picture here?', ['Sure.', 'It\'s my camera.', 'It\'s sunny.'], 'ここで写真をとってもいい？ — もちろん。'],
  ['A boy and his father are in a car in the rain', 'm', 'Do you have your umbrella?', ['Yes, it\'s in my bag.', 'Yes, it\'s raining.', 'No, I\'m cold.'], 'かさは持っている？ — うん、かばんの中だよ。'],
  ['Two boys are in a classroom and one is pointing at a calendar on the wall', 'b', 'When is the test?', ['Next Wednesday.', 'In the gym.', 'It\'s math.'], 'テストはいつ？ — 来週の水曜日だよ。'],
  ['A girl is asking a boy a question next to a soccer ball on a school field', 'g', 'Are you in the soccer club?', ['Yes, I am.', 'Yes, I do.', 'No, it\'s a ball.'], 'サッカー部なの？ — うん、そうだよ。'],
  ['A woman is handing a menu to a girl at a restaurant table', 'w', 'What do you want to eat?', ['A hamburger, please.', 'At noon, please.', 'I\'m a student.'], '何を食べたいですか。 — ハンバーガーをお願いします。'],
  ['A boy is talking to his teacher in front of a blackboard', 'm', 'Do you have a question?', ['Yes. What is this word?', 'Yes, I\'m a boy.', 'No, it\'s green.'], '質問はありますか。 — はい。この単語は何ですか。'],
  ['A girl is talking with her mother in a bedroom at night', 'w', 'It\'s ten o\'clock. Go to bed.', ['OK. Good night.', 'OK. Good morning.', 'Yes, I\'m hungry.'], '10時よ。寝なさい。 — はい。おやすみなさい。'],
  ['A boy is holding a dog on a leash, talking to a girl in a park', 'g', 'What\'s your dog\'s name?', ['It\'s Max.', 'It\'s very big.', 'It\'s three years old.'], '犬の名前は何？ — マックスだよ。'],
  ['Two girls are looking at a poster of a concert on a wall', 'g', 'Do you like this singer?', ['Yes, very much.', 'Yes, I\'m a girl.', 'No, she\'s at home.'], 'この歌手は好き？ — うん、とても。'],
  ['A man is giving a boy a glass of water at a table', 'm', 'Here you are.', ['Thanks, Dad.', 'Yes, I am.', 'It\'s my water.'], 'はい、どうぞ。 — ありがとう、お父さん。'],
  ['A girl and a boy are in a hall in front of the school office, the boy looks at his watch', 'g', 'What time is it?', ['It\'s four o\'clock.', 'It\'s Saturday.', 'It\'s my watch.'], '何時？ — 4時だよ。'],
  ['A boy is sitting at a desk with a book and his sister is standing at the door', 'g', 'What are you reading?', ['A story about animals.', 'In my room.', 'I can read.'], '何を読んでいるの？ — 動物の話だよ。'],
];

// ---------- リスニング第2部：対話と質問 [[[話す人, 文]…], 質問, [正解, まちがい×3], 日本語] ----------
const EK_L2 = [
  [[['b', 'Do you have a pet, Lisa?'], ['g', 'Yes. I have a rabbit.']], 'What does Lisa have?', ['A rabbit.', 'A dog.', 'A cat.', 'A bird.'], '男の子：リサ、ペットを飼っている？ 女の子：うん、うさぎを飼っているの。　質問：リサは何を飼っていますか。'],
  [[['g', 'Where is your father, Tom?'], ['b', 'He\'s at the station.']], 'Where is Tom\'s father?', ['At the station.', 'At the park.', 'At school.', 'At home.'], '女の子：トム、お父さんはどこ？ 男の子：駅にいるよ。　質問：トムのお父さんはどこにいますか。'],
  [[['w', 'How much is this notebook?'], ['m', 'It\'s two hundred yen.']], 'How much is the notebook?', ['200 yen.', '100 yen.', '300 yen.', '20 yen.'], '女性：このノートはいくらですか。 男性：200円です。　質問：ノートはいくらですか。'],
  [[['b', 'When do you practice the piano?'], ['g', 'On Tuesdays and Fridays.']], 'When does the girl practice the piano?', ['On Tuesdays and Fridays.', 'On Mondays and Fridays.', 'On Tuesdays and Thursdays.', 'On Saturdays and Sundays.'], '男の子：ピアノの練習はいつ？ 女の子：火曜日と金曜日だよ。　質問：女の子はいつピアノを練習しますか。'],
  [[['g', 'Is this your cap, Mike?'], ['b', 'No. It\'s my brother\'s.']], 'Whose cap is it?', ['Mike\'s brother\'s.', 'Mike\'s.', 'The girl\'s.', 'Mike\'s father\'s.'], '女の子：マイク、これはあなたのぼうし？ 男の子：ううん、弟のだよ。　質問：だれのぼうしですか。'],
  [[['m', 'What do you want for lunch, Emi?'], ['g', 'I want some soup, Dad.']], 'What does Emi want?', ['Some soup.', 'Some rice.', 'Some bread.', 'Some juice.'], '父：エミ、お昼は何がいい？ 女の子：スープがいいな、お父さん。　質問：エミは何がほしいですか。'],
  [[['b', 'How do you go to school, Yuki?'], ['g', 'I walk. It\'s near my house.']], 'How does Yuki go to school?', ['She walks.', 'By bike.', 'By bus.', 'By car.'], '男の子：ユキ、どうやって学校へ行くの？ 女の子：歩いて行くよ。家から近いの。　質問：ユキはどうやって学校へ行きますか。'],
  [[['w', 'What time do you get up, Ben?'], ['b', 'At six thirty.']], 'What time does Ben get up?', ['At 6:30.', 'At 6:00.', 'At 7:30.', 'At 7:00.'], '女性：ベン、何時に起きるの？ 男の子：6時30分だよ。　質問：ベンは何時に起きますか。'],
  [[['g', 'How many brothers do you have, Jim?'], ['b', 'I have three.']], 'How many brothers does Jim have?', ['Three.', 'Two.', 'One.', 'Four.'], '女の子：ジム、兄弟は何人いるの？ 男の子：3人だよ。　質問：ジムには兄弟が何人いますか。'],
  [[['b', 'What is your favorite sport, Kate?'], ['g', 'I love volleyball.']], 'What is Kate\'s favorite sport?', ['Volleyball.', 'Tennis.', 'Soccer.', 'Basketball.'], '男の子：ケイト、いちばん好きなスポーツは？ 女の子：バレーボールが大好き。　質問：ケイトのいちばん好きなスポーツは何ですか。'],
  [[['m', 'Is your mother at home, Sam?'], ['b', 'No. She\'s at the hospital. She\'s a nurse.']], 'What does Sam\'s mother do?', ['She\'s a nurse.', 'She\'s a teacher.', 'She\'s a cook.', 'She\'s a singer.'], '男性：サム、お母さんは家にいる？ 男の子：いいえ。病院にいます。看護師なんです。　質問：サムのお母さんの仕事は何ですか。'],
  [[['g', 'Whose bike is that, Ken?'], ['b', 'It\'s my sister\'s. She rides it to school.']], 'Who rides the bike to school?', ['Ken\'s sister.', 'Ken.', 'Ken\'s father.', 'Ken\'s friend.'], '女の子：ケン、あれはだれの自転車？ 男の子：妹のだよ。学校へ乗っていくんだ。　質問：だれがその自転車で学校へ行きますか。'],
  [[['b', 'What are you doing, Mom?'], ['w', 'I\'m making a cake for your birthday.']], 'What is the boy\'s mother doing?', ['Making a cake.', 'Washing the car.', 'Reading a book.', 'Cleaning the room.'], '男の子：お母さん、何をしているの？ 母：あなたの誕生日のケーキを作っているのよ。　質問：お母さんは何をしていますか。'],
  [[['g', 'When is your birthday, Paul?'], ['b', 'It\'s in June. How about you?'], ['g', 'Mine is in September.']], 'When is the girl\'s birthday?', ['In September.', 'In June.', 'In July.', 'In November.'], '女の子：ポール、誕生日はいつ？ 男の子：6月だよ。きみは？ 女の子：私は9月。　質問：女の子の誕生日はいつですか。'],
  [[['w', 'Do you play any sports, Amy?'], ['g', 'Yes. I play badminton after school.']], 'When does Amy play badminton?', ['After school.', 'Before school.', 'On Sundays.', 'In the morning.'], '女性：エイミー、何かスポーツをしている？ 女の子：はい。放課後にバドミントンをします。　質問：エイミーはいつバドミントンをしますか。'],
  // ===== 本番模試の専用 =====
  [[['b', 'Do you like math, Nancy?'], ['g', 'No, but I like science.']], 'What subject does Nancy like?', ['Science.', 'Math.', 'English.', 'Music.'], '男の子：ナンシー、数学は好き？ 女の子：ううん、でも理科は好き。　質問：ナンシーは何の教科が好きですか。'],
  [[['w', 'Where do you live, Mr. Park?'], ['m', 'I live in Osaka.']], 'Where does Mr. Park live?', ['In Osaka.', 'In Tokyo.', 'In Kyoto.', 'In Nagoya.'], '女性：パークさん、どちらにお住まいですか。 男性：大阪です。　質問：パークさんはどこに住んでいますか。'],
  [[['g', 'How old is your sister, Dan?'], ['b', 'She\'s fifteen.']], 'How old is Dan\'s sister?', ['15 years old.', '50 years old.', '13 years old.', '12 years old.'], '女の子：ダン、お姉さんは何歳？ 男の子：15歳だよ。　質問：ダンのお姉さんは何歳ですか。'],
  [[['m', 'What do you do on Saturdays, Rika?'], ['g', 'I go to the library with my friends.']], 'Where does Rika go on Saturdays?', ['To the library.', 'To the zoo.', 'To the pool.', 'To the store.'], '男性：リカ、土曜日は何をするの？ 女の子：友だちと図書館へ行きます。　質問：リカは土曜日にどこへ行きますか。'],
  [[['g', 'Is this your pencil case, Tim?'], ['b', 'Yes, it is. Thank you, Meg.']], 'What does Tim have now?', ['His pencil case.', 'His notebook.', 'His bag.', 'His textbook.'], '女の子：ティム、これはあなたの筆箱？ 男の子：うん、そうだよ。ありがとう、メグ。　質問：ティムは今、何を持っていますか。'],
  [[['b', 'What time does the movie start?'], ['w', 'It starts at three.']], 'What time does the movie start?', ['At three.', 'At two.', 'At four.', 'At five.'], '男の子：映画は何時に始まるの？ 女性：3時に始まるよ。　質問：映画は何時に始まりますか。'],
  [[['g', 'Can your father cook, Bob?'], ['b', 'Yes. He makes good curry.']], 'What can Bob\'s father make?', ['Curry.', 'Cake.', 'Salad.', 'Sandwiches.'], '女の子：ボブ、お父さんは料理ができる？ 男の子：うん。おいしいカレーを作るよ。　質問：ボブのお父さんは何を作れますか。'],
  [[['m', 'Do you walk your dog in the morning, Lucy?'], ['g', 'No. I walk her in the evening.']], 'When does Lucy walk her dog?', ['In the evening.', 'In the morning.', 'At noon.', 'At night.'], '男性：ルーシー、朝に犬の散歩をするの？ 女の子：いいえ。夕方に散歩します。　質問：ルーシーはいつ犬を散歩させますか。'],
  [[['b', 'Which bag is yours, Sara?'], ['g', 'The green one is mine.']], 'What color is Sara\'s bag?', ['Green.', 'Blue.', 'Red.', 'Black.'], '男の子：サラ、どのかばんがきみの？ 女の子：緑のが私のだよ。　質問：サラのかばんは何色ですか。'],
  [[['w', 'What are you looking at, Jack?'], ['b', 'That big bird in the tree.']], 'What is Jack looking at?', ['A bird.', 'A cat.', 'A plane.', 'A monkey.'], '女性：ジャック、何を見ているの？ 男の子：木の上のあの大きな鳥だよ。　質問：ジャックは何を見ていますか。'],
];

// ---------- リスニング第3部：絵に合う文をえらぶ [絵, [正解, まちがい×2], 日本語] ----------
// 絵：文字列のとき＝絵の説明（Higgsfield の絵。読みこめない時は案内の文を出す）／ 'clock:7:40' = デジタル時計 ／ 'text:¥1,500' = 値札などの文字
const EK_L3 = [
  ['A girl is reading a book on a sofa', ['The girl is reading a book.', 'The girl is writing a letter.', 'The girl is washing the dishes.'], '女の子は本を読んでいます。'],
  ['A boy is riding a bicycle on a road', ['The boy is riding a bike.', 'The boy is driving a car.', 'The boy is running to school.'], '男の子は自転車に乗っています。'],
  ['A man is cooking in a kitchen with a frying pan', ['The man is cooking.', 'The man is sleeping.', 'The man is singing.'], '男の人は料理をしています。'],
  ['Two boys are playing soccer on a field', ['They are playing soccer.', 'They are playing baseball.', 'They are eating lunch.'], '彼らはサッカーをしています。'],
  ['clock:7:30', ['It\'s seven thirty.', 'It\'s three thirty.', 'It\'s seven thirteen.'], '7時30分です。'],
  ['clock:4:15', ['It\'s four fifteen.', 'It\'s four fifty.', 'It\'s five fifteen.'], '4時15分です。'],
  ['clock:11:50', ['It\'s eleven fifty.', 'It\'s eleven fifteen.', 'It\'s seven fifty.'], '11時50分です。'],
  ['text:¥1,500', ['It\'s one thousand five hundred yen.', 'It\'s five hundred yen.', 'It\'s one thousand fifty yen.'], '1,500円です。'],
  ['text:$30', ['It\'s thirty dollars.', 'It\'s thirteen dollars.', 'It\'s three dollars.'], '30ドルです。'],
  ['A cat is sleeping under a table', ['The cat is under the table.', 'The cat is on the table.', 'The cat is by the door.'], 'ねこはテーブルの下にいます。'],
  ['A bird is sitting on top of a large box', ['The bird is on the box.', 'The bird is in the box.', 'The bird is under the box.'], '鳥は箱の上にいます。'],
  ['A woman is washing a car with a hose', ['The woman is washing a car.', 'The woman is buying a car.', 'The woman is driving a car.'], '女の人は車を洗っています。'],
  ['A girl is playing the piano in a room', ['The girl is playing the piano.', 'The girl is playing the guitar.', 'The girl is playing tennis.'], '女の子はピアノをひいています。'],
  ['A boy is swimming in a swimming pool', ['The boy is swimming.', 'The boy is drawing.', 'The boy is walking.'], '男の子は泳いでいます。'],
  ['An old man is walking with a dog in a park', ['The man is walking with his dog.', 'The man is washing his dog.', 'The man is watching TV.'], '男の人は犬と歩いています。'],
  ['A teacher is writing on a blackboard in a classroom', ['The teacher is writing on the board.', 'The teacher is eating at the desk.', 'The teacher is running in the classroom.'], '先生は黒板に書いています。'],
  ['Rainy weather, a girl is holding an umbrella on a street', ['It\'s rainy today.', 'It\'s sunny today.', 'It\'s snowy today.'], '今日は雨です。'],
  ['Snow is falling and a boy is making a snowman', ['It\'s snowing.', 'It\'s very hot.', 'It\'s raining.'], '雪がふっています。'],
  ['Three apples on a plate', ['The apples are on the plate.', 'The cookies are on the plate.', 'The bananas are on the plate.'], 'お皿にりんごがあります。'],
  ['A family of four is eating dinner at a table', ['They are having dinner.', 'They are going to bed.', 'They are studying math.'], '彼らは夕食を食べています。'],
  // ===== 本番模試の専用 =====
  ['A boy is sleeping in a bed', ['The boy is sleeping.', 'The boy is cooking.', 'The boy is jumping.'], '男の子は眠っています。'],
  ['A girl is drawing a picture at a desk', ['The girl is drawing a picture.', 'The girl is taking a bath.', 'The girl is opening a window.'], '女の子は絵を描いています。'],
  ['A woman is buying fruit from a clerk at a store', ['The woman is at a store.', 'The woman is at a hospital.', 'The woman is at a school.'], '女の人は店にいます。'],
  ['clock:9:45', ['It\'s nine forty-five.', 'It\'s nine fifty-five.', 'It\'s five forty-five.'], '9時45分です。'],
  ['clock:2:20', ['It\'s two twenty.', 'It\'s two twelve.', 'It\'s twelve twenty.'], '2時20分です。'],
  ['text:¥800', ['It\'s eight hundred yen.', 'It\'s eighty yen.', 'It\'s eight thousand yen.'], '800円です。'],
  ['text:150 cm', ['It\'s one hundred and fifty centimeters.', 'It\'s fifteen centimeters.', 'It\'s one hundred and five centimeters.'], '150センチです。'],
  ['A boy is taking a picture of a mountain with a camera', ['The boy is taking a picture.', 'The boy is reading a map.', 'The boy is climbing a tree.'], '男の子は写真をとっています。'],
  ['A girl is drinking milk from a glass', ['The girl is drinking milk.', 'The girl is eating bread.', 'The girl is making a cake.'], '女の子は牛乳を飲んでいます。'],
  ['Two girls are playing basketball in a gym', ['They are playing basketball.', 'They are playing tennis.', 'They are playing the guitar.'], '彼女たちはバスケットボールをしています。'],
  ['A woman is talking on the phone at a desk in an office', ['The woman is talking on the phone.', 'The woman is watching a movie.', 'The woman is washing her hands.'], '女の人は電話で話しています。'],
  ['A train is at a station with people waiting', ['People are at the station.', 'People are at the beach.', 'People are at the zoo.'], '人々は駅にいます。'],
  ['A boy is singing with a microphone on a stage', ['The boy is singing.', 'The boy is swimming.', 'The boy is studying.'], '男の子は歌っています。'],
  ['A dog is standing next to a door with a ball in its mouth', ['The dog has a ball.', 'The dog has a hat.', 'The dog has a book.'], '犬はボールをくわえています。'],
  ['A man is reading a newspaper on a bench in a park', ['The man is reading a newspaper.', 'The man is painting a wall.', 'The man is riding a horse.'], '男の人は新聞を読んでいます。'],
  ['A mother and a boy are making a cake together in a kitchen', ['They are making a cake.', 'They are cleaning the kitchen.', 'They are buying a cake.'], '彼らはケーキを作っています。'],
  ['A girl wearing a coat and hat is walking on a cold day', ['It\'s cold today.', 'It\'s hot today.', 'It\'s rainy today.'], '今日は寒いです。'],
  ['A boy is studying at a desk with a notebook at night', ['The boy is studying.', 'The boy is playing soccer.', 'The boy is washing his face.'], '男の子は勉強しています。'],
  ['Three children are running on a school field', ['The children are running.', 'The children are sitting.', 'The children are swimming.'], '子どもたちは走っています。'],
  ['A boy is opening a window in a room', ['The boy is opening the window.', 'The boy is closing the door.', 'The boy is reading a book.'], '男の子は窓を開けています。'],
];

// ---------- コーチのセリフ・バッジ・ポイントの説明（data.js の一覧に足す） ----------
// {ekDays}=本番までの日数 {ekMock}=次の模試の名前
Object.assign(COACH_LINES, {
  ekScout: ['1月17日は英検5級！ まず実力チェック15問で、今の力を見てみよう 🏆'],
  ekMenu: ['英検まで あと{ekDays}日！ 合格したら {ekReward} だ 🍣 今日のメニューは5分だけ！', '英検まで あと{ekDays}日！ 今日のメニューは5分だけ 🏆', '英検カップ、今日の分がまだだぞ。単語→大問→リスニングの3本で決めよう 🔥'],
  ekMock: ['英検まで あと{ekDays}日。そろそろ練習試合だ！ {ekMock}、やってみよう 🏟️'],
  ekFinal: ['英検まで あと{ekDays}日。今日のメニューはクリア！ 公式の過去問も解いてみよう 📄'],
  ekEve: ['明日は英検！ 今日は軽くメニューだけ。えんぴつと消しゴムを用意して、早く寝よう 🌙'],
  ekToday: ['今日は英検5級！ 迷ったら印をつけて先へ。リスニングは2回読まれるよ。いつものシュートを打つだけだ 🏀', '今日の目標は {ekReward} 🍣 落ち着いていこう！'],
  ekClear: ['ナイス！ 毎日の5分が、本番の自信になるぞ 🔥', '今日も1本決めたな！ この積み重ねがいちばん強い 🏀', 'いいぞ！ まちがえた問題は、ちょうどいい日にまた出してやるからな'],
});
BADGES.push(
  { id: 'ekscout', e: '🔎', name: '英検カップ 開幕', d: '英検5級の実力チェックをやった', t: 'ekscout', n: 1 },
  { id: 'ekmenu7', e: '📅', name: '英検メニュー 7日', d: '英検カップのメニューを7日クリア', t: 'ekmenu', n: 7 },
  { id: 'ekmenu30', e: '🗓️', name: '英検メニュー 30日', d: '英検カップのメニューを30日クリア', t: 'ekmenu', n: 30 },
  { id: 'ekw100', e: '📖', name: '単語 100', d: '英検の単語を100語おぼえた', t: 'ekwords', n: 100 },
  { id: 'ekw300', e: '📚', name: '単語 300', d: '英検の単語を300語おぼえた', t: 'ekwords', n: 300 },
  { id: 'ekmock', e: '🎯', name: '目標の8割', d: '本番模試で8割以上とった', t: 'ekmock', n: 1 },
  { id: 'ekpass', e: '🏅', name: '英検5級 合格', d: '英検5級に合格した！', t: 'ekpass', n: 1 },
);
HOWTO_POINTS.push(['🏆', '英検カップ 1問正解', '1P']);
