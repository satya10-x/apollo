import mongoose from "mongoose";
const { Schema } = mongoose;
const eventSchema = new Schema(
  {
    message: String,
    agent: String,
    stage: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);
const sessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      default: function () {
        return this?._id ? String(this._id) : undefined;
      },
    },
    topic: { type: String, required: true, maxlength: 500 },
    mode: {
      type: String,
      enum: ["quick", "standard", "deep"],
      default: "standard",
    },
    maxRounds: { type: Number, min: 1, max: 5, default: 3 },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
    },
    stage: { type: String, default: "queued" },
    round: { type: Number, default: 0 },
    coverage: { type: Number, default: 0 },
    plan: [String], // Retained for older sessions and existing consumers.
    blueprint: { type: Schema.Types.Mixed, default: null },
    tasks: [Schema.Types.Mixed],
    completedTasks: [String],
    pendingTasks: [String],
    findings: [Schema.Types.Mixed],
    sourceIds: [{ type: Schema.Types.ObjectId, ref: "Source" }],
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: "Evidence" }],
    researchMemory: {
      type: Schema.Types.Mixed,
      default: () => ({ queries: [], investigatedQuestions: [] }),
    },
    gapDetails: [Schema.Types.Mixed],
    reviews: [Schema.Types.Mixed],
    decisions: [Schema.Types.Mixed],
    limits: Schema.Types.Mixed,
    usage: Schema.Types.Mixed,
    cancelRequested: { type: Boolean, default: false },
    requirePlanApproval: { type: Boolean, default: false },
    planApprovedAt: Date,
    reportUpdatingUntil: Date,
    deleting: { type: Boolean, default: false },
    startedAt: Date,
    deadlineAt: Date,
    finishedAt: Date,
    researchFinishedAt: Date,
    reportProgress: Schema.Types.Mixed,
    stopReason: String,
    gaps: [String],
    events: [eventSchema],
    error: String,
  },
  { timestamps: true },
);
sessionSchema.index({ createdAt: -1 });
const sourceSchema = new Schema(
  {
    session: {
      type: Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      default: function () {
        return this?._id ? String(this._id) : undefined;
      },
    },
    title: String,
    url: String,
    canonicalUrl: String,
    canonicalUrls: [String],
    originalUrls: [String],
    contentHash: String,
    contentHashes: [String],
    fingerprint: [String],
    assessment: Schema.Types.Mixed,
    assessments: [Schema.Types.Mixed],
    provenance: [Schema.Types.Mixed],
    duplicateMatches: [Schema.Types.Mixed],
    retrievedAt: Date,
    lastRetrievedAt: Date,
    domain: String,
    category: { type: String, default: "Web" },
    publishedAt: Date,
    relevance: Number,
    section: String,
    sectionIds: [String],
    sections: [String],
    content: String,
  },
  { timestamps: true },
);
sourceSchema.index({ session: 1, url: 1 }, { unique: true });
sourceSchema.index(
  { session: 1, canonicalUrl: 1 },
  {
    unique: true,
    partialFilterExpression: { canonicalUrl: { $type: "string" } },
  },
);
sourceSchema.index({ session: 1, contentHash: 1 });
const evidenceSchema = new Schema(
  {
    evidenceId: {
      type: String,
      default: function () {
        return this?._id ? String(this._id) : undefined;
      },
    },
    session: {
      type: Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
      index: true,
    },
    source: {
      type: Schema.Types.ObjectId,
      ref: "Source",
      required: true,
      index: true,
    },
    passage: { type: String, required: true, maxlength: 1600 },
    passageHash: { type: String, required: true },
    origin: { type: String, enum: ["external_api"], required: true },
    selectionMethod: {
      type: String,
      enum: ["verbatim_query_overlap"],
      required: true,
    },
    sectionIds: [String],
    sections: [String],
    taskIds: [String],
    questions: [String],
    provenance: [Schema.Types.Mixed],
    retrievedAt: Date,
  },
  { timestamps: true },
);
evidenceSchema.index(
  { session: 1, source: 1, passageHash: 1 },
  { unique: true },
);
const reportSchema = new Schema(
  {
    session: {
      type: Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
      unique: true,
    },
    reviewSnapshot: Schema.Types.Mixed,
    formatVersion: Number,
    title: String,
    objective: String,
    scope: String,
    executiveSummary: [Schema.Types.Mixed],
    keyFindings: [Schema.Types.Mixed],
    contradictions: [Schema.Types.Mixed],
    opportunities: [Schema.Types.Mixed],
    risks: [Schema.Types.Mixed],
    conclusion: [Schema.Types.Mixed],
    references: [Schema.Types.Mixed],
    sourceMappings: [Schema.Types.Mixed],
    generation: Schema.Types.Mixed,
    researchFinishedAt: Date,
    summary: String,
    sections: [
      {
        sectionId: String,
        title: String,
        body: String,
        blocks: [Schema.Types.Mixed],
        unavailableQuestions: [Schema.Types.Mixed],
        limitations: [String],
        writerMode: String,
      },
    ],
    limitations: [String],
  },
  { timestamps: true },
);
export const ResearchSession = mongoose.model("ResearchSession", sessionSchema);
export const Source = mongoose.model("Source", sourceSchema);
export const Report = mongoose.model("Report", reportSchema);

export const Evidence = mongoose.model("Evidence", evidenceSchema);
