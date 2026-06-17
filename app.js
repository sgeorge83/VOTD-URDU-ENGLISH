const API_URL = "https://urdu-bible-api.vercel.app/votd?include_english=true";
const CACHE_KEY = "votd_urdu_english";
const FETCH_TIMEOUT_MS = 15000;
const VOTD_TIMEZONE = "Asia/Dubai";
const VOTD_REFRESH_HOUR = 9;
const VOTD_RETRY_MINUTE = 5;
const BACKGROUND_FETCH_DEBOUNCE_MS = 60000;

const loaderEl = document.getElementById("loader");
const contentEl = document.getElementById("content");
const urduVerseEl = document.getElementById("urdu-verse");
const englishVerseEl = document.getElementById("english-verse");
const referenceEnglishEl = document.getElementById("reference-english");
const referenceUrduEl = document.getElementById("reference-urdu");
const dateLabelEl = document.getElementById("date-label");
const errorEl = document.getElementById("error");
const copyBtn = document.getElementById("copy-btn");
const shareBtn = document.getElementById("share-btn");

let currentPayload = null;
let lastBackgroundFetchAt = 0;
let primaryRefreshTimer = null;
let retryRefreshTimer = null;

function cleanVerseText(text) {
  return String(text || "")
    .replace(/^\u00B6\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatVerseRange(verses) {
  if (!Array.isArray(verses) || verses.length === 0) return "";
  if (verses.length === 1) return String(verses[0]);
  return `${verses[0]}-${verses[verses.length - 1]}`;
}

function formatUrduReference(ref) {
  if (!ref) return "";
  const range = formatVerseRange(ref.verses);
  return `${ref.book_name_urdu} ${ref.chapter}: ${range}`;
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return "";
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function getDateInTimezone(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getUaeMinutesSinceMidnight(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VOTD_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function getMsUntilUaeTime(hour, minute) {
  const targetMinutes = hour * 60 + minute;
  const nowMinutes = getUaeMinutesSinceMidnight();
  let diffMinutes = targetMinutes - nowMinutes;

  if (diffMinutes <= 0) {
    diffMinutes += 24 * 60;
  }

  return diffMinutes * 60 * 1000;
}

function hasVerseChanged(data) {
  if (!currentPayload) return true;

  return (
    currentPayload.date !== data.date ||
    currentPayload.reference?.english !== data.reference?.english
  );
}

function shouldRefreshOnFocus() {
  if (!currentPayload) return true;

  const uaeToday = getDateInTimezone(VOTD_TIMEZONE);
  if (currentPayload.date === uaeToday) return false;

  const uaeMinutes = getUaeMinutesSinceMidnight();
  return uaeMinutes >= VOTD_REFRESH_HOUR * 60;
}

function joinVerseTexts(items, textKey) {
  return items
    .map((item) => cleanVerseText(item[textKey]))
    .filter(Boolean)
    .join(" ");
}

function buildShareText(data) {
  const urdu = joinVerseTexts(data.verses || [], "text");
  const english = joinVerseTexts(data.english_verses || [], "text");
  const englishRef = data.reference?.english || "";
  const urduRef = formatUrduReference(data.reference);
  const date = formatDisplayDate(data.date);

  return [urdu, "", english, "", `${englishRef} | ${urduRef}`, date].join("\n");
}

function renderVerse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid verse data");
  }

  currentPayload = data;

  if (urduVerseEl) {
    urduVerseEl.textContent = joinVerseTexts(data.verses || [], "text");
  }
  if (englishVerseEl) {
    englishVerseEl.textContent = joinVerseTexts(data.english_verses || [], "text");
  }

  const englishRef = data.reference?.english || "";
  const urduRef = formatUrduReference(data.reference);

  if (referenceEnglishEl) referenceEnglishEl.textContent = englishRef;
  if (referenceUrduEl) referenceUrduEl.textContent = urduRef;
  if (dateLabelEl) dateLabelEl.textContent = formatDisplayDate(data.date);

  errorEl?.classList.add("hidden");
  contentEl?.classList.remove("hidden");
}

function showError(message) {
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
}

function hideLoader() {
  loaderEl?.classList.add("hidden");
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchVerse({ background = false } = {}) {
  const isInitialLoad = !currentPayload && !background;

  if (isInitialLoad) {
    loaderEl?.classList.remove("hidden");
    contentEl?.classList.add("hidden");
  }

  if (!background) {
    errorEl?.classList.add("hidden");
  }

  try {
    const response = await fetchWithTimeout(API_URL);

    if (!response.ok) {
      throw new Error(`Could not load verse (${response.status})`);
    }

    const data = await response.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));

    if (hasVerseChanged(data)) {
      renderVerse(data);
    } else if (!currentPayload) {
      renderVerse(data);
    }
  } catch (err) {
    if (background && currentPayload) {
      return;
    }

    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
      try {
        renderVerse(JSON.parse(cached));
        showError("Showing cached verse. Could not refresh from the server.");
        return;
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    const message =
      err.name === "AbortError"
        ? "Request timed out. Check your connection and refresh."
        : err.message || "Could not load today's verse.";

    showError(message);
  } finally {
    if (isInitialLoad || !background) {
      hideLoader();
    }
  }
}

function maybeBackgroundRefresh() {
  if (!shouldRefreshOnFocus()) return;

  const now = Date.now();
  if (now - lastBackgroundFetchAt < BACKGROUND_FETCH_DEBOUNCE_MS) return;

  lastBackgroundFetchAt = now;
  fetchVerse({ background: true });
}

function startUaeRefreshLoop(hour, minute, assignTimer) {
  const scheduleNext = () => {
    assignTimer(
      window.setTimeout(async () => {
        lastBackgroundFetchAt = Date.now();
        await fetchVerse({ background: true });
        scheduleNext();
      }, getMsUntilUaeTime(hour, minute))
    );
  };

  scheduleNext();
}

function scheduleDailyUaeRefresh() {
  if (primaryRefreshTimer) window.clearTimeout(primaryRefreshTimer);
  if (retryRefreshTimer) window.clearTimeout(retryRefreshTimer);

  startUaeRefreshLoop(VOTD_REFRESH_HOUR, 0, (id) => {
    primaryRefreshTimer = id;
  });
  startUaeRefreshLoop(VOTD_REFRESH_HOUR, VOTD_RETRY_MINUTE, (id) => {
    retryRefreshTimer = id;
  });
}

async function copyVerse() {
  if (!currentPayload) return;

  const text = buildShareText(currentPayload);

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1800);
  } catch {
    showError("Copy failed. Your browser may block clipboard access.");
  }
}

async function shareVerse() {
  if (!currentPayload) return;

  const text = buildShareText(currentPayload);
  const title = "Verse of the Day";
  const url = window.location.href;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch (err) {
      if (err.name !== "AbortError") {
        showError("Share failed.");
      }
    }
    return;
  }

  await copyVerse();
  showError("Share is not supported here — verse copied to clipboard instead.");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline shell is optional; the app still works without it.
    });
  });
}

function registerRefreshHandlers() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybeBackgroundRefresh();
    }
  });

  window.addEventListener("focus", maybeBackgroundRefresh);
}

copyBtn?.addEventListener("click", copyVerse);
shareBtn?.addEventListener("click", shareVerse);

registerServiceWorker();
registerRefreshHandlers();
scheduleDailyUaeRefresh();
fetchVerse();
