const ALLOWED_HOST = "www.zohoapis.com";
const ALLOWED_PATH_PREFIX = "/creator/custom/demo14instawebworkscom/";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function isAllowedApiReference(apiReference) {
  try {
    const url = new URL(apiReference);
    return (
      url.protocol === "https:" &&
      url.hostname === ALLOWED_HOST &&
      url.pathname.startsWith(ALLOWED_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      message: "Method not allowed.",
    });
  }

  const { apiReference, payload } = req.body || {};

  if (!apiReference || !isAllowedApiReference(apiReference)) {
    return sendJson(res, 400, {
      ok: false,
      message: "A valid Creator custom API URL is required.",
    });
  }

  try {
    const upstreamResponse = await fetch(apiReference, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });

    const rawText = await upstreamResponse.text();

    res.statusCode = upstreamResponse.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(rawText);
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to reach Creator custom API.",
    });
  }
}
