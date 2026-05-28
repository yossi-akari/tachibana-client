// 立花証券 e支店 API クライアント — TypeScript 型定義
// 利用側（JS/TS）でエディタ補完を有効にするための手書き .d.ts
// ※ このファイルは src/ 実装から手動で起こしたもの。実装と乖離したら src/ を正とする。

// ─── APIバージョン ───────────────────────────────────────────────────────────

/** 現在サポートするAPIバージョン。環境変数 TACHIBANA_API_VERSION で切替可能 */
export type TachibanaApiVersion = "v4r8" | "v4r9";

// ─── client.js ───────────────────────────────────────────────────────────────

/**
 * 現在使用するAPIバージョンを返す
 * 環境変数 TACHIBANA_API_VERSION が "v4r8" | "v4r9" でなければ "v4r8" にフォールバック
 */
export function getCurrentVersion(): TachibanaApiVersion;

/**
 * 立花証券APIのベースURLを返す
 * @param demo - true のときデモ環境URL、false（省略時）で本番URL
 */
export function getBaseUrl(demo?: boolean): string;

/**
 * 立花証券APIの認証URLを返す（ベースURL + "auth/"）
 * @param demo - true のときデモ環境URL、false（省略時）で本番URL
 */
export function getAuthUrl(demo?: boolean): string;

/**
 * 立花証券API用の日時文字列を生成する（常にJST: "YYYY.MM.DD-HH:mm:ss.SSS"）
 * @param date - 省略時は現在時刻
 */
export function formatTachibanaDate(date?: Date): string;

/** 数値キーID → 名前付きキーのマッピング。未知のキーはそのまま保持される */
export type ResponseKeyMap = Record<string, string>;

/**
 * 現在のAPIバージョンに合わせたレスポンスキーマップを返す
 * v4r9 では仮想URLキーが 1 つシフトし sUrlEventWebSocket が追加される
 */
export function getResponseKeyMap(): ResponseKeyMap;

/**
 * レスポンスの数値キーを名前付きキーに再帰的に変換する
 * 配列・ネストしたオブジェクトにも対応
 * @param value - 変換対象（オブジェクト／配列／プリミティブ）
 * @param keyMap - 省略時は現在のAPIバージョンから自動決定
 */
export function mapResponseKeys(value: unknown, keyMap?: ResponseKeyMap): unknown;

// ─── セッション暗号化 / 復号 ─────────────────────────────────────────────────

/**
 * encryptSession に渡すセッションデータの形
 * JSDoc（実装）には sUrlEventWebSocket / sUrlEventWs は含まれていないが、
 * 利用側で任意フィールドを追加しても JSON.stringify されるだけなので余分フィールドを許容する
 */
export interface SessionData {
  sUrlRequest: string;
  sUrlMaster: string;
  sUrlPrice: string;
  sUrlEvent: string;
  /** v4r8 のみ存在 */
  sUrlEventWs?: string;
  /** v4r9 のみ存在 */
  sUrlEventWebSocket?: string;
  demo: boolean;
  /** その他任意フィールドも受け入れる */
  [key: string]: unknown;
}

/**
 * 仮想URL群をAES-256-GCMで暗号化してsessionIdを生成する
 * @param sessionData - 暗号化するセッションデータ
 * @returns Base64url エンコードされた sessionId 文字列
 */
export function encryptSession(sessionData: SessionData): string;

/**
 * sessionIdを復号して仮想URL群を取得する
 * @param sessionId - encryptSession が返した Base64url 文字列
 * @returns SessionData オブジェクト
 */
export function decryptSession(sessionId: string): SessionData;

// ─── API通信 ─────────────────────────────────────────────────────────────────

/**
 * 立花証券APIにPOSTし、Shift-JIS→UTF-8変換と数値キー変換まで行う
 * sResultCode のチェックはしない（loginV4r8/loginV4r9 がエラー判定を持つため）
 * @param url - 送信先URL（認証URL または仮想URL）
 * @param params - リクエストボディ（sCLMID, p_no, p_sd_date 等）
 * @returns 名前付きキーに変換済みのレスポンスオブジェクト
 */
export function fetchTachibanaApi(
  url: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>>;

/**
 * 立花証券APIにリクエストを送信する（sResultCode 自動チェック付き）
 * p_no と p_sd_date を自動付与する（params で明示指定すれば上書き可能）
 * sResultCode が "0" 以外の場合は Error を throw する
 * @param url - 送信先URL（仮想URL）
 * @param params - リクエストパラメータ（sCLMID 等）
 * @returns レスポンスオブジェクト
 */
export function sendRequest(
  url: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>>;

// ─── crypto.js ───────────────────────────────────────────────────────────────

/**
 * 立花証券から返却される暗号化済み仮想URLを秘密鍵で復号する
 * 暗号化方式: RSA-OAEP-SHA256
 * @param encrypted - Base64 エンコードされた RSA-OAEP-SHA256 暗号文
 * @param privateKeyPem - PEM形式の秘密鍵（登録した公開鍵と対のペア）
 * @returns 復号後の平文仮想URL（"https://..." 形式）
 */
export function decryptVirtualUrl(encrypted: string, privateKeyPem: string): string;

/**
 * 認証IDを環境変数から取り出す
 * @param demo - true なら TACHIBANA_AUTH_ID_DEMO、false（省略時）なら TACHIBANA_AUTH_ID
 * @returns 認証ID文字列
 */
export function getAuthId(demo?: boolean): string;

/**
 * 秘密鍵（PEM形式）を環境変数から取り出す
 * @param demo - true なら TACHIBANA_PRIVATE_KEY_DEMO、false（省略時）なら TACHIBANA_PRIVATE_KEY
 * @returns PEM形式の秘密鍵文字列（改行は実改行に戻し済み）
 */
export function getPrivateKey(demo?: boolean): string;

// ─── login-v4r8.js ───────────────────────────────────────────────────────────

/** v4r8 ログイン成功時の仮想URL群 */
export interface LoginV4r8Urls {
  sUrlRequest: string;
  sUrlMaster: string;
  sUrlPrice: string;
  sUrlEvent: string;
  /** v4r8 固有: WebSocket 版イベントURL */
  sUrlEventWs: string | undefined;
}

/** v4r8 ログイン成功レスポンス */
export interface LoginV4r8Success {
  ok: true;
  urls: LoginV4r8Urls;
  /** システム状態文字列。取得できない場合は null */
  systemStatus: string | null;
}

/** v4r8 ログイン失敗レスポンス */
export interface LoginV4r8Failure {
  ok: false;
  /** エラーメッセージ（電話認証未済コード付きの場合あり） */
  message: string;
}

/**
 * v4r8 のログインリクエストを実行し、仮想URL群を取得する
 * 引数はオブジェクト destructure 形式
 * @param args.userId - 立花証券ユーザーID
 * @param args.password - パスワード
 * @param args.demo - true のときデモ環境へログイン
 */
export function loginV4r8(args: {
  userId: string;
  password: string;
  demo: boolean;
}): Promise<LoginV4r8Success | LoginV4r8Failure>;

// ─── login-v4r9.js ───────────────────────────────────────────────────────────

/** v4r9 ログイン成功時の仮想URL群 */
export interface LoginV4r9Urls {
  sUrlRequest: string;
  sUrlMaster: string;
  sUrlPrice: string;
  sUrlEvent: string;
  /** v4r9 新規追加: WebSocket 版イベントURL */
  sUrlEventWebSocket: string | undefined;
}

/** v4r9 ログイン成功レスポンス */
export interface LoginV4r9Success {
  ok: true;
  urls: LoginV4r9Urls;
  /** システム状態文字列。取得できない場合は null */
  systemStatus: string | null;
}

/** v4r9 ログイン失敗レスポンス */
export interface LoginV4r9Failure {
  ok: false;
  /** エラーメッセージ（環境変数未設定／鍵形式不正を含む） */
  message: string;
}

/**
 * v4r9 のログインリクエストを実行し、仮想URL群を取得する
 * 認証ID・秘密鍵は引数から受け取らず、内部で環境変数から自動取得する
 * 引数はオブジェクト destructure 形式
 * @param args.demo - true のときデモ環境（TACHIBANA_AUTH_ID_DEMO 等）を使用
 */
export function loginV4r9(args: {
  demo: boolean;
}): Promise<LoginV4r9Success | LoginV4r9Failure>;
