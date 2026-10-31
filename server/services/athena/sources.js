import { createHash } from "node:crypto";
export const QUALITY_DISCLAIMER =
  "Heuristic assessment, not verified authority, factual accuracy or peer-review status.";
export const hash = (text) => createHash("sha256").update(text).digest("hex");
export const normalizeQuery = (query) =>
  query.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function canonicalizeUrl(value) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Unsupported source URL.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i.test(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  // Identity key only; links and provenance retain the provider's original URL.
  return url.href;
}
const onDomain = (host, root) => host === root || host.endsWith(`.${root}`);
export function classifySource({ url, title = "", provider }) {
  const parsed = new URL(url),
    host = parsed.hostname.toLowerCase(),
    path = parsed.pathname.toLowerCase();
  if (
    provider === "arxiv" ||
    [
      "arxiv.org",
      "pubmed.ncbi.nlm.nih.gov",
      "pmc.ncbi.nlm.nih.gov",
      "doi.org",
      "nature.com",
      "sciencedirect.com",
      "journals.plos.org",
      "openreview.net",
    ].some((root) => onDomain(host, root))
  )
    return "Academic research";
  if (
    /\.(csv|tsv|parquet|xlsx)$/.test(path) ||
    [
      "data.gov",
      "data.gov.in",
      "data.worldbank.org",
      "ourworldindata.org",
      "kaggle.com",
      "zenodo.org",
    ].some((root) => onDomain(host, root)) ||
    /\/(datasets?|statistics|data)\//.test(path)
  )
    return "Statistical dataset";
  if (
    /(^|\.)gov(\.[a-z]{2})?$/.test(host) ||
    /\.(gov|nic)\.in$/.test(host) ||
    host.endsWith(".gouv.fr") ||
    ["europa.eu", "un.org", "worldbank.org", "oecd.org"].some((root) =>
      onDomain(host, root),
    )
  )
    return "Government";
  if (
    /(^|\.)(docs|developer|developers|documentation)\./.test(host) ||
    /\/(docs|documentation|reference|api-reference)(\/|$)/.test(path)
  )
    return "Technical documentation";
  if (
    [
      "reuters.com",
      "apnews.com",
      "bbc.com",
      "bbc.co.uk",
      "ft.com",
      "thehindu.com",
      "indianexpress.com",
      "bloomberg.com",
      "nytimes.com",
    ].some((root) => onDomain(host, root)) ||
    /\/(news|articles)\//.test(path)
  )
    return "News";
  if (
    /\b(industry|market|annual|sector) report\b/i.test(title) ||
    /\/(reports?|research-insights)\//.test(path)
  )
    return "Industry report";
  if (
    /\/(company|about-us|investors|products?|press-release|blog)(\/|$)/.test(
      path,
    )
  )
    return "Company";
  return "Web";
}
const terms = (text) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(
      (word) =>
        !new Set([
          "the",
          "and",
          "for",
          "with",
          "from",
          "what",
          "which",
          "how",
          "are",
          "was",
          "research",
          "evidence",
        ]).has(word),
    ),
  );
export function assessSource(source, query, now = new Date()) {
  const category = source.category,
    content = source.content || "",
    host = source.domain;
  const credibility =
    category === "Government"
      ? 0.85
      : category === "Academic research"
        ? 0.8
        : category === "Technical documentation"
          ? 0.75
          : category === "Statistical dataset"
            ? 0.75
            : category === "News"
              ? 0.65
              : 0.5;
  const primary = [
    "Government",
    "Technical documentation",
    "Statistical dataset",
  ].includes(category)
    ? "likely_primary"
    : category === "Academic research"
      ? "potential_primary"
      : category === "Company"
        ? "primary_for_own_claims"
        : category === "News"
          ? "likely_secondary"
          : category === "Industry report"
            ? "mixed_or_secondary"
            : "undetermined";
  const requested = terms(query),
    available = terms(source.title + " " + content);
  const overlap = requested.size
    ? [...requested].filter((word) => available.has(word)).length /
      requested.size
    : 0;
  const relevance = Number.isFinite(source.providerScore)
    ? Math.max(0, Math.min(1, source.providerScore)) * 0.6 + overlap * 0.4
    : overlap;
  const age = source.publishedAt
    ? (now - new Date(source.publishedAt)) / 86400000
    : null;
  const freshness =
    age === null || !Number.isFinite(age) || age < 0
      ? null
      : Math.max(0.2, 1 - age / (365 * 8));
  const completeness =
    Math.min(1, content.length / 6000) *
    (source.contentKind === "page_text"
      ? 1
      : source.contentKind === "abstract"
        ? 0.65
        : 0.45);
  const dimensions = {
    domainCredibility: {
      score: credibility,
      reason: `Domain/category signal (${host}); publisher identity is not independently verified.`,
    },
    primarySource: {
      score:
        primary === "likely_primary"
          ? 0.85
          : primary === "potential_primary"
            ? 0.7
            : 0.5,
      classification: primary,
      reason: "Inferred source role; relevance depends on the specific claim.",
    },
    relevance: {
      score: relevance,
      reason: Number.isFinite(source.providerScore)
        ? "Provider ranking combined with question-term overlap."
        : "Question-term overlap only; no provider relevance score available.",
    },
    freshness: {
      score: freshness,
      reason:
        freshness === null
          ? "Publication date missing, invalid or in the future."
          : "Publication age only; newer is not necessarily more reliable.",
    },
    completeness: {
      score: completeness,
      reason: `${content.length} retrieved characters; ${source.contentKind}. This does not certify full-page coverage.`,
    },
  };
  const weights = {
    domainCredibility: 0.2,
    primarySource: 0.15,
    relevance: 0.35,
    freshness: 0.1,
    completeness: 0.2,
  };
  let score = 0,
    total = 0;
  for (const [key, value] of Object.entries(dimensions))
    if (value.score !== null) {
      score += value.score * weights[key];
      total += weights[key];
    }
  return {
    method: "heuristic-v1",
    score: Math.round((score / total) * 100),
    dimensions,
    disclaimer: QUALITY_DISCLAIMER,
    evaluatedAt: now,
    query,
  };
}
export function normalizeRetrievedSource(result, query, now = new Date()) {
  try {
    const canonicalUrl = canonicalizeUrl(result.url),
      originalUrl = new URL(result.url).href;
    // Only text fields supplied by retrieval adapters are eligible. No LLM summary is accepted.
    const content =
      typeof result.content === "string" ? result.content.slice(0, 24000) : "";
    if (!content.trim()) return null;
    const publishedAt =
      result.published_date && !Number.isNaN(Date.parse(result.published_date))
        ? new Date(result.published_date)
        : undefined;
    const source = {
      url: originalUrl,
      canonicalUrl,
      domain: new URL(originalUrl).hostname.replace(/^www\./, ""),
      title: String(result.title || new URL(originalUrl).hostname).slice(
        0,
        500,
      ),
      content,
      publishedAt,
      retrievedAt: result.retrieval?.retrievedAt
        ? new Date(result.retrieval.retrievedAt)
        : now,
      provider: result.retrieval?.provider || "unknown",
      contentKind: result.retrieval?.contentKind || "search_excerpt",
      providerScore: result.score,
    };
    source.category = classifySource(source);
    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
    source.contentHash =
      normalized.length >= 200 ? hash(normalized) : undefined;
    source.documentHash = hash(content);
    source.fingerprint =
      normalized.length >= 500
        ? [...shingles(normalized.slice(0, 16000))]
            .map((value) => hash(value).slice(0, 16))
            .sort()
            .slice(0, 256)
        : [];
    source.assessment = assessSource(source, query, now);
    source.relevance = source.assessment.dimensions.relevance.score;
    source.provenance = {
      provider: source.provider,
      query,
      originalUrl,
      title: source.title,
      publishedAt: source.publishedAt,
      providerScore: source.providerScore,
      retrievedAt: source.retrievedAt,
      contentKind: source.contentKind,
      documentHash: source.documentHash,
      providerResultId: result.retrieval?.providerResultId,
      requestId: result.retrieval?.requestId,
    };
    return source;
  } catch {
    return null;
  }
}
function shingles(text) {
  const words = text.split(/\s+/);
  return new Set(
    words.slice(0, -4).map((_, i) => words.slice(i, i + 5).join(" ")),
  );
}
function jaccard(left, right) {
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common || 1);
}
export function findDuplicateSource(sources, candidate) {
  for (const source of sources) {
    if (
      source.canonicalUrl === candidate.canonicalUrl ||
      source.canonicalUrls?.includes(candidate.canonicalUrl) ||
      source.url === candidate.url
    )
      return { source, method: "canonical_url", similarity: 1 };
    if (
      candidate.contentHash &&
      (source.contentHash === candidate.contentHash ||
        source.contentHashes?.includes(candidate.contentHash))
    )
      return { source, method: "exact_normalized_content", similarity: 1 };
    if (
      candidate.fingerprint.length >= 20 &&
      Array.isArray(source.fingerprint) &&
      source.fingerprint.length >= 20 &&
      jaccard(terms(candidate.title), terms(source.title)) >= 0.8
    ) {
      const similarity = jaccard(
        new Set(source.fingerprint),
        new Set(candidate.fingerprint),
      );
      if (similarity >= 0.92)
        return { source, method: "near_duplicate_content", similarity };
    }
  }
  return null;
}
