const { ALLOWED_STATUSES } = require("./_lib/constants");
const { methodNotAllowed, readJson, sendJson } = require("./_lib/http");
const { clearSessionCookie, getSessionFromRequest } = require("./_lib/session");
const {
  fetchAttendanceEntries,
  findAttendanceByHandle,
  findAttendanceByXUserId,
  insertAttendanceEntry,
  updateAttendanceEntry,
} = require("./_lib/supabase");
const {
  PUBLIC_SHARE_INTENT_URL,
  REQUIRED_TWEET_TEXT,
  REQUIRED_TWEET_INTENT_URL,
  fetchRecentUserTweets,
  hasRequiredTweet,
} = require("./_lib/x");

function normalizeStatus(status) {
  return ALLOWED_STATUSES.includes(status) ? status : null;
}

function toPublicEntry(entry) {
  return {
    created_at: entry.created_at,
    handle: entry.handle,
    id: entry.id,
    status: entry.status,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const entries = await fetchAttendanceEntries();
      sendJson(res, 200, {
        entries: entries.map(toPublicEntry),
      });
    } catch (error) {
      sendJson(res, 500, {
        message: "Could not load attendance entries.",
      });
    }

    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }

  try {
    const session = await getSessionFromRequest(req, res);

    if (!session) {
      sendJson(res, 401, {
        message: "Verify with X before marking attendance.",
      });
      return;
    }

    const existingByUserId = await findAttendanceByXUserId(session.x_user_id);
    const currentHandle = `@${String(session.username).toLowerCase()}`;

    if (existingByUserId) {
      let currentEntry = existingByUserId;

      if (existingByUserId.handle !== currentHandle) {
        currentEntry = await updateAttendanceEntry(existingByUserId.id, {
          handle: currentHandle,
        });
      }

      sendJson(res, 200, {
        alreadyMarked: true,
        entry: toPublicEntry(currentEntry),
      });
      return;
    }

    const payload = await readJson(req);
    const status = normalizeStatus(payload.status);

    if (!status) {
      sendJson(res, 400, {
        message: "Choose Present or Stuck before marking attendance.",
      });
      return;
    }

    let recentTweets = [];

    try {
      recentTweets = await fetchRecentUserTweets({
        accessToken: session.access_token,
        xUserId: session.x_user_id,
      });
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, {
        message: "Your X session expired. Verify again before marking attendance.",
      });
      return;
    }

    if (!hasRequiredTweet(recentTweets)) {
      sendJson(res, 403, {
        message: "Share the exact post before marking attendance.",
        publicShareUrl: PUBLIC_SHARE_INTENT_URL,
        requiredTweetText: REQUIRED_TWEET_TEXT,
        requiredTweetIntentUrl: REQUIRED_TWEET_INTENT_URL,
      });
      return;
    }

    const existingByHandle = await findAttendanceByHandle(currentHandle);

    if (existingByHandle) {
      if (existingByHandle.x_user_id && existingByHandle.x_user_id !== session.x_user_id) {
        sendJson(res, 409, {
          message: "This handle already belongs to another verified entry.",
        });
        return;
      }

      const updatedEntry = await updateAttendanceEntry(existingByHandle.id, {
        status,
        x_user_id: session.x_user_id,
      });

      sendJson(res, 200, {
        alreadyMarked: true,
        entry: toPublicEntry(updatedEntry),
      });
      return;
    }

    const createdEntry = await insertAttendanceEntry({
      handle: currentHandle,
      status,
      xUserId: session.x_user_id,
    });

    sendJson(res, 201, {
      entry: toPublicEntry(createdEntry),
    });
  } catch (error) {
    sendJson(res, 500, {
      message: error.message || "Could not mark attendance.",
    });
  }
};
