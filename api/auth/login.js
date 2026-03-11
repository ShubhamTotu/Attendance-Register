const { methodNotAllowed, redirect } = require("../_lib/http");
const { getRequestUrl, normalizeReturnTo } = require("../_lib/request");
const {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
} = require("../_lib/x");
const { setPendingAuthCookie } = require("../_lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const requestUrl = getRequestUrl(req);
    const returnTo = normalizeReturnTo(requestUrl.searchParams.get("return_to") || "/");
    const codeVerifier = createCodeVerifier();
    const state = createState();

    setPendingAuthCookie(res, {
      codeVerifier,
      returnTo,
      state,
    });

    redirect(
      res,
      buildAuthorizeUrl({
        codeChallenge: createCodeChallenge(codeVerifier),
        state,
      }),
    );
  } catch (error) {
    redirect(res, "/?auth_error=login_setup_failed");
  }
};
