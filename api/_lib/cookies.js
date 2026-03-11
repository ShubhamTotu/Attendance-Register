const crypto = require("crypto");

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((allCookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return allCookies;
      }

      const key = part.slice(0, separatorIndex);
      const value = decodeURIComponent(part.slice(separatorIndex + 1));

      allCookies[key] = value;
      return allCookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

function appendSetCookie(res, cookieValue) {
  const existingCookies = res.getHeader("Set-Cookie");

  if (!existingCookies) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(existingCookies)) {
    res.setHeader("Set-Cookie", [...existingCookies, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [existingCookies, cookieValue]);
}

function signValue(value, secret) {
  const encoded = Buffer.from(value, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");

  return `${encoded}.${signature}`;
}

function unsignValue(signedValue, secret) {
  if (typeof signedValue !== "string" || !signedValue.includes(".")) {
    return null;
  }

  const [encoded, signature] = signedValue.split(".");
  const expectedSignature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return Buffer.from(encoded, "base64url").toString("utf8");
}

function createSignedPayloadCookie(name, payload, secret, options) {
  return serializeCookie(name, signValue(JSON.stringify(payload), secret), options);
}

function readSignedPayload(value, secret) {
  try {
    const unsigned = unsignValue(value, secret);

    if (!unsigned) {
      return null;
    }

    return JSON.parse(unsigned);
  } catch (error) {
    return null;
  }
}

module.exports = {
  appendSetCookie,
  createSignedPayloadCookie,
  parseCookies,
  readSignedPayload,
  serializeCookie,
};
