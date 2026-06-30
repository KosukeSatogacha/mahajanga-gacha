"use strict";

/* =====================================================================
 * 旧マジャンガ州マンゴーガチャ — メインスクリプト🥭
 * ---------------------------------------------------------------------
 * 読み込み順：site-config.js → cards.js → script.js
 *  - SITE_CONFIG ……… 文言・待機時間・X投稿設定（site-config.js）
 *  - MAHAJANGA_CARDS / RARITY_RATES … カードデータ（cards.js）
 *
 * 文言や待機時間を変えたいときは site-config.js を編集してください。
 * ===================================================================== */

/**
 * カード画像が置かれているフォルダ（GitHub Pages でも動く相対パス）。
 * @type {string}
 */
const IMAGE_BASE_PATH = "./assets/cards/";

/**
 * localStorage のキー一覧。すべて "mahajanga-gacha:" で始める。
 * （時間制限は廃止したため last-draw-time は保持しない。図鑑に必要な
 *   コレクション・NEW・直近カードのみを保存する）
 * @type {Record<string, string>}
 */
const STORAGE_KEYS = {
  lastCardId: "mahajanga-gacha:last-card-id",
  collection: "mahajanga-gacha:collection",
  newCards: "mahajanga-gacha:new-cards",
  // 計測用。図鑑データ（上記）とは独立。壊さない。
  drawCount: "mahajanga-gacha:draw-count",          // 累計抽選回数（GAの total_draws 用）
  completeSent: "mahajanga-gacha:completion-event-sent", // コンプリート計測を送ったか（重複送信防止）
};

/** 廃止済み：時間制限で使っていた旧キー。初期化時に掃除するためだけに保持。 */
const LEGACY_LAST_DRAW_TIME_KEY = "mahajanga-gacha:last-draw-time";

/** レアリティ表示順。 @type {Array<"SSR"|"SR"|"R"|"N">} */
const RARITY_ORDER = ["SSR", "SR", "R", "N"];

/** X投稿文に載せるカード名の最大文字数（長すぎる名前は省略）。 @type {number} */
const MAX_TWEET_NAME_LENGTH = 40;

/** X Web Intent のエンドポイント。 @type {string} */
const X_INTENT_URL = "https://twitter.com/intent/tweet";

/** 投稿に含めることを許可する唯一の本番URL（固定）。 @type {string} */
const ALLOWED_PRODUCTION_URL = "https://KosukeSatogacha.github.io/mahajanga-gacha/";

/**
 * 画面の文言（site-config.js の text）。未設定でも落ちないよう空オブジェクトで保険。
 * @type {Record<string, string>}
 */
const T = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.text) ? SITE_CONFIG.text : {};

/**
 * 動きを抑えたい設定（prefers-reduced-motion）が有効か。
 * 有効なら派手な演出（紙吹雪・フラッシュ）を省略する。
 * @type {boolean}
 */
const REDUCED_MOTION =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * スマートフォン相当の狭い画面か（背景・演出のマンゴー個数を減らす判定に使う）。
 * style.css のレスポンシブ境界（760px）と揃えている。
 * @returns {boolean} 狭い画面なら true
 */
function isSmallScreen() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 760px)").matches
  );
}

// =====================================================================
// Google Analytics（GA4）計測ヘルパー
//  - 送信は analytics.js が定義する window.gtag 経由。
//  - gtag が無い／失敗しても、ここで握りつぶしてガチャ本体は止めない。
// =====================================================================

/**
 * GA4 へカスタムイベントを安全に送る。
 * @param {string} name イベント名
 * @param {Object} [params] パラメータ
 * @returns {void}
 */
function trackEvent(name, params) {
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  } catch (_error) {
    // 計測失敗はガチャの動作に影響させない。
  }
}

/**
 * コレクションの集計（所持種類数・総数・達成率%）を返す。
 * @returns {{uniqueOwned: number, total: number, percent: number}}
 */
function getCollectionStats() {
  const collection = loadCollection();
  const total = MAHAJANGA_CARDS.length;
  const uniqueOwned = MAHAJANGA_CARDS.filter(
    (card) => (collection[card.id] ?? 0) > 0,
  ).length;
  const percent = total === 0 ? 0 : Math.round((uniqueOwned / total) * 100);
  return { uniqueOwned, total, percent };
}

/**
 * 全種コンプリート時に collection_complete を「初回1回だけ」送る。
 * localStorage のフラグで判定するため、再読み込みや追加ガチャでは再送しない。
 * @param {number} uniqueOwned 所持しているカード種類数
 * @param {number} total 総カード種類数（=41）
 * @returns {void}
 */
function maybeTrackComplete(uniqueOwned, total) {
  if (total === 0 || uniqueOwned < total) {
    return; // まだコンプリートしていない。
  }

  try {
    if (localStorage.getItem(STORAGE_KEYS.completeSent) === "1") {
      return; // 送信済み（重複送信しない）。
    }
    // 先にフラグを立て、何があっても二重送信を防ぐ。
    localStorage.setItem(STORAGE_KEYS.completeSent, "1");
  } catch (_error) {
    // localStorage が使えない環境では計測をあきらめる（ガチャは継続）。
    return;
  }

  const params = { total_cards: total };
  const draws = Number(localStorage.getItem(STORAGE_KEYS.drawCount));
  if (Number.isFinite(draws) && draws > 0) {
    params.total_draws = draws; // 取得できた場合のみ付ける。
  }
  params.completed_at = new Date().toISOString();

  trackEvent("collection_complete", params);
}

// ---------------- 画面の状態 ----------------

/** 現在選択中のレアリティ絞り込み。"ALL" は全表示。 */
let currentRarityFilter = "ALL";
/** 現在選択中の所持絞り込み。"ALL" / "OWNED" / "UNOWNED"。 */
let currentOwnedFilter = "ALL";
/** 結果欄に今表示しているカード（Xシェア用）。未表示なら null。 */
let currentResultCard = null;
/** ガチャ演出中フラグ（多重実行防止）。 */
let isDrawing = false;

// ---------------- DOM 参照 ----------------

const heroTitle = document.querySelector("#hero-title");
const heroSubtitle = document.querySelector("#hero-subtitle");
const heroFree = document.querySelector("#hero-free");
const heroDescription = document.querySelector("#hero-description");
const noticeText = document.querySelector("#notice-text");
const siteFooter = document.querySelector("#site-footer");

const drawButton = document.querySelector("#draw-button");
const drawStatus = document.querySelector("#draw-status");

const resultSection = document.querySelector("#result-section");
const resultClose = document.querySelector("#result-close");
const resultHeading = document.querySelector("#result-heading");
const resultCard = document.querySelector("#result-card");
const resultImage = document.querySelector("#result-image");
const resultPlaceholder = resultCard.querySelector(".photo-card__placeholder");
const resultRarity = document.querySelector("#result-rarity");
const resultName = document.querySelector("#result-name");
const resultNewBadge = document.querySelector("#result-new-badge");
const resultReaction = document.querySelector("#result-reaction");
const resultMessage = document.querySelector("#result-message");
const shareButton = document.querySelector("#share-button");
const saveButton = document.querySelector("#save-button");
const saveError = document.querySelector("#save-error");
const shareError = document.querySelector("#share-error");

const collectionGrid = document.querySelector("#collection-grid");
const collectionTitle = document.querySelector("#collection-title");
const collectionCount = document.querySelector("#collection-count");
const collectionEmpty = document.querySelector("#collection-empty");
const progressPercent = document.querySelector("#progress-percent");
const progressFill = document.querySelector("#progress-fill");
const rarityFilters = document.querySelector("#rarity-filters");
const ownedFilters = document.querySelector("#owned-filters");
const probabilityList = document.querySelector("#probability-list");

const revealDialog = document.querySelector("#reveal-dialog");
const revealTitle = document.querySelector("#reveal-title");

const detailDialog = document.querySelector("#detail-dialog");
const detailClose = document.querySelector("#detail-close");
const detailImage = document.querySelector("#detail-image");
const detailPlaceholder = document.querySelector("#detail-placeholder");
const detailRarity = document.querySelector("#detail-rarity");
const detailCount = document.querySelector("#detail-count");
const detailName = document.querySelector("#detail-name");
const detailDescription = document.querySelector("#detail-description");

// =====================================================================
// 汎用ユーティリティ
// =====================================================================

/**
 * 0以上1未満の乱数を返す。可能なら Web Crypto API を使う。
 * @returns {number} 0以上1未満の乱数
 */
function secureRandom() {
  if (window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    window.crypto.getRandomValues(buffer);
    return buffer[0] / 2 ** 32;
  }
  return Math.random();
}

/**
 * 配列からランダムに1要素を返す（演出文言用）。
 * @param {Array<*>} list 対象の配列
 * @returns {*} ランダムな要素（空配列なら ""）
 */
function randomFrom(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return "";
  }
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 要素のテキストを安全に設定する（要素や文言が無ければ何もしない）。
 * @param {HTMLElement|null} element 対象要素
 * @param {string} text 設定する文言
 * @returns {void}
 */
function setText(element, text) {
  if (element && typeof text === "string") {
    element.textContent = text;
  }
}

/**
 * カードの画像ファイル名から読み込み用URL（相対パス）を作る。
 * @param {string} fileName 画像ファイル名
 * @returns {string} 画像URL
 */
function buildImagePath(fileName) {
  return IMAGE_BASE_PATH + encodeURIComponent(fileName);
}

/**
 * カードIDからカードデータを取得する。
 * @param {string} cardId カードID
 * @returns {(import("./cards.js").Card)|undefined} 見つかったカード
 */
function findCardById(cardId) {
  return MAHAJANGA_CARDS.find((card) => card.id === cardId);
}

/**
 * レアリティに対応するCSSクラス名（例: "rarity--ssr"）を返す。
 * @param {string} rarity レアリティ
 * @returns {string} CSSクラス名
 */
function getRarityClass(rarity) {
  return `rarity--${rarity.toLowerCase()}`;
}

/**
 * 要素を生成するヘルパー。テキストは textContent で設定（XSS対策）。
 * @param {string} tag タグ名
 * @param {string} [className=""] クラス名
 * @param {string} [text=""] テキスト
 * @returns {HTMLElement} 生成した要素
 */
function createElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

// =====================================================================
// localStorage（保存）まわり
// =====================================================================

/**
 * 所持カード情報を読み込む。
 * @returns {Record<string, number>} カードID→所持枚数
 */
function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.collection);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("コレクション情報を読み込めませんでした。", error);
    return {};
  }
}

/**
 * 所持カード情報を保存する。
 * @param {Record<string, number>} collection 保存対象
 * @returns {void}
 */
function saveCollection(collection) {
  localStorage.setItem(STORAGE_KEYS.collection, JSON.stringify(collection));
}

/**
 * 「NEW」表示中のカードID一覧を読み込む。
 * @returns {Set<string>} NEW対象のカードID集合
 */
function loadNewCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.newCards);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (error) {
    console.warn("NEW情報を読み込めませんでした。", error);
    return new Set();
  }
}

/**
 * 「NEW」表示中のカードID一覧を保存する。
 * @param {Set<string>} newCards NEW対象のカードID集合
 * @returns {void}
 */
function saveNewCards(newCards) {
  localStorage.setItem(STORAGE_KEYS.newCards, JSON.stringify([...newCards]));
}

// =====================================================================
// 抽選ロジック
// =====================================================================

/**
 * 指定レアリティのカードから、weight に応じて1枚選ぶ。
 * @param {string} rarity レアリティ
 * @returns {(import("./cards.js").Card)} 抽選されたカード
 */
function selectCardByRarity(rarity) {
  const candidates = MAHAJANGA_CARDS.filter((card) => card.rarity === rarity);
  const totalWeight = candidates.reduce((sum, card) => sum + card.weight, 0);
  let randomValue = secureRandom() * totalWeight;

  for (const card of candidates) {
    randomValue -= card.weight;
    if (randomValue < 0) {
      return card;
    }
  }
  return candidates[candidates.length - 1];
}

/**
 * レアリティ提供割合（RARITY_RATES）に従ってカードを1枚抽選する。
 * @returns {(import("./cards.js").Card)} 抽選されたカード
 */
function drawCard() {
  const totalRate = RARITY_RATES.reduce((sum, item) => sum + item.rate, 0);
  const roll = secureRandom() * totalRate;
  let cumulative = 0;

  for (const setting of RARITY_RATES) {
    cumulative += setting.rate;
    if (roll < cumulative) {
      return selectCardByRarity(setting.rarity);
    }
  }
  return selectCardByRarity(RARITY_RATES[RARITY_RATES.length - 1].rarity);
}

/**
 * 直近で引いたカードを取得する。
 * @returns {(import("./cards.js").Card)|null} 見つからなければ null
 */
function getLastDrawnCard() {
  const lastCardId = localStorage.getItem(STORAGE_KEYS.lastCardId);
  return findCardById(lastCardId) ?? null;
}

// =====================================================================
// 画像の読み込み（エラープレースホルダー対応）
// =====================================================================

/**
 * <img> にカード画像を設定し、読み込み失敗時のみプレースホルダーを表示する。
 * NFC/NFD両方のファイル名を順に試し、成功時は必ずエラーを非表示へ戻す。
 *
 * @param {HTMLImageElement} imgEl 画像要素
 * @param {HTMLElement} placeholderEl プレースホルダー要素
 * @param {(import("./cards.js").Card)} card 対象カード
 * @returns {void}
 */
function setCardImage(imgEl, placeholderEl, card) {
  // 新しいカードを表示する前に、前回のエラー状態をリセットする。
  placeholderEl.hidden = true;
  imgEl.hidden = false;
  imgEl.alt = `${card.rarity}「${card.name}」のカード画像`;

  const candidates = [...new Set([
    buildImagePath(card.image.normalize("NFC")),
    buildImagePath(card.image.normalize("NFD")),
  ])];
  let attempt = 0;

  // 読み込み成功：画像を表示し、エラーは必ず非表示へ戻す。
  imgEl.onload = () => {
    imgEl.hidden = false;
    placeholderEl.hidden = true;
  };

  imgEl.onerror = () => {
    attempt += 1;
    if (attempt < candidates.length) {
      imgEl.src = candidates[attempt];
      return;
    }
    // すべて失敗したときだけプレースホルダーを表示。
    imgEl.hidden = true;
    placeholderEl.hidden = false;
  };

  imgEl.src = candidates[0];
}

// =====================================================================
// 抽選結果の表示（大きく・派手に・面白く）
// =====================================================================

/**
 * 抽選結果カードを画面に大きく表示する。
 *
 * @param {(import("./cards.js").Card)} card 表示対象カード
 * @param {boolean} [isNewDraw=false] 今回新たに引いた直後か（復元時は false）
 * @param {boolean} [isFirstObtain=false] 初めて獲得したカードか（NEW表示用）
 * @returns {void}
 */
function renderResult(card, isNewDraw = false, isFirstObtain = false) {
  currentResultCard = card;
  hideSaveError();
  hideShareError();

  const ownedCount = loadCollection()[card.id] ?? 0;

  resultCard.className = `photo-card photo-card--large ${getRarityClass(card.rarity)}`;
  resultRarity.textContent = card.rarity;
  resultRarity.className = `rarity-tag ${getRarityClass(card.rarity)}`;
  resultName.textContent = card.name;

  // NEWバッジは「今回引いて」「初めて獲得」したときだけ大きく表示。
  resultNewBadge.hidden = !(isNewDraw && isFirstObtain);

  // 大げさ見出し（復元時は落ち着いた見出し）。
  setText(resultHeading, isNewDraw ? randomFrom(SITE_CONFIG.resultHeadings) : "前回のカード🥭");

  // レアリティ別リアクション（毎回ランダム）。
  setText(resultReaction, randomFrom(SITE_CONFIG.rarityReactions?.[card.rarity]));

  // メッセージ：新規／重複／復元で出し分け。
  if (isNewDraw && isFirstObtain) {
    setText(resultMessage, SITE_CONFIG.newCardText);
  } else if (isNewDraw) {
    setText(resultMessage, `${randomFrom(SITE_CONFIG.dupeTexts)}（これで ×${ownedCount}枚）`);
  } else {
    setText(resultMessage, `所持 ×${ownedCount}枚`);
  }

  setCardImage(resultImage, resultPlaceholder, card);

  resultSection.hidden = false;

  if (isNewDraw) {
    resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => resultCard.focus(), 700);
  }
}

/**
 * 背景のマンゴー装飾を生成する。
 * 画面サイズに応じた個数を、ジッターを効かせたグリッドで画面全体へ分散配置し、
 * 大きさ・回転・透明度・色味・アニメ時間をランダムにする。
 * 表示のたびに呼び直しても重複しないよう、毎回中身を作り直す。
 * （.bg-decor は pointer-events: none / z-index: -1 を維持＝操作を妨げず最背面）
 * @returns {void}
 */
function renderBackgroundDecor() {
  const container = document.querySelector(".bg-decor");
  if (!container) {
    return;
  }
  container.replaceChildren(); // 二重生成・蓄積を防ぐ。

  // デスクトップは多め、スマホは操作の邪魔にならないよう少なめ。
  const count = isSmallScreen() ? 18 : 40;

  // 画面全体へ均等に散らすため、おおよその縦横比からグリッドの列数を決め、
  // 各セル内でランダムにずらす（純粋な乱数だと密集しやすいのを防ぐ）。
  const ratio = window.innerWidth / (window.innerHeight || 1) || 1;
  const cols = Math.max(1, Math.round(Math.sqrt(count * ratio)));
  const rows = Math.ceil(count / cols);
  const cellW = 100 / cols;
  const cellH = 100 / rows;

  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const span = createElement("span", "", "🥭");
    // セル内の 15%〜85% の範囲にランダム配置（端に寄りすぎないように）。
    span.style.left = `${cellW * (col + 0.15 + Math.random() * 0.7)}%`;
    span.style.top = `${cellH * (row + 0.15 + Math.random() * 0.7)}%`;
    span.style.fontSize = `${1.5 + Math.random() * 2.3}rem`;
    span.style.opacity = `${(0.3 + Math.random() * 0.25).toFixed(2)}`;
    span.style.transform = `rotate(${Math.round(Math.random() * 40 - 20)}deg)`;
    // 青マンゴー〜完熟まで色味をばらけさせる（ドロップシャドウは維持）。
    span.style.filter = `hue-rotate(${Math.round(Math.random() * 110 - 30)}deg) saturate(1.2) drop-shadow(0 4px 6px rgba(180, 90, 0, 0.25))`;
    span.style.animationDuration = `${(6 + Math.random() * 3).toFixed(1)}s`;
    span.style.animationDelay = `${(Math.random() * 2).toFixed(1)}s`;
    container.append(span);
  }
}

/**
 * カード出現の祝祭演出（紙吹雪・マンゴー降下・フラッシュ）を再生する。
 * レアリティが高いほど派手にする。prefers-reduced-motion時は何もしない。
 *
 * @param {string} rarity レアリティ（"N"/"R"/"SR"/"SSR"）
 * @returns {void}
 */
function celebrate(rarity) {
  if (REDUCED_MOTION) {
    return; // 動きを抑えたい人には激しい演出を出さない（＝演出数を0に簡略化）。
  }

  // 連続で引いても要素が蓄積しないよう、前回の演出オーバーレイが残っていれば消す。
  for (const old of document.querySelectorAll(".celebration")) {
    old.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "celebration";
  overlay.setAttribute("aria-hidden", "true");

  // 画面フラッシュ（SSRは虹色）。
  const flash = createElement("div", `celebration__flash celebration__flash--${rarity.toLowerCase()}`);
  overlay.append(flash);

  // レアリティごとの基本粒子数（レアほど派手）。これを増量倍率でスケールする。
  const baseCounts = { N: 12, R: 26, SR: 48, SSR: 90 };
  const emojiSets = {
    N: ["🥭"],
    R: ["🥭", "🌴", "🎉"],
    SR: ["🥭", "🌟", "🌴", "🎉"],
    SSR: ["🥭", "🌈", "🎉", "🌟", "🎊", "🌴"],
  };

  // デスクトップは約2倍に増量。スマホは重くならないよう控えめ＋上限でキャップ。
  const small = isSmallScreen();
  const factor = small ? 1.25 : 2;
  const cap = small ? 50 : 110;
  const count = Math.min(cap, Math.round((baseCounts[rarity] ?? 12) * factor));
  const emojis = emojiSets[rarity] ?? ["🥭"];

  for (let i = 0; i < count; i += 1) {
    const particle = createElement("span", "celebration__particle", emojis[Math.floor(Math.random() * emojis.length)]);
    // 開始位置を画面全幅にばらけさせ、中央だけに偏らないようにする。
    particle.style.left = `${Math.random() * 100}vw`;
    particle.style.fontSize = `${1.2 + Math.random() * 2.4}rem`;
    particle.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    particle.style.animationDelay = `${Math.random() * 0.6}s`;
    // 左右への流れ（ドリフト）を大きめにして左右に広がるようにする。
    particle.style.setProperty("--drift", `${Math.random() * 50 - 25}vw`);
    particle.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    overlay.append(particle);
  }

  document.body.append(overlay);
  // アニメーション終了後に必ず取り除く（DOMを残さない）。
  window.setTimeout(() => overlay.remove(), 4200);
}

// =====================================================================
// X共有・画像保存（基本仕様は維持）
// =====================================================================

/**
 * 文字列が最大長を超える場合、末尾を「…」にして省略する。
 * @param {string} text 元の文字列
 * @param {number} maxLength 最大文字数
 * @returns {string} 省略後の文字列
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * 投稿に含める公開URLを検証して返す。許可済みの固定URLと完全一致のみ採用。
 * @returns {string|null} 検証に通ったURL。不正なら null
 */
function getValidatedProductionUrl() {
  const configured = (SITE_CONFIG.productionUrl || "").trim();
  if (configured.startsWith("https://") && configured === ALLOWED_PRODUCTION_URL) {
    return configured;
  }
  return null;
}

/**
 * 共有エラーメッセージを表示する。
 * @param {string} message 表示する文言
 * @returns {void}
 */
function showShareError(message) {
  shareError.textContent = message;
  shareError.hidden = false;
}

/**
 * 共有エラーメッセージを隠す。
 * @returns {void}
 */
function hideShareError() {
  shareError.hidden = true;
  shareError.textContent = "";
}

/**
 * 指定カードのX投稿文を組み立てる。説明文は含めない。長い名前は省略する。
 * @param {(import("./cards.js").Card)} card 対象カード
 * @returns {string} 投稿本文
 */
function buildShareText(card) {
  const collection = loadCollection();
  const totalCards = MAHAJANGA_CARDS.length;
  const ownedKinds = MAHAJANGA_CARDS.filter(
    (item) => (collection[item.id] ?? 0) > 0,
  ).length;
  const ownedCount = collection[card.id] ?? 0;
  const name = truncateText(card.name, MAX_TWEET_NAME_LENGTH);

  let text =
    "旧マジャンガ州マンゴー研究ガチャで\n" +
    `「${name}」【${card.rarity}】を獲得しました！\n\n` +
    `現在のコレクション：${ownedKinds} / ${totalCards}枚`;

  if (ownedCount >= 2) {
    text += `\n所持枚数：${ownedCount}枚`;
  }

  // 陽気な一言（site-config.js の shareQuip）。設定されていれば添える。
  const quip = (SITE_CONFIG.shareQuip || "").trim();
  if (quip) {
    text += `\n${quip}`;
  }

  return text;
}

/**
 * 現在表示中のカードの抽選結果を X（旧Twitter）に投稿する。
 * Web Intent のみ使用。許可済みURL以外は共有を止めてエラー表示。
 * rel="noopener noreferrer" 付きリンクのクリックで新しいタブに開く。
 * @returns {void}
 */
function shareResultToX() {
  hideShareError();

  const card = currentResultCard ?? getLastDrawnCard();
  if (!card) {
    return;
  }

  const shareUrl = getValidatedProductionUrl();
  if (!shareUrl) {
    showShareError(
      "共有を中止しました。site-config.js の productionUrl を正しい公開URLに設定してください。",
    );
    return;
  }

  const intentUrl = new URL(X_INTENT_URL);
  intentUrl.search = new URLSearchParams({
    text: buildShareText(card),
    url: shareUrl,
    hashtags: SITE_CONFIG.hashtags.join(","),
  }).toString();

  const link = document.createElement("a");
  link.href = intentUrl.toString();
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * 画像保存エラーメッセージを表示する。
 * @param {string} message 表示する文言
 * @returns {void}
 */
function showSaveError(message) {
  saveError.textContent = message;
  saveError.hidden = false;
}

/**
 * 画像保存エラーメッセージを隠す。
 * @returns {void}
 */
function hideSaveError() {
  saveError.hidden = true;
  saveError.textContent = "";
}

/**
 * 画像URLを取得して Blob を返す。NFC/NFD両方のファイル名を試す。
 * @param {(import("./cards.js").Card)} card 対象カード
 * @returns {Promise<Blob|null>} 取得できた画像Blob。失敗時はnull
 */
async function fetchCardImageBlob(card) {
  const candidates = [...new Set([
    buildImagePath(card.image.normalize("NFC")),
    buildImagePath(card.image.normalize("NFD")),
  ])];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.blob();
      }
    } catch (error) {
      // 次の候補を試す。
    }
  }
  return null;
}

/**
 * 表示中の <img> を原解像度のまま canvas 経由で Blob 化する（fetch不可環境向け）。
 * @returns {Promise<Blob|null>} 生成したBlob。失敗時はnull
 */
function canvasCardImageBlob() {
  return new Promise((resolve) => {
    const img = resultImage;
    if (!img.complete || !img.naturalWidth) {
      resolve(null);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch (error) {
      resolve(null);
    }
  });
}

/**
 * 現在獲得しているカード画像を「mahajanga-{cardId}.png」形式で保存する。
 * 原解像度を維持し、外部ライブラリは使わない。失敗時はエラーを表示する。
 * @returns {Promise<void>}
 */
async function saveCardImage() {
  hideSaveError();
  const card = currentResultCard ?? getLastDrawnCard();
  if (!card) {
    return;
  }

  let blob = await fetchCardImageBlob(card);
  if (!blob) {
    blob = await canvasCardImageBlob();
  }
  if (!blob) {
    showSaveError("カード画像を保存できませんでした。画像の読み込みに失敗した可能性があります。");
    return;
  }

  // ファイル名は英数字・ハイフン・アンダースコアのみ。
  const safeId = card.id.replace(/[^A-Za-z0-9_-]/g, "") || "card";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `mahajanga-${safeId}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

// =====================================================================
// コレクション
// =====================================================================

/**
 * 現在の絞り込み条件にカードが合致するか判定する。
 * @param {(import("./cards.js").Card)} card 対象カード
 * @param {boolean} isOwned 獲得済みか
 * @returns {boolean} 表示してよければ true
 */
function matchesFilter(card, isOwned) {
  const rarityOk =
    currentRarityFilter === "ALL" || card.rarity === currentRarityFilter;
  const ownedOk =
    currentOwnedFilter === "ALL" ||
    (currentOwnedFilter === "OWNED" && isOwned) ||
    (currentOwnedFilter === "UNOWNED" && !isOwned);
  return rarityOk && ownedOk;
}

/**
 * 1枚分のコレクションカード要素を生成する（innerHTMLは使わない）。
 * @param {(import("./cards.js").Card)} card 対象カード
 * @param {number} ownedCount 所持枚数
 * @param {boolean} isNew NEWバッジを付けるか
 * @returns {HTMLElement} 生成したカード要素
 */
function createCollectionCard(card, ownedCount, isNew) {
  const isOwned = ownedCount > 0;
  const item = document.createElement(isOwned ? "button" : "div");
  item.className = [
    "collection-card",
    getRarityClass(card.rarity),
    isOwned ? "is-owned" : "is-locked",
  ].join(" ");

  if (isOwned) {
    item.type = "button";
    item.setAttribute("aria-label", `${card.rarity}「${card.name}」の詳細を開く`);
    item.dataset.cardId = card.id;
  } else {
    item.setAttribute("aria-label", "未獲得のカード");
  }

  if (isOwned) {
    if (isNew) {
      item.append(createElement("span", "new-badge", "NEW!"));
    }

    const count = createElement("span", "collection-card__count", `×${ownedCount}`);
    count.setAttribute("aria-label", "所持枚数");
    item.append(count);

    const frame = createElement("div", "photo-card__frame");
    const imgEl = createElement("img", "photo-card__image");
    imgEl.decoding = "async";
    const phEl = createElement("div", "photo-card__placeholder");
    phEl.hidden = true;
    phEl.append(createElement("span", "", "画像を読み込めませんでした"));
    frame.append(imgEl, phEl);
    item.append(frame);

    const caption = createElement("div", "collection-card__caption");
    caption.append(
      createElement("span", `rarity-tag ${getRarityClass(card.rarity)}`, card.rarity),
      createElement("span", "collection-card__name", card.name),
    );
    item.append(caption);

    setCardImage(imgEl, phEl, card);
  } else {
    // 未獲得：名前・画像を隠し、明るい南国風の裏面を表示。
    const frame = createElement("div", "photo-card__frame photo-card__frame--back");
    const mark = createElement("span", "card-back__mark", "？");
    mark.setAttribute("aria-hidden", "true");
    frame.append(mark);
    item.append(frame);

    const caption = createElement("div", "collection-card__caption");
    caption.append(
      createElement("span", "rarity-tag rarity-tag--hidden", "？？？"),
      createElement("span", "collection-card__name collection-card__name--hidden", T.lockedCard || "？？？"),
    );
    item.append(caption);
  }

  return item;
}

/**
 * 所持状況をもとにコレクション全体を描画する。
 * @returns {void}
 */
function renderCollection() {
  const collection = loadCollection();
  const newCards = loadNewCards();

  const { uniqueOwned: ownedTotal, total, percent } = getCollectionStats();

  // コンプリート率（達成率）の表示は維持する。
  collectionCount.textContent = `${ownedTotal} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;

  // 全種コンプリートの瞬間だけ GA に1回送る（フラグで重複送信を防止）。
  maybeTrackComplete(ownedTotal, total);

  collectionGrid.replaceChildren();
  let visibleCount = 0;

  for (const card of MAHAJANGA_CARDS) {
    const ownedCount = collection[card.id] ?? 0;
    const isOwned = ownedCount > 0;
    if (!matchesFilter(card, isOwned)) {
      continue;
    }
    const isNew = isOwned && newCards.has(card.id);
    collectionGrid.append(createCollectionCard(card, ownedCount, isNew));
    visibleCount += 1;
  }

  collectionEmpty.hidden = visibleCount > 0;
}

// =====================================================================
// カード詳細モーダル
// =====================================================================

/**
 * 指定カードの詳細モーダルを開く（獲得済みのみ）。開いたらNEWを解除。
 * @param {string} cardId カードID
 * @returns {void}
 */
function openDetail(cardId) {
  const card = findCardById(cardId);
  if (!card) {
    return;
  }

  const collection = loadCollection();
  const ownedCount = collection[card.id] ?? 0;
  if (ownedCount <= 0) {
    return;
  }

  detailRarity.textContent = card.rarity;
  detailRarity.className = `rarity-tag ${getRarityClass(card.rarity)}`;
  detailName.textContent = card.name;
  detailDescription.textContent = card.description;
  detailCount.textContent = `所持枚数 ×${ownedCount}`;
  setCardImage(detailImage, detailPlaceholder, card);

  const newCards = loadNewCards();
  if (newCards.delete(card.id)) {
    saveNewCards(newCards);
    renderCollection();
  }

  if (typeof detailDialog.showModal === "function") {
    detailDialog.showModal();
  } else {
    detailDialog.setAttribute("open", "");
  }
}

/**
 * カード詳細モーダルを閉じる。
 * @returns {void}
 */
function closeDetail() {
  detailDialog.close?.();
  detailDialog.removeAttribute("open");
}

// =====================================================================
// 提供割合の表示
// =====================================================================

/**
 * RARITY_RATES をもとに提供割合のリストを描画する。
 * @returns {void}
 */
function renderProbabilityList() {
  probabilityList.replaceChildren();

  for (const rarity of RARITY_ORDER) {
    const setting = RARITY_RATES.find((item) => item.rarity === rarity);
    if (!setting) {
      continue;
    }
    const row = createElement("div");
    row.append(createElement("span", `rarity-dot ${getRarityClass(rarity)}`));
    row.append(document.createTextNode(rarity));
    row.append(createElement("strong", "", `${setting.rate}%`));
    probabilityList.append(row);
  }
}

// =====================================================================
// ガチャの状態
// =====================================================================

/**
 * ボタンと状態表示を更新する。
 * 時間制限は廃止したので、演出中（多重クリック防止）以外は常に引ける。
 * @returns {void}
 */
function updateDrawAvailability() {
  // 演出中だけボタンを無効化（二重クリック防止）。終われば必ず再び押せる。
  drawButton.disabled = isDrawing;

  const buttonMain = drawButton.querySelector(".draw-button__main");

  setText(drawStatus, T.statusNoLimit);
  drawStatus.className = "status-value status-value--available";
  setText(buttonMain, T.drawButtonReady);
}

/**
 * 抽選演出ダイアログを表示し、指定時間後に閉じる。
 * @param {number} [duration=950] 表示時間（ミリ秒）
 * @returns {Promise<void>} 演出終了で解決する Promise
 */
function playRevealAnimation(duration = 950) {
  return new Promise((resolve) => {
    if (typeof revealDialog.showModal === "function") {
      revealDialog.showModal();
    } else {
      revealDialog.setAttribute("open", "");
    }
    window.setTimeout(() => {
      revealDialog.close?.();
      revealDialog.removeAttribute("open");
      resolve();
    }, duration);
  });
}

// =====================================================================
// ガチャ実行
// =====================================================================

/**
 * ガチャを実行し、結果と所持状況・NEW情報を保存する。
 * @returns {Promise<void>}
 */
async function handleDraw() {
  // 演出中のみ無視（二重クリック防止）。時間制限はないので何度でも引ける。
  if (isDrawing) {
    return;
  }

  isDrawing = true;
  updateDrawAvailability();

  await playRevealAnimation(REDUCED_MOTION ? 250 : 950);

  const card = drawCard();
  const collection = loadCollection();
  const previousCount = collection[card.id] ?? 0;
  const isFirstObtain = previousCount === 0;

  collection[card.id] = previousCount + 1;

  const newCards = loadNewCards();
  newCards.add(card.id);

  const newOwnedCount = collection[card.id];

  saveCollection(collection);
  saveNewCards(newCards);
  localStorage.setItem(STORAGE_KEYS.lastCardId, card.id);

  // 累計抽選回数を加算（コンプリート計測の total_draws 用）。
  let totalDraws = Number(localStorage.getItem(STORAGE_KEYS.drawCount));
  totalDraws = (Number.isFinite(totalDraws) ? totalDraws : 0) + 1;
  localStorage.setItem(STORAGE_KEYS.drawCount, String(totalDraws));

  // 抽選結果が確定したこの時点で gacha_draw を1回だけ送信する。
  // （ボタン押下時ではなく確定後。演出やrenderの再実行では送らない＝1抽選1回）
  trackEvent("gacha_draw", {
    card_id: card.id,
    card_name: card.name,
    rarity: card.rarity,
    is_new: isFirstObtain,
    owned_count: newOwnedCount,
  });

  isDrawing = false;
  renderResult(card, true, isFirstObtain);
  celebrate(card.rarity);
  renderCollection();
  updateDrawAvailability();
}

// =====================================================================
// イベント登録・初期化
// =====================================================================

/**
 * site-config.js の文言を画面へ反映する。
 * @returns {void}
 */
function applySiteText() {
  if (typeof T.browserTitle === "string" && T.browserTitle) {
    document.title = T.browserTitle;
  }
  setText(heroTitle, T.mainTitle);
  setText(heroSubtitle, T.subtitle);
  setText(heroFree, T.freeText);
  setText(heroDescription, T.introText);
  setText(noticeText, T.notice);
  setText(collectionTitle, T.collectionHeading);
  setText(siteFooter, T.footer);
  setText(revealTitle, T.revealing);
}

/**
 * 絞り込みボタンの動作を設定する。
 * @returns {void}
 */
function setupFilters() {
  rarityFilters.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-button");
    if (!button) {
      return;
    }
    currentRarityFilter = button.dataset.rarity;
    for (const el of rarityFilters.querySelectorAll(".filter-button")) {
      el.classList.toggle("is-active", el === button);
    }
    renderCollection();
  });

  ownedFilters.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-button");
    if (!button) {
      return;
    }
    currentOwnedFilter = button.dataset.owned;
    for (const el of ownedFilters.querySelectorAll(".filter-button")) {
      el.classList.toggle("is-active", el === button);
    }
    renderCollection();
  });
}

/**
 * コレクション内の獲得済みカードクリックで詳細モーダルを開く。
 * @returns {void}
 */
function setupCollectionInteraction() {
  collectionGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".collection-card.is-owned");
    if (card?.dataset.cardId) {
      openDetail(card.dataset.cardId);
    }
  });
}

/**
 * 詳細モーダルの閉じる操作（ボタン・背景クリック）を設定する。
 * @returns {void}
 */
function setupDetailDialog() {
  detailClose.addEventListener("click", closeDetail);
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
      closeDetail();
    }
  });
}

/**
 * アプリ初期化処理。
 * @returns {void}
 */
function initializeApp() {
  // 時間制限は廃止。古い last-draw-time が残っていても掃除するだけ（他データは消さない）。
  try {
    localStorage.removeItem(LEGACY_LAST_DRAW_TIME_KEY);
  } catch (_error) {
    /* localStorage が使えない環境でも初期化は続行する。 */
  }

  applySiteText();
  renderBackgroundDecor();
  renderProbabilityList();
  renderCollection();
  updateDrawAvailability();

  // 図鑑（コレクション）はページ表示時から見えているため、表示時に1回送る。
  const stats = getCollectionStats();
  trackEvent("collection_view", {
    unique_cards: stats.uniqueOwned,
    total_cards: stats.total,
    completion_rate: stats.percent,
  });

  // 直近に引いたカードがあれば、演出なしで復元表示する（X共有も可能なまま）。
  const lastCard = getLastDrawnCard();
  if (lastCard) {
    renderResult(lastCard, false, false);
  }

  setupFilters();
  setupCollectionInteraction();
  setupDetailDialog();

  drawButton.addEventListener("click", handleDraw);
  shareButton.addEventListener("click", shareResultToX);
  saveButton.addEventListener("click", saveCardImage);
  resultClose.addEventListener("click", () => {
    resultSection.hidden = true;
  });

  // 画面サイズ変更（回転含む）時は背景マンゴーを配置し直す（連続発火は間引く）。
  let decorResizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(decorResizeTimer);
    decorResizeTimer = window.setTimeout(renderBackgroundDecor, 250);
  });
}

// 初期化中に想定外のエラーが起きても、原因が分かるよう必ずコンソールへ出す。
try {
  if (typeof MAHAJANGA_CARDS === "undefined") {
    throw new Error(
      "カードデータ(MAHAJANGA_CARDS)が読み込まれていません。index.htmlで cards.js を script.js より先に読み込んでいるか確認してください。",
    );
  }
  initializeApp();
} catch (error) {
  console.error("初期化に失敗しました:", error);
}
