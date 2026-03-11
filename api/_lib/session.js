const crypto = require("crypto");

const {
  PENDING_AUTH_COOKIE,
  SESSION_COOKIE,
} = require("./constants");
const {
  appendSetCookie,
  createSignedPayloadCookie,
  parseCookies,
  readSignedPayload,
  serializeCookie,
} = require("./cookies");
const {
  deleteSessionRecord,
  getSessionRecord,
} = require("./supabase");

function getSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing.");
  }

  return process.env.SESSION_SECRET;
}

function getCookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/",
    sameSite: "Lax",
    secure: true,
  };
}

function clearCookie(res, name) {
  appendSetCookie(
    res,
    serializeCookie(name, "", {
      ...getCookieOptions(0),
      expires: new Date(0),
    }),
  );
}

function setPendingAuthCookie(res, payload) {
  appendSetCookie(
    res,
    createSignedPayloadCookie(PENDING_AUTH_COOKIE, payload, getSessionSecret(), getCookieOptions(600)),
  );
}

function readPendingAuth(req) {
  const cookies = parseCookies(req);
  return readSignedPayload(cookies[PENDING_AUTH_COOKIE], getSessionSecret());
}

function clearPendingAuthCookie(res) {
  clearCookie(res, PENDING_AUTH_COOKIE);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function setSessionCookie(res, sessionToken, maxAgeSeconds) {
  appendSetCookie(
    res,
    serializeCookie(SESSION_COOKIE, sessionToken, getCookieOptions(maxAgeSeconds)),
  );
}

function clearSessionCookie(res) {
  clearCookie(res, SESSION_COOKIE);
}

async function getSessionFromRequest(req, res) {
  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];

  if (!sessionToken) {
    return null;
  }

  const session = await getSessionRecord(sessionToken);

  if (!session) {
    if (res) {
      clearSessionCookie(res);
    }

    return null;
  }

  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteSessionRecord(sessionToken);

    if (res) {
      clearSessionCookie(res);
    }

    return null;
  }

  return session;
}

module.exports = {
  clearPendingAuthCookie,
  clearSessionCookie,
  createSessionToken,
  getSessionFromRequest,
  readPendingAuth,
  setPendingAuthCookie,
  setSessionCookie,
};
