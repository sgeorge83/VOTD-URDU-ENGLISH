const ENGLISH_API_URL = "https://bible-widget-backend.vercel.app/api/morning";
const URDU_API_BASE = "https://urdu-bible-api.vercel.app";
const CACHE_KEY = "votd_urdu_english_esv_v1";
const FETCH_TIMEOUT_MS = 15000;
const VOTD_TIMEZONE = "Asia/Dubai";
const VOTD_REFRESH_HOUR = 9;
const VOTD_RETRY_MINUTE = 5;
const BACKGROUND_FETCH_DEBOUNCE_MS = 60000;

const ENGLISH_BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalm", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
  "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
];

const BOOK_ALIASES = {
  psalms: "Psalm",
  "song of songs": "Song of Solomon",
  "canticles": "Song of Solomon",
  "apocalypse": "Revelation",
};

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

function cleanEsvText(esvText, reference) {
  let text = String(esvText || "").trim();

  if (reference) {
    const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^${escaped}\\s*`, "i"), "");
  }

  return text
    .replace(/\[\d+\]\s*/g, "")
    .replace(/\s*\(ESV\)\s*$/i, "")
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

function englishBookToId(bookName) {
  const normalized = String(bookName || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  const aliased = BOOK_ALIASES[normalized] || bookName;
  const aliasNormalized = String(aliased).trim().toLowerCase();

  const index = ENGLISH_BOOK_NAMES.findIndex(
    (name) => name.toLowerCase() === aliasNormalized
  );

  return index === -1 ? null : index + 1;
}

function parseEnglishReference(reference) {
  const match = String(reference || "")
    .trim()
    .match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);

  if (!match) {
    throw new Error(`Could not parse reference: ${reference}`);
  }

  const bookName = match[1].trim();
  const bookId = englishBookToId(bookName);
  if (!bookId) {
    throw new Error(`Unknown book name: ${bookName}`);
  }

  const chapter = Number(match[2]);
  const startVerse = Number(match[3]);
  const endVerse = match[4] ? Number(match[4]) : startVerse;
  const verses = [];

  for (let verse = startVerse; verse <= endVerse; verse += 1) {
    verses.push(verse);
  }

  return {
    english: `${ENGLISH_BOOK_NAMES[bookId - 1]} ${chapter}:${formatVerseRange(verses)}`,
    book_id: bookId,
    book_name_english: ENGLISH_BOOK_NAMES[bookId - 1],
    chapter,
    verses,
  };
}

function hasVerseChanged(data) {
  if (!currentPayload) return true;

  return (
    currentPayload.date !== data.date ||
    currentPayload.reference?.english !== data.reference?.english ||
    currentPayload.english_text !== data.english_text
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
  const english = data.english_text || "";
  const englishRef = data.reference?.english || "";
  const urduRef = formatUrduReference(data.reference);
  const date = formatDisplayDate(data.date);

  return [
    urdu,
    "",
    english,
    "",
    `${englishRef} | ${urduRef}`,
    date,
    "",
    "Urdu: Urdu Geo Version",
    "English: ESV",
    "WordOnAir Labs",
  ].join("\n");
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
    englishVerseEl.textContent = data.english_text || "";
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

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchUrduVerses(bookId, chapter, verses) {
  const results = await Promise.all(
    verses.map((verse) =>
      fetchJson(`${URDU_API_BASE}/books/${bookId}/chapters/${chapter}/verses/${verse}`)
    )
  );
  return results;
}

async function loadTodayVerse() {
  const morning = await fetchJson(ENGLISH_API_URL);
  const reference = String(morning.reference || "").trim();
  if (!reference || !morning.esv_text) {
    throw new Error("Morning API did not return a verse");
  }

  const parsed = parseEnglishReference(reference);
  const urduVerses = await fetchUrduVerses(
    parsed.book_id,
    parsed.chapter,
    parsed.verses
  );

  return {
    date: getDateInTimezone(VOTD_TIMEZONE),
    reference: {
      ...parsed,
      book_name_urdu: urduVerses[0]?.book_name || "",
    },
    english_text: cleanEsvText(morning.esv_text, reference),
    verses: urduVerses,
    source: {
      english_provider: "bible-widget-backend / ESV",
      urdu_provider: "urdu-bible-api",
    },
  };
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
    const data = await loadTodayVerse();
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

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
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
