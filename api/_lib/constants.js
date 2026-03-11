const PUBLIC_SHARE_TEXT = `I just marked my attendance. Did you?\n\nDo it at: https://timeline-attendance.vercel.app/`;
const PUBLIC_SHARE_INTENT_URL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(PUBLIC_SHARE_TEXT)}`;
const PENDING_AUTH_COOKIE = "attendance_x_pending";
const SESSION_COOKIE = "attendance_x_session";

module.exports = {
  PENDING_AUTH_COOKIE,
  PUBLIC_SHARE_INTENT_URL,
  PUBLIC_SHARE_TEXT,
  SESSION_COOKIE,
};
