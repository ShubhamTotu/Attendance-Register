const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server environment variables are missing.");
  }
}

async function supabaseRequest(path, { method = "GET", body, headers = {} } = {}) {
  assertSupabaseEnv();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let payload = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error_description || payload?.hint || response.statusText,
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function fetchAttendanceEntries() {
  return (
    (await supabaseRequest(
      "attendance_entries?select=id,handle,status,created_at,x_user_id&order=created_at.asc",
    )) || []
  );
}

async function findAttendanceByXUserId(xUserId) {
  const rows =
    (await supabaseRequest(
      `attendance_entries?select=id,handle,status,created_at,x_user_id&x_user_id=eq.${encodeURIComponent(xUserId)}&limit=1`,
    )) || [];

  return rows[0] || null;
}

async function findAttendanceByHandle(handle) {
  const rows =
    (await supabaseRequest(
      `attendance_entries?select=id,handle,status,created_at,x_user_id&handle=eq.${encodeURIComponent(handle)}&limit=1`,
    )) || [];

  return rows[0] || null;
}

async function insertAttendanceEntry({ handle, status, xUserId }) {
  const rows =
    (await supabaseRequest("attendance_entries?select=id,handle,status,created_at,x_user_id", {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: {
        handle,
        status,
        x_user_id: xUserId,
      },
    })) || [];

  return rows[0] || null;
}

async function updateAttendanceEntry(id, patch) {
  const rows =
    (await supabaseRequest(
      `attendance_entries?id=eq.${id}&select=id,handle,status,created_at,x_user_id`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: patch,
      },
    )) || [];

  return rows[0] || null;
}

async function deleteSessionRecord(sessionToken) {
  await supabaseRequest(`x_auth_sessions?session_token=eq.${encodeURIComponent(sessionToken)}`, {
    method: "DELETE",
  });
}

async function getSessionRecord(sessionToken) {
  const rows =
    (await supabaseRequest(
      `x_auth_sessions?select=session_token,x_user_id,username,access_token,refresh_token,expires_at,created_at&session_token=eq.${encodeURIComponent(sessionToken)}&limit=1`,
    )) || [];

  return rows[0] || null;
}

async function insertSessionRecord(record) {
  const rows =
    (await supabaseRequest(
      "x_auth_sessions?select=session_token,x_user_id,username,access_token,refresh_token,expires_at,created_at",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: record,
      },
    )) || [];

  return rows[0] || null;
}

module.exports = {
  deleteSessionRecord,
  fetchAttendanceEntries,
  findAttendanceByHandle,
  findAttendanceByXUserId,
  getSessionRecord,
  insertAttendanceEntry,
  insertSessionRecord,
  updateAttendanceEntry,
};
