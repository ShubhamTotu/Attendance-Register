function getRequestOrigin(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  return `${protocol}://${host}`;
}

function getRequestUrl(req) {
  return new URL(req.url, getRequestOrigin(req));
}

function normalizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function appendQueryToReturnTo(value, params = {}) {
  const returnTo = normalizeReturnTo(value);
  const url = new URL(returnTo, "https://codex.local");

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    url.searchParams.set(key, String(rawValue));
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

module.exports = {
  appendQueryToReturnTo,
  getRequestOrigin,
  getRequestUrl,
  normalizeReturnTo,
};
