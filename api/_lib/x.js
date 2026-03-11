const crypto = require("crypto");

const {
  PUBLIC_SHARE_INTENT_URL,
  REQUIRED_TWEET_TEXT,
  REQUIRED_TWEET_INTENT_URL,
} = require("./constants");

function assertXEnv() {
  if (!process.env.X_CLIENT_ID || !process.env.X_REDIRECT_URI) {
    throw new Error("X OAuth environment variables are missing.");
  }
}

function createCodeVerifier() {
  return crypto.randomBytes(48).toString("base64url");
}

function createState() {
  return crypto.randomBytes(24).toString("base64url");
}

function createCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function buildAuthorizeUrl({ state, codeChallenge }) {
  assertXEnv();

  const params = new URLSearchParams({
    client_id: process.env.X_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: process.env.X_REDIRECT_URI,
    response_type: "code",
    scope: "tweet.read users.read offline.access",
    state,
  });

  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken({ code, codeVerifier }) {
  assertXEnv();

  const body = new URLSearchParams({
    client_id: process.env.X_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: process.env.X_REDIRECT_URI,
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
    ).toString("base64")}`;
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description || payload.detail || "Could not exchange X auth code.");
  }

  return payload;
}

async function xRequest(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || payload.title || "X API request failed.");
  }

  return payload;
}

async function fetchAuthenticatedUser(accessToken) {
  const payload = await xRequest(
    "https://api.x.com/2/users/me?user.fields=id,name,profile_image_url,username",
    accessToken,
  );

  return payload.data;
}

async function fetchRecentUserTweets({ accessToken, xUserId }) {
  const params = new URLSearchParams({
    exclude: "replies,retweets",
    max_results: "100",
    "tweet.fields": "created_at,text",
  });

  const payload = await xRequest(
    `https://api.x.com/2/users/${encodeURIComponent(xUserId)}/tweets?${params.toString()}`,
    accessToken,
  );

  return Array.isArray(payload.data) ? payload.data : [];
}

function normalizeTweetText(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function hasRequiredTweet(tweets) {
  return tweets.some((tweet) => normalizeTweetText(tweet.text) === REQUIRED_TWEET_TEXT);
}

module.exports = {
  PUBLIC_SHARE_INTENT_URL,
  REQUIRED_TWEET_TEXT,
  REQUIRED_TWEET_INTENT_URL,
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
  exchangeCodeForToken,
  fetchAuthenticatedUser,
  fetchRecentUserTweets,
  hasRequiredTweet,
};
