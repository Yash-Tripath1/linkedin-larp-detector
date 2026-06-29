/**
 * content.js
 *
 * Auto-scans LinkedIn posts as they enter the viewport.
 * - Injects a small "🎭 analyzing..." badge
 * - Analyzes short posts immediately
 * - Waits for expanded text on long "see more" posts
 * - Sends text to background.js via chrome.runtime.sendMessage
 * - Updates badge with score + label
 */

const POST_PROCESSED_ATTR = "data-larp-processed";
const POST_ANALYZING_ATTR = "data-larp-analyzing";
const POST_ANALYZED_ATTR = "data-larp-analyzed";
const BADGE_CLASS = "larp-detector-pill";
const CARD_CLASS = "larp-detector-card";

const SCORE_COLORS = {
  genuine: { bg: "#ecfdf5", border: "#34d399", text: "#065f46" },
  mild: { bg: "#fefce8", border: "#facc15", text: "#713f12" },
  moderate: { bg: "#fff7ed", border: "#fb923c", text: "#7c2d12" },
  high: { bg: "#fef2f2", border: "#f87171", text: "#7f1d1d" },
  peak: { bg: "#1f0909", border: "#dc2626", text: "#fecaca" },
  pending: { bg: "#f8fafc", border: "#cbd5e1", text: "#475569" },
  error: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
  warning: { bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
};

const POST_SELECTORS = [
  ".feed-shared-update-v2",
  ".occludable-update",
  "[data-urn]"
];

function getScoreTier(score) {
  if (score <= 20) return "genuine";
  if (score <= 40) return "mild";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "peak";
}

function getDisplayLabel(score, label) {
  if (label && typeof label === "string" && label.trim()) return label.trim();
  if (score <= 20) return "Genuine";
  if (score <= 40) return "Mild LARP";
  if (score <= 60) return "Moderate LARP";
  if (score <= 80) return "High LARP";
  return "Peak LARP";
}

function applyBadgeStyle(badge, palette) {
  badge.style.background = palette.bg;
  badge.style.borderColor = palette.border;
  badge.style.color = palette.text;
}

function createBadge() {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = BADGE_CLASS;
  badge.textContent = "🎭 analyzing...";
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid ${SCORE_COLORS.pending.border};
    background: ${SCORE_COLORS.pending.bg};
    color: ${SCORE_COLORS.pending.text};
    font-size: 12px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.2;
    cursor: default;
    user-select: none;
    appearance: none;
    box-shadow: none;
  `;
  badge.disabled = true;
  badge.title = "Analyzing this post";
  return badge;
}

function setBadgePending(badge, message = "🎭 analyzing...") {
  badge.textContent = message;
  badge.disabled = true;
  badge.style.cursor = "default";
  applyBadgeStyle(badge, SCORE_COLORS.pending);
}

function setBadgeError(badge, message = "🎭 error analyzing") {
  badge.textContent = message;
  badge.disabled = false;
  badge.style.cursor = "pointer";
  applyBadgeStyle(badge, SCORE_COLORS.error);
  badge.title = "Click to retry";
}

function setBadgeRateLimited(badge) {
  badge.textContent = "⏳ rate limited";
  badge.disabled = false;
  badge.style.cursor = "pointer";
  applyBadgeStyle(badge, SCORE_COLORS.warning);
  badge.title = "Click to retry";
}

function setBadgeResult(badge, result) {
  const score = Number(result?.score ?? 0);
  const label = getDisplayLabel(score, result?.label);
  const tier = getScoreTier(score);
  applyBadgeStyle(badge, SCORE_COLORS[tier]);
  badge.textContent = `🎭 ${score}% LARP — ${label}`;
  badge.disabled = false;
  badge.style.cursor = "pointer";
  badge.title = "Click to view analysis";
}

function removeExistingCard(postEl) {
  const existing = postEl.querySelector(`.${CARD_CLASS}`);
  if (existing) existing.remove();
}

function renderResultCard(postEl, result) {
  removeExistingCard(postEl);

  const score = Number(result?.score ?? 0);
  const label = getDisplayLabel(score, result?.label);
  const reason = result?.reason || "No explanation returned.";
  const translation = result?.translation || null;
  const tier = getScoreTier(score);
  const colors = SCORE_COLORS[tier];

  const card = document.createElement("div");
  card.className = CARD_CLASS;
  card.style.cssText = `
    margin-top: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1.5px solid ${colors.border};
    background: ${colors.bg};
    color: ${colors.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
  `;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
      <div style="font-weight:700;font-size:15px;">🎭 ${score}% LARP — ${escapeHtml(label)}</div>
      <button
        type="button"
        class="larp-close"
        style="
          border:none;
          background:transparent;
          color:inherit;
          cursor:pointer;
          font-size:18px;
          line-height:1;
          padding:0;
        "
        aria-label="Close analysis"
      >×</button>
    </div>

    <div style="margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;opacity:0.8;text-transform:uppercase;letter-spacing:0.04em;">Reason</div>
      <div>${escapeHtml(reason)}</div>
    </div>

    ${
      translation
        ? `
      <div>
        <div style="font-size:12px;font-weight:700;opacity:0.8;text-transform:uppercase;letter-spacing:0.04em;">What they actually mean</div>
        <div>${escapeHtml(translation)}</div>
      </div>
    `
        : ""
    }
  `;

  const closeBtn = card.querySelector(".larp-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => card.remove());
  }

  postEl.appendChild(card);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractPostText(postEl) {
  const selectors = [
    ".feed-shared-update-v2__description",
    ".feed-shared-text",
    ".update-components-text",
    "[data-test-id='main-feed-activity-card__commentary']",
    ".attributed-text-segment-list__content",
  ];

  for (const selector of selectors) {
    const el = postEl.querySelector(selector);
    const text = el?.innerText?.trim();
    if (text && text.length > 20) return normalizeWhitespace(text);
  }

  const fallbackBlocks = Array.from(postEl.querySelectorAll("p, span, div"))
    .map((el) => el.innerText?.trim() || "")
    .filter((text) => text.length > 30);

  const joined = fallbackBlocks.join("\n").trim();
  return normalizeWhitespace(joined);
}

function normalizeWhitespace(text) {
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function findSeeMoreButton(postEl) {
  const directMatches = [
    ".feed-shared-inline-show-more-text__see-more-less-toggle",
    "button.feed-shared-text-view__see-more",
    "button[aria-label*='see more' i]",
  ];

  for (const selector of directMatches) {
    const el = postEl.querySelector(selector);
    if (el) return el;
  }

  return Array.from(postEl.querySelectorAll("button, span[role='button'], div[role='button']"))
    .find((el) => /see more/i.test(el.textContent || "")) || null;
}

function isElementVisible(el) {
  return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

function getBadgeAnchor(postEl) {
  return (
    postEl.querySelector(".feed-shared-social-action-bar") ||
    postEl.querySelector(".social-actions-bar") ||
    postEl.querySelector(".feed-shared-update-v2__description-wrapper") ||
    postEl
  );
}

function ensureBadge(postEl) {
  let badge = postEl.querySelector(`.${BADGE_CLASS}`);
  if (badge) return badge;

  badge = createBadge();
  const anchor = getBadgeAnchor(postEl);
  anchor.appendChild(badge);
  return badge;
}

async function analyzePost(postEl, badge) {
  if (postEl.hasAttribute(POST_ANALYZING_ATTR) || postEl.hasAttribute(POST_ANALYZED_ATTR)) {
    return;
  }

  const text = extractPostText(postEl);
  if (!text || text.length < 30) return;

  postEl.setAttribute(POST_ANALYZING_ATTR, "true");
  setBadgePending(badge, "🎭 analyzing...");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "ANALYZE_POST",
      text,
    });

    postEl.removeAttribute(POST_ANALYZING_ATTR);

    if (!result) {
      setBadgeError(badge, "🎭 no response");
      badge.onclick = () => analyzePost(postEl, badge);
      return;
    }

    if (result.error) {
      if (/rate/i.test(result.error)) {
        setBadgeRateLimited(badge);
      } else {
        setBadgeError(badge, "🎭 analysis failed");
      }
      badge.onclick = () => analyzePost(postEl, badge);
      return;
    }

    postEl.setAttribute(POST_ANALYZED_ATTR, "true");
    setBadgeResult(badge, result);

    badge.onclick = () => {
      const existing = postEl.querySelector(`.${CARD_CLASS}`);
      if (existing) {
        existing.remove();
      } else {
        renderResultCard(postEl, result);
      }
    };
  } catch (error) {
    postEl.removeAttribute(POST_ANALYZING_ATTR);
    setBadgeError(badge, "🎭 analysis failed");
    badge.onclick = () => analyzePost(postEl, badge);
  }
}

function watchExpandedPost(postEl, badge) {
  const observer = new MutationObserver(() => {
    const btn = findSeeMoreButton(postEl);
    if (!btn || !isElementVisible(btn)) {
      observer.disconnect();
      setBadgePending(badge, "🎭 analyzing...");
      analyzePost(postEl, badge);
    }
  });

  observer.observe(postEl, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  // fallback: let user manually click later and we still keep the observer alive
  setBadgePending(badge, "🎭 expand post to analyze");
}

function setupPost(postEl) {
  if (!(postEl instanceof HTMLElement)) return;
  if (postEl.hasAttribute(POST_PROCESSED_ATTR)) return;

  postEl.setAttribute(POST_PROCESSED_ATTR, "true");
  const badge = ensureBadge(postEl);

  const seeMoreBtn = findSeeMoreButton(postEl);
  if (seeMoreBtn && isElementVisible(seeMoreBtn)) {
    watchExpandedPost(postEl, badge);
  } else {
    analyzePost(postEl, badge);
  }
}

const viewportObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      setupPost(entry.target);
      viewportObserver.unobserve(entry.target);
    }
  },
  {
    root: null,
    rootMargin: "0px 0px 250px 0px",
    threshold: 0.05,
  }
);

function looksLikeRealPost(el) {
  if (!(el instanceof HTMLElement)) return false;
  const text = el.innerText?.trim() || "";
  if (text.length < 40) return false;

  const hasLinkedInPostMarkers =
    el.querySelector(".feed-shared-social-action-bar") ||
    el.querySelector(".feed-shared-update-v2__description") ||
    el.querySelector(".update-components-text") ||
    el.querySelector("[aria-label*='Like' i]");

  return !!hasLinkedInPostMarkers;
}

function scanForPosts() {
  for (const selector of POST_SELECTORS) {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => {
      if (!looksLikeRealPost(node)) return;
      if (node.hasAttribute(POST_PROCESSED_ATTR)) return;
      viewportObserver.observe(node);
    });
  }
}

function boot() {
  scanForPosts();

  const domObserver = new MutationObserver(() => {
    scanForPosts();
  });

  if (document.body) {
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

boot();