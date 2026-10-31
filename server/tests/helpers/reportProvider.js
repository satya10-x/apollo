export function writerResponse(input) {
  return {
    sectionId: input.section.id,
    claimIds: input.verifiedClaims.map((claim) => claim.claimId).slice(0, 4),
    analyses: [],
  };
}
export function assemblerResponse(input) {
  const facts = input.sections
    .flatMap((section) => section.blocks)
    .filter((block) => block.kind === "fact");
  return {
    executiveSummary: facts.slice(0, 3).map((block) => block.id),
    keyFindings: facts.slice(0, 4).map((block) => block.id),
    opportunities: [],
    risks: [],
    conclusion: facts.slice(0, 1).map((block) => block.id),
  };
}
export function reportProvider({
  writer = writerResponse,
  assembler = assemblerResponse,
  grounding,
  onCall,
} = {}) {
  return {
    async generateJSON(options) {
      onCall?.(options);
      let value;
      if (options.system.startsWith("APOLLO_SECTION_WRITER"))
        value = writer(options.input);
      else if (options.system.startsWith("APOLLO_REPORT_ASSEMBLER"))
        value = assembler(options.input);
      else if (options.system.startsWith("APOLLO_SECTION_GROUNDING"))
        value = grounding(options.input);
      else throw new Error("Unexpected report operation");
      value = options.schema.parse(value);
      options.validate?.(value);
      return { data: value, provider: "test", model: "test-model" };
    },
  };
}
