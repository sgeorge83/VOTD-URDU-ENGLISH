const API_URL = "https://urdu-bible-api.vercel.app/votd?include_english=true";
const CACHE_KEY = "votd_urdu_english";

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

  return [
    urdu,
    "",
    english,
    "",
    `${englishRef} | ${urduRef}`,
    date,
  ].join("\n");
}

function renderVerse(data) {
  currentPayload = data;

  urduVerseEl.textContent = joinVerseTexts(data.verses || [], "text");
  englishVerseEl.textContent = joinVerseTexts(data.english_verses || [], "text");

  const englishRef = data.reference?.english || "";
  const urduRef = formatUrduReference(data.reference);
  referenceEnglishEl.textContent = englishRef;
  referenceUrduEl.textContent = urduRef;
  dateLabelEl.textContent = formatDisplayDate(data.date);

  loaderEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  contentEl.classList.remove("hidden");
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
  loaderEl.classList.add("hidden");
}

async function fetchVerse() {
  loaderEl.classList.remove("hidden");
  errorEl.classList.add("hidden");

  try {
    const response = await fetch(API_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Could not load verse (${response.status})`);
    }

    const data = await response.json();
    renderVerse(data);
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      renderVerse(JSON.parse(cached));
      showError("Showing cached verse. Could not refresh from the server.");
      return;
    }

    showError(err.message || "Could not load today's verse.");
  }
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
      // PWA install still works in many browsers without SW; fail silently.
    });
  });
}

copyBtn.addEventListener("click", copyVerse);
shareBtn.addEventListener("click", shareVerse);

registerServiceWorker();
fetchVerse();
setInterval(fetchVerse, 600000);
