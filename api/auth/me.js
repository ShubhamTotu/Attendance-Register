const { methodNotAllowed, sendJson } = require("../_lib/http");
const { clearSessionCookie, getSessionFromRequest } = require("../_lib/session");
const { REQUIRED_TWEET_TEXT, SHARE_INTENT_URL } = require("../_lib/x");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const session = await getSessionFromRequest(req, res);

    if (!session) {
      sendJson(res, 200, {
        authenticated: false,
        requiredTweetText: REQUIRED_TWEET_TEXT,
        shareUrl: SHARE_INTENT_URL,
      });
      return;
    }

    sendJson(res, 200, {
      authenticated: true,
      requiredTweetText: REQUIRED_TWEET_TEXT,
      shareUrl: SHARE_INTENT_URL,
      user: {
        handle: `@${String(session.username).toLowerCase()}`,
        username: String(session.username).toLowerCase(),
        xUserId: session.x_user_id,
      },
    });
  } catch (error) {
    clearSessionCookie(res);
    sendJson(res, 500, {
      authenticated: false,
      message: "Could not read the current X session.",
      requiredTweetText: REQUIRED_TWEET_TEXT,
      shareUrl: SHARE_INTENT_URL,
    });
  }
};
