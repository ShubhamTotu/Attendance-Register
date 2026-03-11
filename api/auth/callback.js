const { redirect } = require("../_lib/http");
const { appendQueryToReturnTo, getRequestUrl } = require("../_lib/request");
const {
  clearPendingAuthCookie,
  createSessionToken,
  setSessionCookie,
  readPendingAuth,
} = require("../_lib/session");
const { insertSessionRecord } = require("../_lib/supabase");
const {
  exchangeCodeForToken,
  fetchAuthenticatedUser,
} = require("../_lib/x");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = getRequestUrl(req);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const pendingAuth = readPendingAuth(req);

  clearPendingAuthCookie(res);

  if (!code || !state || !pendingAuth || pendingAuth.state !== state) {
    console.error("X callback failed: invalid oauth state", {
      hasCode: Boolean(code),
      hasPendingAuth: Boolean(pendingAuth),
      hasState: Boolean(state),
      requestState: state || null,
      storedState: pendingAuth?.state || null,
    });
    redirect(res, "/?auth_error=invalid_oauth_state");
    return;
  }

  try {
    const tokenPayload = await exchangeCodeForToken({
      code,
      codeVerifier: pendingAuth.codeVerifier,
    });
    const user = await fetchAuthenticatedUser(tokenPayload.access_token);
    const sessionToken = createSessionToken();
    const expiresInSeconds = Math.max(300, Math.min(Number(tokenPayload.expires_in) || 3600, 86400));

    await insertSessionRecord({
      access_token: tokenPayload.access_token,
      expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      refresh_token: tokenPayload.refresh_token || null,
      session_token: sessionToken,
      username: user.username,
      x_user_id: user.id,
    });

    setSessionCookie(res, sessionToken, expiresInSeconds);
    redirect(
      res,
      appendQueryToReturnTo(pendingAuth.returnTo, {
        auth: "verified",
      }),
    );
  } catch (error) {
    console.error("X callback failed", {
      message: error?.message || "Unknown callback error",
      stack: error?.stack || null,
    });
    redirect(res, "/?auth_error=x_callback_failed");
  }
};
