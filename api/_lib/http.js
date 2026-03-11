async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function redirect(res, location, statusCode = 302) {
  res.statusCode = statusCode;
  res.setHeader("Location", location);
  res.end();
}

function methodNotAllowed(res, allowedMethods) {
  res.statusCode = 405;
  res.setHeader("Allow", allowedMethods.join(", "));
  res.end("Method Not Allowed");
}

module.exports = {
  methodNotAllowed,
  readJson,
  redirect,
  sendJson,
};
