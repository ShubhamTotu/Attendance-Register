const REQUIRED_TWEET_TEXT = "I'm still Present. Are you?";
const SHARE_INTENT_URL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(REQUIRED_TWEET_TEXT)}`;
const ALLOWED_STATUSES = ["present", "stuck"];
const PENDING_AUTH_COOKIE = "attendance_x_pending";
const SESSION_COOKIE = "attendance_x_session";

module.exports = {
  ALLOWED_STATUSES,
  PENDING_AUTH_COOKIE,
  REQUIRED_TWEET_TEXT,
  SESSION_COOKIE,
  SHARE_INTENT_URL,
};
