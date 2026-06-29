/**
 * content.js — Auto-scanning LARP Radar for LinkedIn
 *
 * Instead of a manual "Detect LARP" button, this version:
 * 1. IntersectionObserver: detects posts entering the viewport → injects a pending badge
 * 2. MutationObserver (per-post): fires when the user clicks "see more" → full text available → auto-analyzes
 * 3. Short posts (no "see more"): analyzed immediately on viewport entry
 *
 * Forked from: abdullah-mansoor3/linkedin-larp-detector
 */

const PROCESSED_ATTR = "data-larp-scanned";
const ANALYZED_ATTR  = "data-larp-done";

const SCORE_COLORS = {
  genuine:  { bg: "#e6f9f0", border: "#34d399", text: "#065f46" },
  mild:     { bg: "#fefce8", border: "#facc15", text: "#713f12" },
  moderate: { bg: "#fff7ed", border: "#fb923c", text: "#7c2d12" },
  high:     { bg: "#fef2f2", border: "#f87171", text: "#7f1d1d" },
  peak:     { bg: "#1a0505",  border: "#dc2626", text: "#fca5a5" },
};

function getScoreTier(score) {
  if (score <= 20) return "genuine";
  if (score <= 40) return "mild";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "peak";
}

function getScoreLabel(score) {
  if (score <= 20) return "✅ Genuine";
  if (score <= 40) return "🟡 Mild LARP";
  if (score <= 60) return "🟠 Moderate LARP";
  if (score <= 80) return "🔴 High LARP";
  return "💀 Peak LARP";
}

// ─── Text extraction (unchanged from original) ────────────────────────────────

function extractPostText(postEl) {
  const selectors = [
    ".feed-shared-update-v2__description",
    ".feed-shared-text",
    ".update-components-text",
    "[data-test-id='main-feed-activity-card__commentary']",
    ".attributed-text-segment-list__content",
  ];
  for (const sel of selectors) {
    const el = postEl.querySelector(sel);
    if (el && el.innerText.trim()) return el.innerText.trim();
  }
  const blocks = Array.from(postEl.querySelectorAll("p, span"));
  return blocks
    .map((b) => b.innerText.trim())
    .filter((t) => t.length > 20)
    .join("\n")
    .trim();
}

// ─── "See more" detection ─────────────────────────────────────────────────────

function findSeeMoreButton(postEl) {
  return (
    postEl.querySelector(".feed-shared-inline-show-more-text__see-more-less-toggle") ||
    postEl.querySelector("button.feed-shared-text-view__see-more") ||
    postEl.querySelector("button[aria-label*='see more']") ||
    postEl.querySelector("span.see-more") ||
    // generic fallback — any button with "see more" text
    Array.from(postEl.querySelectorAll("button, span[role='button']")).find(
      (el) => /see more/i.test(el.textContent)
    ) || null
  );
}

// ─── Badge (the inline pill that shows larp status) ──────────────────────────

function createBadge() {
  const badge = document.createElement("span");
  badge.className = "larp-pill";
  badge.style.cssText = `
    display: inline-flex; align-items: center;
    margin-left: 10px; padding: 2px 10px;
    border-radius: 999px; border: 1.5px solid #94a3b8;
    background: #f8fafc; color: #64748b;
    font-size: 12px; font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: default; user-select: none;
    transition: all 0.2s ease;
    vertical-align: middle;
  `;
  badge.textContent = "🎭 pending";
  return badge;
}

function updateBadgeLoading(badge) {
  badge.textContent = "🎭 scanning…";
  badge.style.borderColor = "#94a3b8";
  badge.style.color = "#64748b";
  badge.style.background = "#f1f5f9";
}

function updateBadgeResult(badge, data, postEl) {
  const tier   = getScoreTier(data.score);
  const colors = SCORE_COLORS[tier];
  const label  = getScoreLabel(data.score);

  badge.textContent = `${label} · ${data.score} · ${data.category}`;
  badge.style.borderColor = colors.border;
  badge.style.color       = colors.text;
  badge.style.background  = colors.bg;
  badge.style.cursor      = "pointer";
  badge.title             = "Click to see full breakdown";

  badge.onclick = () => renderResultCard(postEl, data, badge);
}

function updateBadgeError(badge) {
  badge.textContent    = "🎭 error";
  badge.style.color    = "#ef4444";
  badge.style.border   = "1.5px solid #ef4444";
  badge.style.background = "#fef2f2";
}

function updateBadgeRateLimit(badge) {
  badge.textContent  = "⏳ rate limited";
  badge.style.color  = "#f59e0b";
  badge.style.border = "1.5px solid #f59e0b";
  badge.style.background = "#fffbeb";
}

// ─── Result card (unchanged look, triggered on badge click) ──────────────────

function renderResultCard(postEl, data, badge) {
  // toggle off if already showing
  const existing = postEl.querySelector(".larp-result-card");
  if (existing) { existing.remove(); return; }

  const tier   = getScoreTier(data.score);
  const colors = SCORE_COLORS[tier];
  const label  = getScoreLabel(data.score);

  const card = document.createElement("div");
  card.className = "larp-result-card";
  card.style.cssText = `
    margin: 12px 0;
    padding: 16px;
    border-radius: 12px;
    border: 2px solid ${colors.border};
    background: ${colors.bg};
    color: ${colors.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    animation: larpFadeIn 0.3s ease;
  `;

  card.innerHTML = `
    <style>
      @keyframes larpFadeIn {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .larp-score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .larp-badge-inner {
        font-weight: 700; font-size: 13px; padding: 3px 10px;
        border-radius: 999px; background: ${colors.border};
        color: #fff; white-space: nowrap;
      }
      .larp-score-num { font-size: 22px; font-weight: 800; }
      .larp-category-label { font-size: 12px; opacity: 0.8; font-style: italic; }
      .larp-section-title {
        font-weight: 700; font-size: 12px; text-transform: uppercase;
        letter-spacing: 0.05em; margin: 10px 0 4px; opacity: 0.7;
      }
      .larp-reason { margin-bottom: 8px; }
      .larp-translation {
        background: rgba(0,0,0,0.06); border-radius: 8px;
        padding: 10px 12px; font-style: italic;
      }
      .larp-cached-note {
        font-size: 11px; opacity: 0.5; margin-top: 8px; text-align: right;
      }
      .larp-close {
        float: right; cursor: pointer; font-size: 18px;
        line-height: 1; opacity: 0.5; border: none; background: none;
        color: inherit; padding: 0; margin-left: 8px;
      }
      .larp-close:hover { opacity: 1; }
    </style>
    <div class="larp-score-row">
      <span class="larp-score-num">${data.score}</span>
      <div>
        <div><span class="larp-badge-inner">${label}</span></div>
        <div class="larp-category-label">${data.category}</div>
      </div>
      <button class="larp-close" title="Dismiss">✕</button>
    </div>
    <div class="larp-section-title">Why</div>
    <div class="larp-reason">${data.reason}</div>
    <div class="larp-section-title">What they actually mean</div>
    <div class="larp-translation">${data.translation}</div>
    ${data.cached ? '<div class="larp-cached-note">⚡ Cached result</div>' : ""}
  `;

  card.querySelector(".larp-close").addEventListener("click", () => card.remove());
  postEl.appendChild(card);
}

// ─── Core: analyze a post ────────────────────────────────────────────────────

async function analyzePost(postEl, badge) {
  if (postEl.hasAttribute(ANALYZED_ATTR)) return;
  postEl.setAttribute(ANALYZED_ATTR, "true");

  const text = extractPostText(postEl);
  if (!text || text.length < 30) {
    // not enough text — reset so it can retry later
    postEl.removeAttribute(ANALYZED_ATTR);
    return;
  }

  updateBadgeLoading(badge);

  try {
    const result = await chrome.runtime.sendMessage({ type: "ANALYZE_POST", text });

    if (result?.error) {
      if (/rate/i.test(result.error)) updateBadgeRateLimit(badge);
      else updateBadgeError(badge);
      postEl.removeAttribute(ANALYZED_ATTR);
      return;
    }

    updateBadgeResult(badge, result, postEl);

  } catch (err) {
    updateBadgeError(badge);
    postEl.removeAttribute(ANALYZED_ATTR);
  }
}

// ─── Per-post setup ───────────────────────────────────────────────────────────

function setupPost(postEl) {
  if (postEl.hasAttribute(PROCESSED_ATTR)) return;
  postEl.setAttribute(PROCESSED_ATTR, "true");

  // Inject badge into the action bar (like/comment row)
  const actionBar =
    postEl.querySelector(".feed-shared-social-action-bar") ||
    postEl.querySelector(".social-actions-bar") ||
    postEl;

  const badge = createBadge();
  actionBar.appendChild(badge);

  const seeMoreBtn = findSeeMoreButton(postEl);

  if (!seeMoreBtn) {
    // Short post — analyze immediately
    analyzePost(postEl, badge);
    return;
  }

  // Long post — wait for "see more" click so we get the full text
  badge.title = "Will auto-analyze when you expand the post";

  // MutationObserver watches the post DOM for when the see-more button disappears
  // (LinkedIn removes or hides it once the text is expanded)
  const seeMoreObserver = new MutationObserver(() => {
    const stillHidden = findSeeMoreButton(postEl);
    if (!stillHidden || stillHidden.offsetParent === null) {
      // Button gone or hidden → text is now fully expanded
      seeMoreObserver.disconnect();
      analyzePost(postEl, badge);
    }
  });

  seeMoreObserver.observe(postEl, { childList: true, subtree: true, attributes: true });
}

// ─── IntersectionObserver: lazy-init posts as they enter the viewport ─────────

const viewportObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setupPost(entry.target);
        // Only need to set it up once
        viewportObserver.unobserve(entry.target);
      }
    });
  },
  { rootMargin: "0px 0px 200px 0px" } // 200px lookahead below fold
);

// ─── DOM scanner ─────────────────────────────────────────────────────────────

const POST_SELECTORS = [
  ".feed-shared-update-v2",
  ".occludable-update",
  "[data-urn]",
];

function scanForPosts() {
  POST_SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (!el.hasAttribute(PROCESSED_ATTR)) {
        viewportObserver.observe(el);
      }
    });
  });
}

// Initial scan
scanForPosts();

// Watch for new posts injected by LinkedIn's SPA
const domObserver = new MutationObserver(scanForPosts);
domObserver.observe(document.body, { childList: true, subtree: true });