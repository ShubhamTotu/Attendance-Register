const ALLOWED_STATUSES = new Set(["present", "stuck"]);
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
const POLLING_INTERVAL_MS = 3000;
const REQUIRED_TWEET_TEXT = "I'm still Present. Are you?";
const DEFAULT_SHARE_URL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(REQUIRED_TWEET_TEXT)}`;

const state = {
  authLoaded: false,
  entries: [],
  isLoading: false,
  isSubmitting: false,
  pollerId: null,
  shareUrl: DEFAULT_SHARE_URL,
  user: null,
};

const elements = {
  attendanceCount: document.getElementById("attendance-count"),
  currentDate: document.getElementById("current-date"),
  currentDay: document.getElementById("current-day"),
  currentTime: document.getElementById("current-time"),
  footerTrigger: document.getElementById("footer-trigger"),
  form: document.getElementById("attendance-form"),
  formStatus: document.getElementById("form-status"),
  helperText: document.getElementById("helper-text"),
  pageCredit: document.getElementById("page-credit"),
  rollList: document.getElementById("roll-list"),
  shareLink: document.getElementById("share-link"),
  statusField: document.getElementById("attendance-status"),
  submitButton: document.querySelector(".submit-button"),
  template: document.getElementById("empty-state-template"),
  verifyAccount: document.getElementById("verify-account"),
};

function formatHandle(handle) {
  return `@${String(handle || "").trim().replace(/^@+/, "").toLowerCase()}`;
}

function normalizeStatus(status) {
  if (status === "broken" || status === "retarded") {
    return "stuck";
  }

  return ALLOWED_STATUSES.has(status) ? status : "present";
}

function normalizeEntries(entries) {
  return entries
    .filter((entry) => entry && typeof entry.handle === "string")
    .map((entry) => ({
      id: entry.id ?? null,
      handle: formatHandle(entry.handle),
      status: normalizeStatus(entry.status),
      timestamp: entry.created_at || entry.timestamp || null,
    }))
    .sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0));
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
      isFixed: false,
      rollNumber: nextRollNumber,
    });

    nextRollNumber += 1;
  }

  const fixedEntries = FIXED_ROLL_ENTRIES.map((fixedEntry) => {
    const liveEntry = realEntriesByHandle.get(fixedEntry.handle);

    return {
      ...(liveEntry || fixedEntry),
      handle: fixedEntry.handle,
      rollNumber: fixedEntry.rollNumber,
      status: normalizeStatus(liveEntry ? liveEntry.status : fixedEntry.status),
      timestamp: liveEntry ? liveEntry.timestamp : null,
    };
  });

  return [...fixedEntries, ...assignedEntries].sort((left, right) => left.rollNumber - right.rollNumber);
}

function getExistingDisplayEntry(handle, entries = state.entries) {
  return getDisplayEntries(entries).find((entry) => entry.handle === handle) || null;
}

function formatDateParts(date = new Date()) {
  return {
    fullDate: new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date),
    weekdayLong: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
    }).format(date),
  };
}

function formatJoinedDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
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

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    method: options.method || "GET",
    body:
      options.body !== undefined
        ? typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
  });

  const rawText = await response.text();
  let payload = {};

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      payload = { message: rawText };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.message || response.statusText || "Request failed.");
    error.data = payload;
    error.status = response.status;
    throw error;
  }

  return payload;
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

function setSubmittingState(isSubmitting) {
  state.isSubmitting = isSubmitting;

  if (elements.submitButton) {
    elements.submitButton.disabled = isSubmitting || !state.user;
    elements.submitButton.dataset.state = isSubmitting ? "submitting" : state.user ? "idle" : "disabled";
    elements.submitButton.textContent = isSubmitting ? "Checking tweet..." : "Mark attendance";
  }

  if (elements.statusField) {
    elements.statusField.disabled = isSubmitting;
  }

  if (elements.verifyAccount) {
    elements.verifyAccount.disabled = isSubmitting;
  }
}

function renderVerificationState() {
  elements.shareLink.href = state.shareUrl || DEFAULT_SHARE_URL;

  if (state.user) {
    elements.verifyAccount.classList.add("is-verified");
    elements.verifyAccount.textContent = `Verified as ${state.user.handle}`;
  } else {
    elements.verifyAccount.classList.remove("is-verified");
    elements.verifyAccount.textContent = "Verify with X";
  }

  if (elements.helperText) {
    elements.helperText.textContent = "";
  }

  setSubmittingState(state.isSubmitting);
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
  elements.attendanceCount.textContent = entries.length === 1 ? "1 roll" : `${entries.length} rolls`;
}

function renderCurrentEntries() {
  const displayEntries = getDisplayEntries();
  renderList(displayEntries);
  updateSummary(displayEntries);
}

function hydrateDate() {
  const now = new Date();
  const { fullDate, weekdayLong } = formatDateParts(now);

  elements.currentDay.textContent = weekdayLong;
  elements.currentDate.textContent = fullDate;
  elements.currentTime.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);
}

async function syncViewer() {
  try {
    const payload = await apiRequest("/api/auth/me");
    state.authLoaded = true;
    state.shareUrl = payload.shareUrl || DEFAULT_SHARE_URL;
    state.user = payload.authenticated ? payload.user : null;
    renderVerificationState();
  } catch (error) {
    state.authLoaded = true;
    state.user = null;
    state.shareUrl = DEFAULT_SHARE_URL;
    renderVerificationState();
  }
}

async function syncEntries() {
  if (state.isLoading) {
    return;
  }

  state.isLoading = true;

  try {
    const payload = await apiRequest("/api/attendance");
    state.entries = normalizeEntries(payload.entries || []);
    renderCurrentEntries();
  } catch (error) {
    if (!elements.formStatus.textContent) {
      setStatus("Could not load the public register right now.");
    }
  } finally {
    state.isLoading = false;
  }
}

function beginVerification() {
  const returnTo = `${window.location.pathname}${window.location.hash || ""}`;
  window.location.assign(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
}

async function handleVerifyClick() {
  if (!state.user) {
    beginVerification();
    return;
  }

  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // Ignore logout failures before restarting auth.
  }

  state.user = null;
  renderVerificationState();
  beginVerification();
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.user) {
    beginVerification();
    return;
  }

  const status = "present";

  const existingEntry = getExistingDisplayEntry(state.user.handle);

  if (existingEntry && existingEntry.timestamp) {
    const rollNumber = String(existingEntry.rollNumber).padStart(2, "0");
    setStatus(`${state.user.handle} already has roll no. ${rollNumber} as ${existingEntry.status}.`);
    return;
  }

  try {
    setSubmittingState(true);
    clearStatus();

    const payload = await apiRequest("/api/attendance", {
      body: {
        status,
      },
      method: "POST",
    });

    await syncEntries();
    const savedEntry = getExistingDisplayEntry(state.user.handle);

    if (payload.alreadyMarked && savedEntry) {
      setStatus(
        `${state.user.handle} already has roll no. ${String(savedEntry.rollNumber).padStart(2, "0")}.`,
      );
    } else if (savedEntry) {
      setStatus(
        `${state.user.handle} added at roll no. ${String(savedEntry.rollNumber).padStart(2, "0")}.`,
        "success",
      );
    } else {
      setStatus(`${state.user.handle} verified successfully.`, "success");
    }
  } catch (error) {
    if (error.status === 401) {
      setStatus("Verify with X again before marking attendance.");
      return;
    }

    if (error.status === 403 && error.data?.shareUrl) {
      state.shareUrl = error.data.shareUrl;
      elements.shareLink.href = state.shareUrl;
      setStatus(`Share "${REQUIRED_TWEET_TEXT}" exactly, then try again.`);
      return;
    }

    setStatus(error.message || "Could not mark attendance.");
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
  state.pollerId = window.setInterval(() => {
    if (!document.hidden) {
      syncEntries();
      syncViewer();
    }
  }, POLLING_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncEntries();
      syncViewer();
    }
  });
}

function consumeUrlStatusFlags() {
  const url = new URL(window.location.href);
  const authState = url.searchParams.get("auth");
  const authError = url.searchParams.get("auth_error");

  if (authState === "verified") {
    setStatus("X verified. Share the exact post if needed, then mark attendance.", "success");
    url.searchParams.delete("auth");
  }

  if (authError) {
    setStatus("Could not complete X verification. Try again.");
    url.searchParams.delete("auth_error");
  }

  if (authState || authError) {
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function init() {
  hydrateDate();
  window.setInterval(hydrateDate, 1000);
  initCreditReveal();
  renderCurrentEntries();
  renderVerificationState();
  consumeUrlStatusFlags();

  elements.form.addEventListener("submit", handleSubmit);
  elements.verifyAccount.addEventListener("click", handleVerifyClick);

  await Promise.all([syncViewer(), syncEntries()]);
  initPolling();
}

init();
