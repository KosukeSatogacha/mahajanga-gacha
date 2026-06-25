"use strict";

/* =====================================================================
 * 旧マジャンガ州ガチャ — メインスクリプト
 * ---------------------------------------------------------------------
 * カードデータ（MAHAJANGA_CARDS / RARITY_RATES）は cards.js で定義し、
 * index.html で cards.js → script.js の順に読み込んでいます。
 * ===================================================================== */

/**
 * カード画像が置かれているフォルダ（GitHub Pages でも動く相対パス）。
 * @type {string}
 */
const IMAGE_BASE_PATH = "./assets/cards/";

/**
 * localStorage のキー一覧。
 * 旧 daily-gacha と混ざらないよう、すべて "mahajanga-gacha:" で始める。
 * @type {Record<string, string>}
 */
const STORAGE_KEYS = {
  lastDrawDate: "mahajanga-gacha:last-draw-date",
  lastCardId: "mahajanga-gacha:last-card-id",
  collection: "mahajanga-gacha:collection",
  newCards: "mahajanga-gacha:new-cards",
};

/**
 * レアリティ表示順（提供割合の表示やソートに使用）。
 * @type {Array<"SSR"|"SR"|"R"|"N">}
 */
const RARITY_ORDER = ["SSR", "SR", "R", "N"];

/**
 * X投稿文に載せるカード名の最大文字数。
 * これを超える長いカード名は末尾を「…」で省略し、文字数上限超過を防ぐ。
 * @type {number}
 */
const MAX_TWEET_NAME_LENGTH = 40;

/**
 * X Web Intent のエンドポイント。
 * @type {string}
 */
const X_INTENT_URL = "https://twitter.com/intent/tweet";

/**
 * 投稿に含めることを許可する唯一の本番URL（固定）。
 * site-config.js の productionUrl がこの値と完全一致しない場合は共有を停止する。
 * @type {string}
 */
const ALLOWED_PRODUCTION_URL = "https://KosukeSatogacha.github.io/mahajanga-gacha/";

// ---------------- 画面の状態（絞り込み） ----------------

/** 現在選択中のレアリティ絞り込み。"ALL" は全表示。 */
let currentRarityFilter = "ALL";
/** 現在選択中の所持絞り込み。"ALL" / "OWNED" / "UNOWNED"。 */
let currentOwnedFilter = "ALL";
/** 結果欄に今表示しているカード（Xシェア用）。未表示なら null。 */
let currentResultCard = null;

// ---------------- DOM 参照 ----------------

const drawButton = document.querySelector("#draw-button");
const drawStatus = document.querySelector("#draw-status");
const countdown = document.querySelector("#countdown");

const resultSection = document.querySelector("#result-section");
const resultCard = document.querySelector("#result-card");
const resultImage = document.querySelector("#result-image");
const resultPlaceholder = resultCard.querySelector(".photo-card__placeholder");
const resultRarity = document.querySelector("#result-rarity");
const resultName = document.querySelector("#result-name");
const resultNewBadge = document.querySelector("#result-new-badge");
const resultMessage = document.querySelector("#result-message");
const shareButton = document.querySelector("#share-button");
const saveButton = document.querySelector("#save-button");
const saveError = document.querySelector("#save-error");
const shareError = document.querySelector("#share-error");

const collectionGrid = document.querySelector("#collection-grid");
const collectionCount = document.querySelector("#collection-count");
const collectionEmpty = document.querySelector("#collection-empty");
const progressPercent = document.querySelector("#progress-percent");
const progressFill = document.querySelector("#progress-fill");
const rarityFilters = document.querySelector("#rarity-filters");
const ownedFilters = document.querySelector("#owned-filters");
const probabilityList = document.querySelector("#probability-list");

const revealDialog = document.querySelector("#reveal-dialog");

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
 * 現在の端末時刻を「YYYY-MM-DD」形式で返す（ローカル日付）。
 *
 * @param {Date} [date=new Date()] 対象日時
 * @returns {string} ローカル日付
 *
 * @example
 * getLocalDateKey(new Date(2026, 5, 25)); // "2026-06-25"
 */
function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 0以上1未満の乱数を返す。
 * 利用可能なら Web Crypto API を使い、偏りを減らす。
 *
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
 * カードの画像ファイル名から、読み込み用のURL（相対パス）を作る。
 * 日本語や記号を含むファイル名でも安全に読み込めるよう encodeURIComponent でエンコードする。
 *
 * @param {string} fileName 画像ファイル名（例: "ディエゴ.png"）
 * @returns {string} 画像URL（例: "./assets/cards/%E3%83%87..."）
 */
function buildImagePath(fileName) {
  return IMAGE_BASE_PATH + encodeURIComponent(fileName);
}

/**
 * カードIDからカードデータを取得する。
 *
 * @param {string} cardId カードID
 * @returns {(import("./cards.js").Card)|undefined} 見つかったカード
 */
function findCardById(cardId) {
  return MAHAJANGA_CARDS.find((card) => card.id === cardId);
}

/**
 * レアリティに対応するCSSクラス名（例: "rarity--ssr"）を返す。
 *
 * @param {string} rarity レアリティ
 * @returns {string} CSSクラス名
 */
function getRarityClass(rarity) {
  return `rarity--${rarity.toLowerCase()}`;
}

/**
 * 要素を生成するヘルパー。
 * テキストは textContent で設定するため、HTML記号があっても実行されない（XSS対策）。
 *
 * @param {string} tag タグ名
 * @param {string} [className=""] クラス名
 * @param {string} [text=""] テキスト（textContentとして設定）
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
 *
 * @returns {Record<string, number>} カードIDをキー、所持枚数を値とするオブジェクト
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
 *
 * @param {Record<string, number>} collection 保存対象
 * @returns {void}
 */
function saveCollection(collection) {
  localStorage.setItem(STORAGE_KEYS.collection, JSON.stringify(collection));
}

/**
 * 「NEW」表示中のカードID一覧を読み込む。
 *
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
 *
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
 *
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
 *
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
  // 端数対策のフォールバック。
  return selectCardByRarity(RARITY_RATES[RARITY_RATES.length - 1].rarity);
}

/**
 * 本日すでにガチャを引いたか確認する。
 *
 * @returns {boolean} 本日抽選済みなら true
 */
function hasDrawnToday() {
  return localStorage.getItem(STORAGE_KEYS.lastDrawDate) === getLocalDateKey();
}

/**
 * 直近で引いたカードを取得する。
 *
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
 * <img> にカード画像を設定し、読み込み失敗時はプレースホルダーを表示する。
 *
 * ファイル名のUnicode正規化（NFC/NFD）の違いで読み込みに失敗する環境に備え、
 * 1度目の失敗時はもう一方の正規化形でリトライしてから諦める。
 *
 * @param {HTMLImageElement} imgEl 画像要素
 * @param {HTMLElement} placeholderEl 失敗時に表示するプレースホルダー要素
 * @param {(import("./cards.js").Card)} card 対象カード
 * @returns {void}
 */
function setCardImage(imgEl, placeholderEl, card) {
  placeholderEl.hidden = true;
  imgEl.hidden = false;
  imgEl.alt = `${card.rarity}「${card.name}」のカード画像`;

  // 試す候補（重複は除外）：NFC形 → NFD形。
  const candidates = [...new Set([
    buildImagePath(card.image.normalize("NFC")),
    buildImagePath(card.image.normalize("NFD")),
  ])];
  let attempt = 0;

  imgEl.onerror = () => {
    attempt += 1;
    if (attempt < candidates.length) {
      imgEl.src = candidates[attempt];
      return;
    }
    // すべて失敗したらプレースホルダーを表示。
    imgEl.hidden = true;
    placeholderEl.hidden = false;
  };
  imgEl.src = candidates[0];
}

// =====================================================================
// 抽選結果の表示
// =====================================================================

/**
 * 抽選結果カードを画面に表示する。
 *
 * @param {(import("./cards.js").Card)} card 表示対象カード
 * @param {boolean} [isNewDraw=false] 今回新たに引いた直後か
 * @param {boolean} [isFirstObtain=false] 初めて獲得したカードか（NEW表示用）
 * @returns {void}
 */
function renderResult(card, isNewDraw = false, isFirstObtain = false) {
  currentResultCard = card;
  hideSaveError();
  hideShareError();
  resultCard.className = `photo-card photo-card--large ${getRarityClass(card.rarity)}`;
  resultRarity.textContent = card.rarity;
  resultRarity.className = `rarity-tag ${getRarityClass(card.rarity)}`;
  resultName.textContent = card.name;
  resultNewBadge.hidden = !isFirstObtain;

  setCardImage(resultImage, resultPlaceholder, card);

  resultMessage.textContent = isNewDraw
    ? `${card.rarity}「${card.name}」を獲得しました。`
    : "本日獲得したカードです。";

  resultSection.hidden = false;

  if (isNewDraw) {
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => resultCard.focus(), 750);
  }
}

/**
 * 文字列が最大長を超える場合、末尾を「…」にして省略する。
 *
 * @param {string} text 元の文字列
 * @param {number} maxLength 最大文字数
 * @returns {string} 省略後の文字列
 *
 * @example
 * truncateText("あいうえお", 3); // "あい…"
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * 投稿に含める公開URLを検証して返す。
 * 許可済みの固定URL（ALLOWED_PRODUCTION_URL）と完全一致する場合のみ採用する。
 * 一致しない場合（未設定・localhost・別URL等）は null を返し、共有処理を止める。
 *
 * @returns {string|null} 検証に通ったURL。不正なら null
 */
function getValidatedProductionUrl() {
  const configured = (SITE_CONFIG.productionUrl || "").trim();
  // https:// で始まり、かつ許可済みURLと完全一致するときだけ許可する。
  if (configured.startsWith("https://") && configured === ALLOWED_PRODUCTION_URL) {
    return configured;
  }
  return null;
}

/**
 * 共有エラーメッセージを表示する。
 *
 * @param {string} message 表示する文言
 * @returns {void}
 */
function showShareError(message) {
  shareError.textContent = message;
  shareError.hidden = false;
}

/**
 * 共有エラーメッセージを隠す。
 *
 * @returns {void}
 */
function hideShareError() {
  shareError.hidden = true;
  shareError.textContent = "";
}

/**
 * 指定カードのX投稿文を組み立てる。
 * 仕様により、カードの説明文は含めない。長すぎるカード名は省略する。
 *
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
    "旧マジャンガ州カードガチャで\n" +
    `「${name}」【${card.rarity}】を獲得しました！\n\n` +
    `現在のコレクション：${ownedKinds} / ${totalCards}枚`;

  // 同じカードを2枚以上持っている場合のみ、所持枚数を添える。
  if (ownedCount >= 2) {
    text += `\n所持枚数：${ownedCount}枚`;
  }

  return text;
}

/**
 * 現在表示中のカードの抽選結果を X（旧Twitter）に投稿する。
 * 共有ボタンのクリックイベントから直接呼ばれる。
 *
 * セキュリティ方針：
 * - X API や認証情報は一切使わず、利用者が投稿画面で確認して投稿する Web Intent のみ。
 * - URL と URLSearchParams で投稿URLを組み立てる（文字列連結しない）。
 * - 外部URLは rel="noopener noreferrer" 付きリンクのクリックで新しいタブに開く。
 *   （window.open の戻り値での成否判定や、同タブへのフォールバックは行わない）
 * - 投稿に含めるURLは許可済みの固定URLのみ（localhost等は投稿しない）。
 *
 * @returns {void}
 */
function shareResultToX() {
  hideShareError();

  // 表示中のカードが無ければ、直近に引いたカードで代替する。
  const card = currentResultCard ?? getLastDrawnCard();
  if (!card) {
    return;
  }

  // 公開URLを検証。許可済みURLでなければ共有を停止してエラー表示。
  const shareUrl = getValidatedProductionUrl();
  if (!shareUrl) {
    showShareError(
      "共有を中止しました。site-config.js の productionUrl を正しい公開URLに設定してください。",
    );
    return;
  }

  // URL と URLSearchParams で安全に組み立てる（文字列連結はしない）。
  const intentUrl = new URL(X_INTENT_URL);
  intentUrl.search = new URLSearchParams({
    text: buildShareText(card),
    url: shareUrl,
    hashtags: SITE_CONFIG.hashtags.join(","),
  }).toString();

  // rel="noopener noreferrer" 付きのリンクをクリックして新しいタブで開く。
  // これにより X 側から window.opener で元ページを参照できない。
  // 戻り値の判定や同タブ遷移は行わない（投稿画面は1回だけ開く）。
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
 *
 * @param {string} message 表示する文言
 * @returns {void}
 */
function showSaveError(message) {
  saveError.textContent = message;
  saveError.hidden = false;
}

/**
 * 画像保存エラーメッセージを隠す。
 *
 * @returns {void}
 */
function hideSaveError() {
  saveError.hidden = true;
  saveError.textContent = "";
}

/**
 * 画像URLを取得して Blob を返す。NFC/NFD両方のファイル名を試す。
 *
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
 * 表示中のカードに対応する <img> 要素を、原解像度のままcanvas経由でBlob化する。
 * fetch が使えない環境（file:// など）向けのフォールバック。
 *
 * @returns {Promise<Blob|null>} 生成したBlob。失敗時はnull
 */
function canvasCardImageBlob() {
  return new Promise((resolve) => {
    const img = resultImage;
    // 画像が読み込めていなければ失敗扱い。
    if (!img.complete || !img.naturalWidth) {
      resolve(null);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      // 原解像度（naturalWidth/Height）を維持する。
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch (error) {
      // 画像がクロスオリジンでcanvasが汚染された場合など。
      resolve(null);
    }
  });
}

/**
 * 現在獲得しているカード画像を「mahajanga-{cardId}.png」形式で保存する。
 * 原解像度を維持し、外部ライブラリは使わない。失敗時はエラーを表示する。
 *
 * @returns {Promise<void>}
 */
async function saveCardImage() {
  hideSaveError();
  const card = currentResultCard ?? getLastDrawnCard();
  if (!card) {
    return;
  }

  // まず fetch で元画像をそのまま取得（解像度・画質を完全維持）。
  // 失敗したら canvas で書き出す。どちらも駄目ならエラー表示。
  let blob = await fetchCardImageBlob(card);
  if (!blob) {
    blob = await canvasCardImageBlob();
  }
  if (!blob) {
    showSaveError("カード画像を保存できませんでした。画像の読み込みに失敗した可能性があります。");
    return;
  }

  // ファイル名には英数字・ハイフン・アンダースコア以外を使わない（不正な文字を除去）。
  const safeId = card.id.replace(/[^A-Za-z0-9_-]/g, "") || "card";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `mahajanga-${safeId}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // メモリ解放。
  URL.revokeObjectURL(objectUrl);
}

// =====================================================================
// コレクション（図鑑）の表示
// =====================================================================

/**
 * 現在の絞り込み条件にカードが合致するか判定する。
 *
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
 * 1枚分のコレクションカード要素を生成する。
 *
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
    item.setAttribute("aria-hidden", "false");
    item.setAttribute("aria-label", "未獲得のカード");
  }

  if (isOwned) {
    // 獲得済み：カラー画像＋名前＋所持枚数＋（必要なら）NEWバッジ。
    // すべて createElement / textContent で組み立て、innerHTML は使わない。
    if (isNew) {
      item.append(createElement("span", "new-badge", "NEW"));
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

    // 画像のsrcはonerrorを効かせるため要素生成後に設定する。
    setCardImage(imgEl, phEl, card);
  } else {
    // 未獲得：名前・画像を隠し、カード裏面（シルエット）を表示。
    const frame = createElement("div", "photo-card__frame photo-card__frame--back");
    const mark = createElement("span", "card-back__mark", "？");
    mark.setAttribute("aria-hidden", "true");
    frame.append(mark);
    item.append(frame);

    const caption = createElement("div", "collection-card__caption");
    caption.append(
      createElement("span", "rarity-tag rarity-tag--hidden", "？？？"),
      createElement("span", "collection-card__name collection-card__name--hidden", "？？？"),
    );
    item.append(caption);
  }

  return item;
}

/**
 * 所持状況をもとにコレクション（図鑑）全体を描画する。
 *
 * @returns {void}
 */
function renderCollection() {
  const collection = loadCollection();
  const newCards = loadNewCards();

  const ownedTotal = MAHAJANGA_CARDS.filter(
    (card) => (collection[card.id] ?? 0) > 0,
  ).length;
  const total = MAHAJANGA_CARDS.length;
  const percent = total === 0 ? 0 : Math.round((ownedTotal / total) * 100);

  // 統計表示。
  collectionCount.textContent = `${ownedTotal} / ${total}`;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;

  // グリッド描画。
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
 * 指定カードの詳細モーダルを開く。
 * 獲得済みカードのみ呼ばれる想定。開いたカードはNEW表示を解除する。
 *
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
    return; // 念のため：未獲得カードは開かない。
  }

  detailRarity.textContent = card.rarity;
  detailRarity.className = `rarity-tag ${getRarityClass(card.rarity)}`;
  detailName.textContent = card.name;
  detailDescription.textContent = card.description;
  detailCount.textContent = `所持枚数 ×${ownedCount}`;
  setCardImage(detailImage, detailPlaceholder, card);

  // NEW表示を解除して保存・再描画。
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
 *
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
 * RARITY_RATES をもとに、提供割合のリストを描画する。
 *
 * @returns {void}
 */
function renderProbabilityList() {
  probabilityList.replaceChildren();

  for (const rarity of RARITY_ORDER) {
    const setting = RARITY_RATES.find((item) => item.rarity === rarity);
    if (!setting) {
      continue;
    }
    // innerHTML を使わず要素を組み立てる。
    const row = createElement("div");
    row.append(createElement("span", `rarity-dot ${getRarityClass(rarity)}`));
    row.append(document.createTextNode(rarity));
    row.append(createElement("strong", "", `${setting.rate}%`));
    probabilityList.append(row);
  }
}

// =====================================================================
// ガチャの状態・カウントダウン
// =====================================================================

/**
 * その日の抽選可否に合わせてボタンと状態表示を更新する。
 *
 * @returns {void}
 */
function updateDrawAvailability() {
  const drawn = hasDrawnToday();
  const buttonMain = drawButton.querySelector(".draw-button__main");
  const buttonSub = drawButton.querySelector(".draw-button__sub");

  drawButton.disabled = drawn;
  drawStatus.textContent = drawn ? "本日は抽選済みです" : "抽選できます";
  drawStatus.className = `status-value ${
    drawn ? "status-value--used" : "status-value--available"
  }`;
  buttonMain.textContent = drawn ? "本日のガチャは終了" : "ガチャを引く";
  buttonSub.textContent = drawn ? "明日また引けます" : "本日あと1回";
}

/**
 * 翌日の0時までの残り時間を更新する。
 *
 * @returns {void}
 */
function updateCountdown() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0,
  );
  const difference = Math.max(0, nextMidnight.getTime() - now.getTime());

  const totalSeconds = Math.floor(difference / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  countdown.textContent = `${hours}:${minutes}:${seconds}`;

  // 日付が変わった直後に抽選可否を再評価する。
  if (difference < 1000) {
    updateDrawAvailability();
  }
}

/**
 * 抽選演出を表示し、指定時間後に閉じる。
 *
 * @param {number} [duration=1400] 表示時間（ミリ秒）
 * @returns {Promise<void>} 演出終了で解決する Promise
 */
function playRevealAnimation(duration = 1400) {
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
 *
 * @returns {Promise<void>}
 */
async function handleDraw() {
  // 多重クリックや日付判定の競合を防ぐため、実行直後にボタンを無効化する。
  if (hasDrawnToday() || drawButton.disabled) {
    updateDrawAvailability();
    return;
  }

  drawButton.disabled = true;
  await playRevealAnimation();

  const card = drawCard();
  const collection = loadCollection();
  const previousCount = collection[card.id] ?? 0;
  const isFirstObtain = previousCount === 0;

  // 同じカードなら所持枚数を増やす。
  collection[card.id] = previousCount + 1;

  // NEW対象に追加。
  const newCards = loadNewCards();
  newCards.add(card.id);

  // 抽選結果・日付・所持・NEWをまとめて保存する。
  saveCollection(collection);
  saveNewCards(newCards);
  localStorage.setItem(STORAGE_KEYS.lastDrawDate, getLocalDateKey());
  localStorage.setItem(STORAGE_KEYS.lastCardId, card.id);

  renderResult(card, true, isFirstObtain);
  renderCollection();
  updateDrawAvailability();
}

// =====================================================================
// イベント登録・初期化
// =====================================================================

/**
 * レアリティ／所持の絞り込みボタンの動作を設定する。
 *
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
 *
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
 * 詳細モーダルの閉じる操作（ボタン・背景クリック・Escape）を設定する。
 *
 * @returns {void}
 */
function setupDetailDialog() {
  detailClose.addEventListener("click", closeDetail);

  // 背景（ダイアログ余白）クリックで閉じる。
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
      closeDetail();
    }
  });
}

/**
 * アプリ初期化処理。
 *
 * @returns {void}
 */
function initializeApp() {
  renderProbabilityList();
  renderCollection();
  updateDrawAvailability();
  updateCountdown();

  // 本日すでに引いていれば、その結果を再表示する。
  const lastCard = getLastDrawnCard();
  if (hasDrawnToday() && lastCard) {
    const collection = loadCollection();
    const isFirstObtain = (collection[lastCard.id] ?? 0) <= 1;
    renderResult(lastCard, false, isFirstObtain);
  }

  setupFilters();
  setupCollectionInteraction();
  setupDetailDialog();

  drawButton.addEventListener("click", handleDraw);
  shareButton.addEventListener("click", shareResultToX);
  saveButton.addEventListener("click", saveCardImage);
  window.setInterval(updateCountdown, 1000);
}

initializeApp();
