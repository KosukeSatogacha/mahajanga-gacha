"use strict";

/* =====================================================================
 * Google Analytics 4（gtag.js）の初期化
 * ---------------------------------------------------------------------
 * ・計測ID：G-3YSDL55SS9
 * ・ライブラリ本体（gtag/js）は index.html の
 *     <script async src="https://www.googletagmanager.com/gtag/js?id=...">
 *   で非同期に読み込む。このファイルは dataLayer と gtag() を定義し、
 *   config を1回だけ呼んで標準の page_view を有効にする。
 *
 * ・このファイルは自オリジン（'self'）なので、広告ブロッカー等で
 *   googletagmanager.com 側がブロックされても必ず実行される。
 *   その場合 window.gtag は「dataLayer に push するだけ」の関数として
 *   存在し続けるため、呼び出しても例外を投げない＝ガチャ本体は無事。
 *
 * ・page_view は config が自動送信する。手動では送らない（重複防止）。
 * ===================================================================== */

window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

// 明示的に window へ載せておく（script.js 側は window.gtag を参照する）。
window.gtag = gtag;

gtag("js", new Date());
gtag("config", "G-3YSDL55SS9");
