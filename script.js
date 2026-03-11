const STORAGE_KEY = "roll-call-attendance-v1";
const HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/;

const elements = {
  attendanceCount: document.getElementById("attendance-count"),
  currentDate: document.getElementById("current-date"),
  currentDay: document.getElementById("current-day"),
  form: document.getElementById("attendance-form"),
  formStatus: document.getElementById("form-status"),
  nextRoll: document.getElementById("next-roll"),
  rollList: document.getElementById("roll-list"),
  rollPreview: document.getElementById("roll-preview"),
  statusField: document.getElementById("attendance-status"),
  summaryDate: document.getElementById("summary-date"),
  summaryDay: document.getElementById("summary-day"),
  template: document.getElementById("empty-state-template"),
  twitterHandle: document.getElementById("twitter-handle"),
};

function loadRegister() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : { entries: [] };
    return normalizeRegisterShape(parsed);
  } catch (error) {
    console.error("Could not parse saved register:", error);
    return { entries: [] };
  }
}

function saveRegister(register) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(register));
}

function normalizeRegisterShape(parsed) {
  if (Array.isArray(parsed?.entries)) {
    return {
      entries: dedupeEntries(parsed.entries),
    };
  }

  const migratedEntries = Object.entries(parsed || {})
    .filter(([, value]) => Array.isArray(value))
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .flatMap(([dateKey, entries]) =>
      entries.map((entry, index) => ({
        handle: entry.handle || "",
        timestamp: Number.isFinite(entry.timestamp)
          ? entry.timestamp
          : new Date(`${dateKey}T00:00:00`).getTime() + index,
      })),
    );

  return {
    entries: dedupeEntries(migratedEntries),
  };
}

function dedupeEntries(entries) {
  const seen = new Set();

  return entries
    .filter(
      (entry) =>
        entry &&
        typeof entry.handle === "string" &&
        HANDLE_PATTERN.test(entry.handle.trim()),
    )
    .map((entry) => ({
      handle: formatHandle(entry.handle),
      timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
    }))
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter((entry) => {
      if (seen.has(entry.handle)) {
        return false;
      }

      seen.add(entry.handle);
      return true;
    });
}

function formatHandle(handle) {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  return `@${normalized}`;
}

function formatDateParts(date = new Date()) {
  const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  const fullDate = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const summaryDate = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

  return { weekdayLong, fullDate, summaryDate };
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatJoinedDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getEntries(register) {
  return Array.isArray(register.entries) ? register.entries : [];
}

function setStatus(message, tone = "default") {
  elements.formStatus.textContent = message;
  elements.formStatus.classList.remove("success");

  if (tone === "success") {
    elements.formStatus.classList.add("success");
  }
}

function clearStatus(entries) {
  setStatus("");
  updateSummary(entries);
}

function renderList(entries) {
  elements.rollList.replaceChildren();

  if (!entries.length) {
    const emptyNode = elements.template.content.cloneNode(true);
    elements.rollList.appendChild(emptyNode);
    return;
  }

  const items = entries.map((entry, index) => {
    const row = document.createElement("li");
    row.className = "roll-item";

    const rollNumber = document.createElement("span");
    rollNumber.className = "roll-number";
    rollNumber.textContent = String(index + 1).padStart(2, "0");

    const entryMeta = document.createElement("div");

    const handle = document.createElement("div");
    handle.className = "roll-handle";
    handle.textContent = entry.handle;

    const time = document.createElement("div");
    time.className = "roll-time";
    time.textContent = `Marked present on ${formatJoinedDate(entry.timestamp)} at ${formatTime(entry.timestamp)}`;

    const badge = document.createElement("span");
    badge.className = "roll-badge";
    badge.textContent = "Present";

    entryMeta.append(handle, time);
    row.append(rollNumber, entryMeta, badge);
    return row;
  });

  elements.rollList.append(...items);
}

function updateSummary(entries) {
  const nextRollNumber = String(entries.length + 1).padStart(2, "0");
  const countLabel = entries.length === 1 ? "1 in directory" : `${entries.length} in directory`;

  elements.attendanceCount.textContent = countLabel;
  elements.nextRoll.textContent = `Next roll no. ${nextRollNumber}`;
  elements.rollPreview.textContent = nextRollNumber;
}

function hydrateDate() {
  const now = new Date();
  const { weekdayLong, fullDate, summaryDate } = formatDateParts(now);

  elements.currentDay.textContent = weekdayLong;
  elements.currentDate.textContent = fullDate;
  elements.summaryDay.textContent = weekdayLong;
  elements.summaryDate.textContent = summaryDate;

}

function handleSubmit(register) {
  return function onSubmit(event) {
    event.preventDefault();

    const rawValue = elements.twitterHandle.value.trim();
    const attendanceStatus = elements.statusField.value;

    if (!HANDLE_PATTERN.test(rawValue)) {
      setStatus("Enter a valid Twitter username to continue.");
      return;
    }

    if (attendanceStatus !== "present") {
      setStatus("Select Present before adding yourself to the register.");
      return;
    }

    const handle = formatHandle(rawValue);
    const entries = getEntries(register);
    const existingEntry = entries.find((entry) => entry.handle === handle);

    if (existingEntry) {
      const rollNumber = String(entries.indexOf(existingEntry) + 1).padStart(2, "0");
      setStatus(`${handle} is already marked present at roll no. ${rollNumber}.`);
      elements.rollPreview.textContent = rollNumber;
      return;
    }

    const entry = {
      handle,
      timestamp: Date.now(),
    };

    register.entries = [...entries, entry];
    saveRegister(register);

    renderList(register.entries);
    updateSummary(register.entries);
    setStatus(`${handle} marked present successfully.`, "success");
    elements.form.reset();
    elements.rollPreview.textContent = String(register.entries.length + 1).padStart(2, "0");
    elements.twitterHandle.focus();
  };
}

function init() {
  const register = loadRegister();
  saveRegister(register);
  hydrateDate();
  const entries = getEntries(register);

  renderList(entries);
  updateSummary(entries);
  elements.form.addEventListener("submit", handleSubmit(register));
  elements.twitterHandle.addEventListener("input", () => clearStatus(getEntries(register)));
  elements.statusField.addEventListener("change", () => clearStatus(getEntries(register)));
}

init();
