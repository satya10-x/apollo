// Test-only persistence adapter for exercising the production Athena/Apollo services.
export function retrievalRepository() {
  const sources = [],
    evidence = [];
  return {
    sources,
    evidence,
    async addSource(session, source, section, { duplicate, task } = {}) {
      let saved = duplicate
        ? sources.find((item) => item._id === duplicate.source._id)
        : sources.find((item) => item.url === source.url);
      if (!saved) {
        const { content, provenance, ...metadata } = source;
        saved = {
          ...metadata,
          _id: `source-${sources.length + 1}`,
          session,
          section: section.title,
          sectionIds: [],
          sections: [],
          originalUrls: [],
          provenance: [],
        };
        sources.push(saved);
      }
      saved.sectionIds = [...new Set([...saved.sectionIds, section.id])];
      saved.sections = [...new Set([...saved.sections, section.title])];
      saved.originalUrls = [...new Set([...saved.originalUrls, source.url])];
      saved.provenance.push({
        ...source.provenance,
        taskId: task?.id,
        sectionId: section.id,
      });
      return structuredClone(saved);
    },
    async attachSource(session, sourceId, section) {
      const source = sources.find(
        (item) => String(item._id) === String(sourceId),
      );
      source.sectionIds = [...new Set([...source.sectionIds, section.id])];
      source.sections = [...new Set([...source.sections, section.title])];
      return structuredClone(source);
    },
    async addEvidence(session, sourceId, excerpt, task, section) {
      let item = evidence.find(
        (item) =>
          item.source === sourceId && item.passageHash === excerpt.passageHash,
      );
      if (!item) {
        item = {
          _id: `evidence-${evidence.length + 1}`,
          session,
          source: sourceId,
          passage: excerpt.passage,
          passageHash: excerpt.passageHash,
          origin: excerpt.origin,
          retrievedAt: excerpt.retrievedAt,
          provenance: [],
          sectionIds: [],
          sections: [],
          taskIds: [],
          questions: [],
        };
        evidence.push(item);
      }
      item.provenance.push(excerpt);
      item.sectionIds = [...new Set([...item.sectionIds, section.id])];
      item.questions = [...new Set([...item.questions, task.question])];
      return structuredClone(item);
    },
    async attachEvidence(session, evidenceId, task, section) {
      const item = evidence.find((item) => item._id === evidenceId);
      item.sectionIds = [...new Set([...item.sectionIds, section.id])];
      item.questions = [...new Set([...item.questions, task.question])];
      return structuredClone(item);
    },
    async listSources() {
      return structuredClone(sources);
    },
    async listEvidence() {
      return structuredClone(evidence);
    },
  };
}
