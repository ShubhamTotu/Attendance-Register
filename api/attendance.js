const { methodNotAllowed, sendJson } = require("./_lib/http");
const { getSessionFromRequest } = require("./_lib/session");
const {
  fetchAttendanceEntries,
  findAttendanceByHandle,
  findAttendanceByXUserId,
  insertAttendanceEntry,
  updateAttendanceEntry,
} = require("./_lib/supabase");

function toPublicEntry(entry) {
  return {
    created_at: entry.created_at,
    handle: entry.handle,
    id: entry.id,
    status: entry.status,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const entries = await fetchAttendanceEntries();
      sendJson(res, 200, {
        entries: entries.map(toPublicEntry),
      });
    } catch (error) {
      sendJson(res, 500, {
        message: "Could not load attendance entries.",
      });
    }

    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }

  try {
    const session = await getSessionFromRequest(req, res);

    if (!session) {
      sendJson(res, 401, {
        message: "Verify with X before marking attendance.",
      });
      return;
    }

    const existingByUserId = await findAttendanceByXUserId(session.x_user_id);
    const currentHandle = `@${String(session.username).toLowerCase()}`;

    if (existingByUserId) {
      let currentEntry = existingByUserId;

      if (existingByUserId.handle !== currentHandle) {
        currentEntry = await updateAttendanceEntry(existingByUserId.id, {
          handle: currentHandle,
        });
      }

      sendJson(res, 200, {
        alreadyMarked: true,
        entry: toPublicEntry(currentEntry),
      });
      return;
    }

    const status = "present";

    const existingByHandle = await findAttendanceByHandle(currentHandle);

    if (existingByHandle) {
      if (existingByHandle.x_user_id && existingByHandle.x_user_id !== session.x_user_id) {
        sendJson(res, 409, {
          message: "This handle already belongs to another verified entry.",
        });
        return;
      }

      const updatedEntry = await updateAttendanceEntry(existingByHandle.id, {
        status,
        x_user_id: session.x_user_id,
      });

      sendJson(res, 200, {
        alreadyMarked: true,
        entry: toPublicEntry(updatedEntry),
      });
      return;
    }

    const createdEntry = await insertAttendanceEntry({
      handle: currentHandle,
      status,
      xUserId: session.x_user_id,
    });

    sendJson(res, 201, {
      entry: toPublicEntry(createdEntry),
    });
  } catch (error) {
    sendJson(res, 500, {
      message: error.message || "Could not mark attendance.",
    });
  }
};
