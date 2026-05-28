// 立花証券 v4r8 ログインフロー
// userId + password を送信 → 平文の仮想URL群を受け取る（v4r8廃止: 2026/6/27）

import {
  getAuthUrl,
  fetchTachibanaApi,
  formatTachibanaDate,
} from "./client.js";

/**
 * v4r8 のログインリクエストを実行し、仮想URL群を取得する
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.password
 * @param {boolean} args.demo
 * @returns {Promise<{ ok: true, urls: object, systemStatus: string|null } | { ok: false, message: string }>}
 */
export async function loginV4r8({ userId, password, demo }) {
  const authUrl = getAuthUrl(demo);

  const loginData = await fetchTachibanaApi(authUrl, {
    sCLMID: "CLMAuthLoginRequest",
    sUserId: userId,
    sPassword: password,
    p_no: "1",
    p_sd_date: formatTachibanaDate(),
  });

  if (loginData.sResultCode !== "0") {
    return {
      ok: false,
      message: `ログイン失敗: ${loginData.sResultText || "ユーザーIDまたはパスワードが正しくありません"}`,
    };
  }

  // 立花証券の罠: sResultCode="0"（成功扱い）でも、電話認証未済やアカウント停止時は
  // 仮想URLが空文字で返ってくる。エラー詳細は数値キー "688"/"689" に入る
  // 例: "688":"10088", "689":"当社に登録の電話番号から認証電話番号へかけた後にログインしてください。"
  if (!loginData.sUrlRequest || !loginData.sUrlPrice) {
    const errorCode = loginData["688"] || "";
    const errorMessage = loginData["689"] || "ログイン処理中に問題が発生しました";
    return {
      ok: false,
      message: errorCode ? `[${errorCode}] ${errorMessage}` : errorMessage,
    };
  }

  return {
    ok: true,
    urls: {
      sUrlRequest: loginData.sUrlRequest,
      sUrlMaster: loginData.sUrlMaster,
      sUrlPrice: loginData.sUrlPrice,
      sUrlEvent: loginData.sUrlEvent,
      sUrlEventWs: loginData.sUrlEventWs,
    },
    systemStatus: loginData.sSystemState || null,
  };
}
