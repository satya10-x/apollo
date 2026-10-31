import {
  ArrowUpRight,
  LoaderCircle,
  Orbit,
  Search,
  FileText,
  Workflow,
} from "lucide-react";
export function Logo({ small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M5 25 16 5l11 20h-6l-5-10-5 10H5Z" fill="currentColor" />
          <path d="M13 25h6l-3-5-3 5Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        apollo<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function EmptyState({ icon: Icon = Orbit, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={24} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" /> Loading your workspace…
    </div>
  );
}
export function ErrorNotice({ message }) {
  return message ? (
    <div className="error-notice" role="alert">
      {message}
    </div>
  ) : null;
}
export function Badge({ status }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {status}
    </span>
  );
}
export const agentDefinitions = [
  {
    name: "Apollo",
    label: "The strategist",
    icon: Workflow,
    description: "Plans, coordinates and controls your research.",
    color: "purple",
  },
  {
    name: "Athena",
    label: "The investigator",
    icon: Search,
    description: "Investigates each section and gathers evidence.",
    color: "blue",
  },
  {
    name: "Hermes",
    label: "The critic",
    icon: FileText,
    description: "Verifies claims, checks contradictions and identifies gaps.",
    color: "green",
  },
];
export function AgentCards() {
  return (
    <div className="agent-grid">
      {agentDefinitions.map((a, i) => (
        <div className="agent-card" key={a.name}>
          <div className="agent-card-top">
            <div className={`agent-icon ${a.color}`}>
              <a.icon size={19} />
            </div>
            <span className="mono">0{i + 1}</span>
          </div>
          <div className="agent-name">
            {a.name}
            <span>{a.label}</span>
          </div>
          <p>{a.description}</p>
        </div>
      ))}
    </div>
  );
}
export function SectionTitle({ title, kicker, action }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {kicker && <p>{kicker}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({ children, ...props }) {
  return (
    <a {...props}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
