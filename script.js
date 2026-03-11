const HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/;
const ALLOWED_STATUSES = new Set(["present", "stuck"]);
const DEFAULT_TABLE_NAME = "attendance_entries";
const DEFAULT_POLLING_INTERVAL_MS = 3000;
const FIXED_ROLL_ENTRIES = [
  {
    handle: "@shubhamtotu",
    rollNumber: 1,
    status: "present",
    fixedLabel: "Fixed roll",
  },
  {
    handle: "@toly",
    rollNumber: 75,
    status: "present",
    fixedLabel: "Fixed roll",
  },
];
const FIXED_HANDLE_SET = new Set(FIXED_ROLL_ENTRIES.map((entry) => entry.handle));
const RESERVED_ROLLS = new Set(FIXED_ROLL_ENTRIES.map((entry) => entry.rollNumber));

const config = window.CRYPTO_ATTENDANCE_CONFIG || {};
const SUPABASE_URL = (config.supabaseUrl || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = config.supabaseAnonKey || "";
const TABLE_NAME = config.attendanceTable || DEFAULT_TABLE_NAME;
const POLLING_INTERVAL_MS = Math.max(config.pollingIntervalMs || DEFAULT_POLLING_INTERVAL_MS, 1000);

const state = {
  entries: [],
  isConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
  isLoading: false,
  isSubmitting: false,
  isSeedingFixedEntries: false,
  pollerId: null,
};

const elements = {
  attendanceCount: document.getElementById("attendance-count"),
  currentDate: document.getElementById("current-date"),
  currentDay: document.getElementById("current-day"),
  currentTime: document.getElementById("current-time"),
  footerTrigger: document.getElementById("footer-trigger"),
  form: document.getElementById("attendance-form"),
  formStatus: document.getElementById("form-status"),
  pageCredit: document.getElementById("page-credit"),
  rollList: document.getElementById("roll-list"),
  statusField: document.getElementById("attendance-status"),
  submitButton: document.querySelector(".submit-button"),
  template: document.getElementById("empty-state-template"),
  twitterHandle: document.getElementById("twitter-handle"),
};

function formatHandle(handle) {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  return `@${normalized}`;
}

function normalizeStatus(status) {
  if (status === "broken" || status === "retarded") {
    return "stuck";
  }

  return ALLOWED_STATUSES.has(status) ? status : "present";
}

function normalizeEntries(entries) {
  return entries
    .filter(
      (entry) =>
        entry &&
        typeof entry.handle === "string" &&
        HANDLE_PATTERN.test(entry.handle.trim()),
    )
    .map((entry) => ({
      id: entry.id ?? null,
      handle: formatHandle(entry.handle),
      status: normalizeStatus(entry.status),
      timestamp: entry.created_at || entry.timestamp || new Date().toISOString(),
    }))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
}

function getDisplayEntries(entries = state.entries) {
  const realEntriesByHandle = new Map(entries.map((entry) => [entry.handle, entry]));
  const assignedEntries = [];
  let nextRollNumber = 1;

  for (const entry of entries) {
    if (FIXED_HANDLE_SET.has(entry.handle)) {
      continue;
    }

    while (RESERVED_ROLLS.has(nextRollNumber)) {
      nextRollNumber += 1;
    }

    assignedEntries.push({
      ...entry,
      rollNumber: nextRollNumber,
      isFixed: false,
      isVirtual: false,
    });

    nextRollNumber += 1;
  }

  const fixedEntries = FIXED_ROLL_ENTRIES.map((fixedEntry) => {
    const liveEntry = realEntriesByHandle.get(fixedEntry.handle);

    return {
      ...(liveEntry || fixedEntry),
      handle: fixedEntry.handle,
      status: liveEntry ? liveEntry.status : fixedEntry.status,
      timestamp: liveEntry ? liveEntry.timestamp : null,
      rollNumber: fixedEntry.rollNumber,
      fixedLabel: fixedEntry.fixedLabel,
      isFixed: true,
      isVirtual: !liveEntry,
    };
  });

  return [...fixedEntries, ...assignedEntries].sort((left, right) => left.rollNumber - right.rollNumber);
}

function getExistingDisplayEntry(handle, entries = state.entries) {
  return getDisplayEntries(entries).find((entry) => entry.handle === handle) || null;
}

function formatDateParts(date = new Date()) {
  const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  const fullDate = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

  return { weekdayLong, fullDate };
}

function formatJoinedDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatJoinedTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function setStatus(message, tone = "default") {
  elements.formStatus.textContent = message;
  elements.formStatus.classList.remove("success");

  if (tone === "success") {
    elements.formStatus.classList.add("success");
  }
}

function clearStatus() {
  setStatus("");
}

function setFormEnabled(isEnabled) {
  elements.statusField.disabled = !isEnabled;
  elements.twitterHandle.disabled = !isEnabled;

  if (!state.isSubmitting && elements.submitButton) {
    elements.submitButton.disabled = !isEnabled;
    elements.submitButton.dataset.state = isEnabled ? "idle" : "disabled";
  }
}

function setSubmittingState(isSubmitting) {
  state.isSubmitting = isSubmitting;

  if (elements.submitButton) {
    elements.submitButton.disabled = isSubmitting;
    elements.submitButton.dataset.state = isSubmitting ? "submitting" : "idle";
    elements.submitButton.textContent = isSubmitting ? "Saving..." : "Mark attendance";
  }
}

function getApiHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

function getTableUrl(query = "") {
  const querySuffix = query ? `?${query}` : "";
  return `${SUPABASE_URL}/rest/v1/${TABLE_NAME}${querySuffix}`;
}

async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error_description || payload?.hint || response.statusText;
  } catch (error) {
    return response.statusText || "Unknown error";
  }
}

async function fetchEntriesFromSupabase() {
  const response = await fetch(
    getTableUrl("select=id,handle,status,created_at&order=created_at.asc"),
    {
      method: "GET",
      headers: getApiHeaders(),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return normalizeEntries(await response.json());
}

async function insertEntryInSupabase(entry) {
  const response = await fetch(
    getTableUrl("select=id,handle,status,created_at"),
    {
      method: "POST",
      headers: getApiHeaders({
        Prefer: "return=representation",
      }),
      body: JSON.stringify(entry),
    },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return normalizeEntries(await response.json())[0] || null;
}

async function ensureFixedEntriesInSupabase(entries = state.entries) {
  if (!state.isConfigured || state.isSeedingFixedEntries) {
    return false;
  }

  const missingFixedEntries = FIXED_ROLL_ENTRIES.filter(
    (fixedEntry) => !entries.some((entry) => entry.handle === fixedEntry.handle),
  );

  if (!missingFixedEntries.length) {
    return false;
  }

  state.isSeedingFixedEntries = true;

  try {
    await Promise.all(
      missingFixedEntries.map(async (fixedEntry) => {
        try {
          await insertEntryInSupabase({
            handle: fixedEntry.handle,
            status: fixedEntry.status,
          });
        } catch (error) {
          if (!/duplicate|unique|23505/i.test(error.message)) {
            throw error;
          }
        }
      }),
    );

    return true;
  } finally {
    state.isSeedingFixedEntries = false;
  }
}

function renderList(entries) {
  elements.rollList.replaceChildren();

  if (!entries.length) {
    elements.rollList.appendChild(elements.template.content.cloneNode(true));
    return;
  }

  const items = entries.map((entry) => {
    const row = document.createElement("li");
    row.className = "directory-entry";

    const rollNumber = document.createElement("span");
    rollNumber.className = "entry-roll";
    rollNumber.textContent = `Roll no. ${String(entry.rollNumber).padStart(2, "0")}`;

    const details = document.createElement("div");
    details.className = "entry-details";

    const handle = document.createElement("div");
    handle.className = "entry-handle";
    handle.textContent = entry.handle;

    const stamp = document.createElement("div");
    stamp.className = "entry-stamp";
    stamp.textContent = entry.timestamp
      ? `Local time: ${formatJoinedDate(entry.timestamp)} • ${formatJoinedTime(entry.timestamp)}`
      : entry.fixedLabel;

    const badge = document.createElement("span");
    badge.className = `entry-status ${entry.status}`;
    badge.textContent = entry.status;

    details.append(handle, stamp);
    row.append(rollNumber, details, badge);
    return row;
  });

  elements.rollList.append(...items);
}

function updateSummary(entries) {
  const countLabel = entries.length === 1 ? "1 roll" : `${entries.length} rolls`;
  elements.attendanceCount.textContent = countLabel;
}

function renderCurrentEntries() {
  const displayEntries = getDisplayEntries();
  renderList(displayEntries);
  updateSummary(displayEntries);
}

function hydrateDate() {
  const now = new Date();
  const { weekdayLong, fullDate } = formatDateParts(now);

  elements.currentDay.textContent = weekdayLong;
  elements.currentDate.textContent = fullDate;
  elements.currentTime.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);
}

async function syncEntries() {
  if (!state.isConfigured || state.isLoading) {
    return;
  }

  state.isLoading = true;

  try {
    let entries = await fetchEntriesFromSupabase();
    state.entries = entries;

    if (await ensureFixedEntriesInSupabase(entries)) {
      entries = await fetchEntriesFromSupabase();
      state.entries = entries;
    }

    renderCurrentEntries();
  } catch (error) {
    console.error("Could not load entries:", error);
    if (!elements.formStatus.textContent) {
      setStatus("Could not load the public directory. Check your Supabase config.");
    }
  } finally {
    state.isLoading = false;
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.isConfigured) {
    setStatus("Supabase is not configured yet. Add your project URL and anon key.");
    return;
  }

  const rawValue = elements.twitterHandle.value.trim();
  const attendanceStatus = elements.statusField.value;

  if (!ALLOWED_STATUSES.has(attendanceStatus)) {
    setStatus("Choose Present or Stuck before adding yourself.");
    return;
  }

  if (!HANDLE_PATTERN.test(rawValue)) {
    setStatus("Enter a valid Twitter username to continue.");
    return;
  }

  const handle = formatHandle(rawValue);
  const existingEntry = getExistingDisplayEntry(handle);

  if (existingEntry) {
    const rollNumber = String(existingEntry.rollNumber).padStart(2, "0");
    setStatus(`${handle} already has roll no. ${rollNumber} as ${existingEntry.status}.`);
    return;
  }

  try {
    setSubmittingState(true);

    await insertEntryInSupabase({
      handle,
      status: attendanceStatus,
    });

    await syncEntries();
    setStatus(`${handle} added as ${attendanceStatus}.`, "success");
    elements.form.reset();
    elements.statusField.focus();
  } catch (error) {
    console.error("Could not save entry:", error);

    if (/duplicate|unique|23505/i.test(error.message)) {
      await syncEntries();
    }

    const duplicateEntry = getExistingDisplayEntry(handle);
    if (duplicateEntry) {
      const rollNumber = String(duplicateEntry.rollNumber).padStart(2, "0");
      setStatus(`${handle} already has roll no. ${rollNumber}.`);
    } else {
      setStatus(`Could not save this entry. ${error.message}`);
    }
  } finally {
    setSubmittingState(false);
  }
}

function initCreditReveal() {
  if (!elements.footerTrigger || !elements.pageCredit) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const [entry] = entries;
      elements.pageCredit.classList.toggle("is-visible", Boolean(entry?.isIntersecting));
    },
    {
      rootMargin: "0px 0px -20px 0px",
      threshold: 0.1,
    },
  );

  observer.observe(elements.footerTrigger);
}

function initPolling() {
  if (!state.isConfigured) {
    return;
  }

  state.pollerId = window.setInterval(() => {
    if (!document.hidden) {
      syncEntries();
    }
  }, POLLING_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncEntries();
    }
  });
}

function init() {
  hydrateDate();
  window.setInterval(hydrateDate, 1000);
  initCreditReveal();

  renderCurrentEntries();
  setFormEnabled(state.isConfigured);

  elements.form.addEventListener("submit", handleSubmit);
  elements.twitterHandle.addEventListener("input", clearStatus);
  elements.statusField.addEventListener("change", clearStatus);

  if (!state.isConfigured) {
    setStatus("Create supabase-config.js with your project URL and anon key to make this live.");
    return;
  }

  syncEntries();
  initPolling();
}

init();
