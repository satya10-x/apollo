import { buildCorpus } from "../hermes/context.js";
import { canonicalizeUrl } from "../athena/sources.js";
export function reportCorpus(state, sources, evidence) {
  const corpus = buildCorpus(state, sources, evidence),
    review = state.reviews.at(-1);
  if (!review?.claimReviews || !review.inspection)
    throw new Error(
      "An evidence-level Hermes review is required before report writing.",
    );
  const sourceReviews = new Map(
    (review.sourceReviews || []).map((item) => [item.sourceId, item]),
  );
  const usableSource = (id) =>
    corpus.sourceMap.has(id) &&
    !sourceReviews
      .get(id)
      ?.flags.some((flag) =>
        ["IRRELEVANT", "POTENTIALLY_UNRELIABLE"].includes(flag),
      );
  const validQuote = (quote) => {
    const record = corpus.evidenceMap.get(quote.evidenceId);
    return (
      record && record.passage.includes(quote.quote) && quote.quote.length >= 20
    );
  };
  const catalog = new Map(corpus.claims.map((claim) => [claim.claimId, claim]));
  const verified = review.claimReviews.filter(
    (claim) =>
      catalog.get(claim.claimId)?.statement === claim.statement &&
      catalog.get(claim.claimId)?.sectionId === claim.sectionId &&
      claim.reviewStatus === "reviewed" &&
      ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONFLICTING"].includes(
        claim.classification,
      ) &&
      claim.support.length &&
      [...claim.support, ...claim.opposition].every(validQuote),
  );
  for (const source of sources)
    try {
      canonicalizeUrl(source.url);
    } catch {
      corpus.sourceMap.delete(String(source._id));
    }
  return { ...corpus, review, verified, usableSource };
}
export function sectionContext(state, section, corpus) {
  const taskIds = new Set(
    state.tasks
      .filter((task) => task.sectionId === section.id)
      .map((task) => task.id),
  );
  const assigned = corpus.evidence.filter(
    (record) =>
      record.sectionIds?.includes(section.id) ||
      record.taskIds?.some((id) => taskIds.has(id)),
  );
  const allowed = new Set(assigned.map((record) => String(record._id)));
  const claims = corpus.verified.filter(
    (claim) =>
      claim.sectionId === section.id &&
      [...claim.support, ...claim.opposition].every(
        (quote) =>
          allowed.has(quote.evidenceId) &&
          corpus.usableSource(
            String(corpus.evidenceMap.get(quote.evidenceId).source),
          ),
      ),
  );
  const sourceIds = new Set(
    claims.flatMap((claim) =>
      [...claim.support, ...claim.opposition].map((quote) =>
        String(corpus.evidenceMap.get(quote.evidenceId).source),
      ),
    ),
  );
  const cited = new Set(
    claims.flatMap((claim) =>
      [...claim.support, ...claim.opposition].map((quote) => quote.evidenceId),
    ),
  );
  return {
    section,
    claims,
    evidence: assigned.filter((record) => cited.has(String(record._id))),
    sources: corpus.sources.filter((source) =>
      sourceIds.has(String(source._id)),
    ),
    hermes: corpus.review.sections.find(
      (item) => item.sectionId === section.id,
    ),
    limitations: corpus.review.gaps
      .filter((item) => item.sectionId === section.id)
      .map((item) => item.reason || item.description),
  };
}
export function writerInput(context) {
  return {
    section: context.section,
    verifiedClaims: context.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      classification: claim.classification,
      sourceIds: [
        ...new Set(
          [...claim.support, ...claim.opposition].map((q) => q.sourceId),
        ),
      ],
      evidenceIds: [
        ...new Set(
          [...claim.support, ...claim.opposition].map((q) => q.evidenceId),
        ),
      ],
      reason: claim.reason,
    })),
    evidence: context.evidence.map((record) => ({
      evidenceId: String(record._id),
      sourceId: String(record.source),
      passage: record.passage,
    })),
    sources: context.sources.map((source) => ({
      sourceId: String(source._id),
      title: source.title,
      url: source.url,
      publishedAt: source.publishedAt || null,
      category: source.category,
    })),
    verification: {
      questions: context.hermes?.questions || [],
      missingInformation: context.hermes?.missingInformation || [],
      limitations: context.limitations,
    },
  };
}
