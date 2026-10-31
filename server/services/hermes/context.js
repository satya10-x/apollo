import { createHash } from "node:crypto";
export const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function buildCorpus(state, sources, evidence) {
  const sourceMap = new Map(
    sources.map((source) => [String(source._id), source]),
  );
  const valid = [],
    invalid = [];
  for (const item of evidence || []) {
    if (
      item.origin !== "external_api" ||
      typeof item.passage !== "string" ||
      !item.passage.trim() ||
      item.passage.length > 1600 ||
      !sourceMap.has(String(item.source)) ||
      (item.session && String(item.session) !== String(state._id)) ||
      item.passageHash !==
        createHash("sha256").update(item.passage).digest("hex")
    ) {
      invalid.push(String(item._id));
      continue;
    }
    valid.push(item);
  }
  const evidenceMap = new Map(valid.map((item) => [String(item._id), item]));
  const claims = state.findings.flatMap((finding) =>
    finding.claims.map((claim, index) => ({
      claimId: `claim-${fingerprint([finding.taskId, index, claim.statement]).slice(0, 24)}`,
      taskId: finding.taskId,
      sectionId: finding.sectionId,
      ...claim,
    })),
  );
  return {
    sources,
    sourceMap,
    evidence: valid,
    evidenceMap,
    invalidEvidenceIds: invalid,
    claims,
  };
}
export function sourceContext(source) {
  return {
    sourceId: String(source._id),
    title: source.title,
    url: source.url,
    domain: source.domain,
    category: source.category,
    publishedAt: source.publishedAt || null,
    assessment: source.assessment
      ? {
          method: source.assessment.method,
          score: source.assessment.score,
          primarySource:
            source.assessment.dimensions?.primarySource?.classification,
          disclaimer: source.assessment.disclaimer,
        }
      : null,
    duplicateCount: source.duplicateMatches?.length || 0,
    duplicateMatches: (source.duplicateMatches || []).slice(0, 5),
  };
}
export function evidenceContext(record, maxLength = 1600) {
  return {
    evidenceId: String(record._id),
    sourceId: String(record.source),
    passage: record.passage.slice(0, maxLength),
    sectionIds: record.sectionIds || [],
    questions: (record.questions || []).slice(0, 3),
    origin: record.origin,
  };
}
export function invalidClaimReason(claim, corpus) {
  if (!claim.evidenceIds?.length || !claim.sourceIds?.length)
    return "The extracted claim has no source-linked evidence citations.";
  if (
    claim.evidenceIds.some((id) => !corpus.evidenceMap.has(id)) ||
    claim.sourceIds.some((id) => !corpus.sourceMap.has(id))
  )
    return "A cited evidence or source record is missing or invalid.";
  if (
    claim.evidenceIds.some(
      (id) =>
        !claim.sourceIds.includes(String(corpus.evidenceMap.get(id).source)),
    ) ||
    claim.sourceIds.some(
      (id) =>
        !claim.evidenceIds.some(
          (eid) => String(corpus.evidenceMap.get(eid).source) === id,
        ),
    )
  )
    return "The claim’s evidence IDs do not match its cited sources.";
  return null;
}
export function sectionBatches(section, corpus, state) {
  const sectionClaims = corpus.claims.filter(
    (claim) =>
      claim.sectionId === section.id && !invalidClaimReason(claim, corpus),
  );
  const taskIds = new Set(
    state.tasks
      .filter((task) => task.sectionId === section.id)
      .map((task) => task.id),
  );
  const sectionEvidence = corpus.evidence.filter(
    (item) =>
      item.sectionIds?.includes(section.id) ||
      item.taskIds?.some((id) => taskIds.has(id)) ||
      sectionClaims.some((claim) =>
        claim.evidenceIds.includes(String(item._id)),
      ),
  );
  const batches = [];
  let claims = [],
    records = new Map();
  const flush = () => {
    if (!claims.length && !records.size) return;
    const evidence = [...records.values()];
    const sourceIds = new Set(evidence.map((item) => String(item.source)));
    batches.push({
      section,
      claims,
      evidence,
      sources: corpus.sources.filter((source) =>
        sourceIds.has(String(source._id)),
      ),
    });
    claims = [];
    records = new Map();
  };
  for (const claim of sectionClaims) {
    const needed = claim.evidenceIds.map((id) => corpus.evidenceMap.get(id));
    const union = new Set([...records.keys(), ...claim.evidenceIds]);
    if (claims.length >= 3 || union.size > 4) flush();
    claims.push(claim);
    needed.forEach((item) => records.set(String(item._id), item));
  }
  // Fill claim batches and subsequent coverage batches with actual, previously unseen passages.
  const assigned = new Set(
    batches.flatMap((batch) => batch.evidence.map((item) => String(item._id))),
  );
  records.forEach((_, id) => assigned.add(id));
  for (const record of sectionEvidence) {
    if (assigned.has(String(record._id))) continue;
    if (records.size >= 4) flush();
    records.set(String(record._id), record);
    assigned.add(String(record._id));
  }
  flush();
  return batches;
}
export function enrichContradiction(value, corpus, sectionIds) {
  const side = (item) => {
    const record = corpus.evidenceMap.get(item.evidenceId),
      source = corpus.sourceMap.get(String(record.source));
    return {
      ...item,
      sourceId: String(source._id),
      sourceTitle: source.title,
      url: source.url,
      publishedAt: source.publishedAt || null,
    };
  };
  const left = side(value.left),
    right = side(value.right);
  return {
    ...value,
    id: `conflict-${fingerprint([left.evidenceId, right.evidenceId, left.claim, right.claim]).slice(0, 20)}`,
    sectionIds: [...new Set(sectionIds)],
    left,
    right,
    resolved: value.classification === "CONTEXTUAL",
  };
}

export function blueprintContext(blueprint) {
  return {
    objective: blueprint.objective,
    scope: blueprint.scope,
    domain: blueprint.domain,
    dimensions: blueprint.dimensions,
    informationNeeds: blueprint.informationNeeds,
    sections: blueprint.sections.map((section) => ({
      id: section.id,
      title: section.title,
      subQuestions: section.subQuestions.map((question) => ({
        id: question.id,
        question: question.question,
        expectedEvidence: question.expectedEvidence,
      })),
    })),
  };
}

// Split oversized audits without detaching a claim from any of its citations.
// Each child must be strictly smaller so retries cannot recurse indefinitely.
export function splitAuditBatch(batch) {
  const groups = [];
  const assigned = new Set();
  for (const claim of batch.claims) {
    const ids = new Set(claim.evidenceIds);
    const evidence = batch.evidence.filter((item) => ids.has(String(item._id)));
    evidence.forEach((item) => assigned.add(String(item._id)));
    groups.push({ claims: [claim], evidence });
  }
  for (const item of batch.evidence) {
    if (!assigned.has(String(item._id)))
      groups.push({ claims: [], evidence: [item] });
  }
  if (
    groups.length < 2 ||
    groups.some(
      (group) =>
        group.claims.length >= batch.claims.length &&
        group.evidence.length >= batch.evidence.length,
    )
  )
    return [];
  return groups.map((group) => ({
    section: batch.section,
    ...group,
    sources: batch.sources.filter((source) =>
      group.evidence.some((item) => String(item.source) === String(source._id)),
    ),
  }));
}
