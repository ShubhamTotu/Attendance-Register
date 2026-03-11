const { methodNotAllowed, redirect, sendJson } = require("../_lib/http");
const { parseCookies } = require("../_lib/cookies");
const { SESSION_COOKIE } = require("../_lib/constants");
const { clearSessionCookie } = require("../_lib/session");
const { deleteSessionRecord } = require("../_lib/supabase");

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }

  try {
    const cookies = parseCookies(req);
    const sessionToken = cookies[SESSION_COOKIE];

    if (sessionToken) {
      await deleteSessionRecord(sessionToken);
    }
  } catch (error) {
    // Ignore delete failures when clearing a broken session.
  }

  clearSessionCookie(res);

  if (req.method === "GET") {
    redirect(res, "/");
    return;
  }

  sendJson(res, 200, { ok: true });
};
