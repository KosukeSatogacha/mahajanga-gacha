"use strict";

/* =====================================================================
 * 【初心者向け編集ガイド】
 * ---------------------------------------------------------------------
 * このファイルだけを編集すれば、カードの内容を変更できます。
 *
 * ■ カード名を変えたいとき     → その行の name: "..." を書き換える
 * ■ レアリティを変えたいとき   → rarity: "SSR" / "SR" / "R" / "N" のどれかにする
 * ■ 排出されやすさを変えたいとき → weight の数字を大きくする（同じレアリティ内で比較されます）
 * ■ 説明文を変えたいとき       → description: "..." を書き換える
 *
 * ・weight は「同じレアリティの中での当たりやすさの比率」です。
 *   例) 同じNレアリティで weight が 2 と 1 のカードがあれば、2 の方が 2倍 出ます。
 *   よく分からない場合は 1 のままで大丈夫です（全員同じ確率になります）。
 *
 * ・image はカード画像のファイル名です。assets/cards/ の中のファイル名と
 *   完全に一致させてください（変更非推奨）。
 *
 * ・レアリティ全体の出やすさ（SSR5%など）は、このファイル下部の
 *   RARITY_RATES で調整します。カードごとの weight とは別物です。
 * ===================================================================== */

/**
 * @typedef {Object} Card
 * @property {string} id          カード固有のID（重複しないようにする）
 * @property {string} name        カード名（画面に表示される）
 * @property {("SSR"|"SR"|"R"|"N")} rarity レアリティ
 * @property {string} image       assets/cards/ 内の画像ファイル名
 * @property {number} weight      同一レアリティ内での相対的な抽選比率（1以上）
 * @property {string} description カード説明文（コレクションの詳細で表示）
 */

/**
 * 旧マジャンガ州ガチャに登場するカード一覧。
 * 上から順に「SSR → SR → R → N」で並べています。
 * @type {Card[]}
 */
const MAHAJANGA_CARDS = [
  // ---------------- SSR（最高レアリティ） ----------------
  {
    id: "SSR-001",
    name: "ディエゴ",
    rarity: "SSR",
    image: "ディエゴ.png",
    weight: 1,
    description: "マダガスカルの三羽烏の1つ。甘くてクセがない。早めの10月に熟す。",
  },
  {
    id: "SSR-002",
    name: "エシー",
    rarity: "SSR",
    image: "エシー.png",
    weight: 1,
    description: "マダガスカルの三羽烏の1つ。クセ強い。早めの10月に熟す。野菜としても親しまれている。",
  },
  {
    id: "SSR-003",
    name: "ザンジバル",
    rarity: "SSR",
    image: "ザンジバル.png",
    weight: 1,
    description: "マダガスカルの三羽烏の1つ。クセ強い・遅めの12月に熟す。",
  },
  {
    id: "SSR-004",
    name: "ケロケツ",
    rarity: "SSR",
    image: "ケロケツ.png",
    weight: 1,
    description: "マダガスカルの日常。ケロッ。",
  },
  {
    id: "SSR-005",
    name: "きゅるんきゅるん",
    rarity: "SSR",
    image: "きゅるんきゅるん(SSR-005).png",
    weight: 1,
    description: "マダガスカルの日常。ヒルヤモリ。カチャチカ・マインツ。きゅるんきゅるん！",
  },

  // ---------------- SR ----------------
  {
    id: "SR-001",
    name: "投票用紙より書きやすい",
    rarity: "SR",
    image: "投票用紙より書きやすい(SR-001).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "SR-002",
    name: "般若心経 on 種皮",
    rarity: "SR",
    image: "般若心経 on 種皮(SR-002).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },

  // ---------------- R ----------------
  {
    id: "R-001",
    name: "プラメナ",
    rarity: "R",
    image: "プラメナ(R-001).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "R-002",
    name: "ベアダラ",
    rarity: "R",
    image: "ベアダラ(R-002).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "R-003",
    name: "タボリヌンビ",
    rarity: "R",
    image: "タボリヌンビ(R-003).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "R-004",
    name: "ファク",
    rarity: "R",
    image: "ファク(R-004).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "R-005",
    name: "ダイナクー",
    rarity: "R",
    image: "ダイナクー(R-005).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },
  {
    id: "R-006",
    name: "ココナッツの新芽",
    rarity: "R",
    image: "ココナッツの新芽(R-006).png",
    weight: 1,
    description: "旧マジャンガ州で出会った一枚。（説明は後から編集できます）",
  },

  // ---------------- N（最も出やすい） ----------------
  {
    id: "N-001",
    name: "ブリィ",
    rarity: "N",
    image: "ブリィ（N-001）.png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-002",
    name: "ヴァトケリ",
    rarity: "N",
    image: "ヴァトケリ(N-002).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-003",
    name: "カイガラムシの被害",
    rarity: "N",
    image: "カイガラムシの被害(N-003).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-004",
    name: "雑なマンゴー",
    rarity: "N",
    image: "雑なマンゴー(N-004).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-005",
    name: "雑なマンゴー　その2",
    rarity: "N",
    image: "雑なマンゴー　その2(N-005).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-006",
    name: "とんでもない繊維のマンゴー",
    rarity: "N",
    image: "とんでもない繊維のマンゴー(N-006).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-007",
    name: "あ！マンゴーだ！",
    rarity: "N",
    image: "あ！マンゴーだ！(N-007).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-008",
    name: "バナナじゃないよ！",
    rarity: "N",
    image: "バナナじゃないよ！(N-008).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-009",
    name: "ナメクジ？",
    rarity: "N",
    image: "ナメクジ？(N-009).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-010",
    name: "盗っ人キツネザル",
    rarity: "N",
    image: "盗っ人キツネザル(N-010).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-011",
    name: "やってきたアフリカマイマイ",
    rarity: "N",
    image: "やってきたアフリカマイマイ(N-011).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-012",
    name: "血に群がるアリたち",
    rarity: "N",
    image: "血に群がるアリたち(N-012).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-013",
    name: "「キノコ」",
    rarity: "N",
    image: "「キノコ」(N-013).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-014",
    name: "触るな危険",
    rarity: "N",
    image: "触るな危険(N-014）.png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-015",
    name: "ブワ・チリンジャナ",
    rarity: "N",
    image: "ブワ・チリンジャナ(N-015).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-016",
    name: "サフ・バカ",
    rarity: "N",
    image: "サフ・バカ(N-016).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-017",
    name: "バケツの中で暴れるサフバカ",
    rarity: "N",
    image: "バケツの中で暴れるサフバカ(N-017).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-018",
    name: "ファニンチャの巣",
    rarity: "N",
    image: "ファニンチャの巣(N-018).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-019",
    name: "野犬の巣",
    rarity: "N",
    image: "野犬の巣(N-019).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-020",
    name: "人力観覧車",
    rarity: "N",
    image: "人力観覧車(N-020).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-021",
    name: "おっさん",
    rarity: "N",
    image: "おっさん(n-021).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-022",
    name: "山火事",
    rarity: "N",
    image: "山火事(N-022).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-023",
    name: "大量発生",
    rarity: "N",
    image: "大量発生(N-023).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-024",
    name: "実にかわいい",
    rarity: "N",
    image: "実にかわいい(N-024).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-025",
    name: "風呂場",
    rarity: "N",
    image: "風呂場(N-025).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-026",
    name: "ユーカリに登って枝を切る人①",
    rarity: "N",
    image: "ユーカリに登って枝を切る人①(N-026).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-027",
    name: "ユーカリに登って枝を切る人②",
    rarity: "N",
    image: "ユーカリに登って枝を切る人②(N-027).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
  {
    id: "N-028",
    name: "5匹で250円",
    rarity: "N",
    image: "5匹で250円(N-028).png",
    weight: 1,
    description: "旧マジャンガ州で集めた一枚。（説明は後から編集できます）",
  },
];

/**
 * レアリティごとの提供割合（％）。合計が必ず 100 になるようにしてください。
 * ※ これは「どのレアリティが出るか」の確率です。
 *   そのレアリティの中でどのカードが出るかは、各カードの weight で決まります。
 * @type {{rarity: ("SSR"|"SR"|"R"|"N"), rate: number}[]}
 */
const RARITY_RATES = [
  { rarity: "SSR", rate: 5 },
  { rarity: "SR", rate: 20 },
  { rarity: "R", rate: 35 },
  { rarity: "N", rate: 40 },
];
