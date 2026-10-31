import { useEffect, useState, useRef } from "react";
import { NavLink, Link, Routes, Route, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  LayoutDashboard,
  History,
  Library,
  FileText,
  Settings2,
  ChevronDown,
  ChevronRight,
  Orbit,
  Check,
  Menu,
  X,
} from "lucide-react";
import { api } from "./api";
import { Logo, EmptyState, Badge } from "./components/UI";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/History";
import CollectionPage from "./pages/Collection";
import ResearchWorkspace from "./pages/ResearchWorkspace";
export default function App() {
  const [health, setHealth] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [settings, setSettings] = useState(false);
  const location = useLocation();
  const modalRef = useRef(null);
  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement;
    const modal = modalRef.current;
    const focusable = () => [
      ...modal.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex="0"]',
      ),
    ];
    focusable()[0]?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSettings(false);
      }
      if (event.key === "Tab") {
        const controls = focusable();
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [settings]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api("/health")
        .then((data) => {
          if (active)
            setHealth((current) =>
              JSON.stringify(current) === JSON.stringify(data) ? current : data,
            );
        })
        .catch(() => {
          if (active)
            setHealth({
              status: "offline",
              database: "disconnected",
              researchConfigured: false,
            });
        });
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => setMobile(false), [location.pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!location.hash) return;
    let anchor;
    try {
      anchor = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    const reveal = () => {
      const target = document.getElementById(anchor);
      if (!target) return false;
      target.scrollIntoView({ block: "start" });
      return true;
    };
    if (reveal()) return;
    // Cross-page source links may arrive before the report request finishes.
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), 25000);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [location.pathname, location.hash]);
  const ready = health?.database === "connected" && health?.researchConfigured;
  return (
    <div
      className={`app-shell masters-edition ${location.pathname === "/" ? "masters-home" : ""}`}
    >
      <button
        className="mobile-menu"
        aria-label={mobile ? "Close navigation" : "Open navigation"}
        aria-expanded={mobile}
        aria-controls="workspace-navigation"
        onClick={() => setMobile(!mobile)}
      >
        <Menu size={22} />
      </button>
      {mobile && (
        <div className="sidebar-shade" onClick={() => setMobile(false)} />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobile ? "is-open" : ""}`}
      >
        <Link to="/" className="brand-link" aria-label="Apollo home">
          <Logo />
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">A</span>
          <div>
            Personal workspace<span>Research starts here</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <Link to="/" className="new-research">
          <Plus size={17} /> New research <span>⌘ K</span>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <NavLink to="/" end>
            <LayoutDashboard size={18} /> Overview
          </NavLink>
          <NavLink to="/history">
            <History size={18} /> Research history
          </NavLink>
          <NavLink to="/sources">
            <Library size={18} /> Source library
          </NavLink>
          <NavLink to="/reports">
            <FileText size={18} /> Reports
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="tiny-orbit">
              <Orbit size={20} />
            </div>
            <strong>Curiosity, amplified.</strong>
            <p>Three agents. One clear picture.</p>
            <span>
              Built for deeper understanding <ArrowUpRight size={12} />
            </span>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings2 size={17} /> Workspace settings{" "}
            <ChevronRight size={15} />
          </button>
          <div className="profile">
            <span className="profile-avatar">Y</span>
            <div>
              Your workspace<span>Personal research</span>
            </div>
            <span
              className={`status-dot ${ready ? "ready" : ""}`}
              title={ready ? "Ready" : "Setup needed"}
            />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>
              {location.pathname === "/"
                ? "Overview"
                : location.pathname.includes("/research/")
                  ? "Research session"
                  : location.pathname === "/history"
                    ? "Research history"
                    : location.pathname === "/sources"
                      ? "Source library"
                      : "Reports"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="version">APOLLO V1.0</span>
            <button
              className={`connection ${ready ? "connected" : ""}`}
              onClick={() => setSettings(true)}
            >
              <i />
              {health === null
                ? "Connecting"
                : ready
                  ? "Systems ready"
                  : "Setup required"}
            </button>
            <span className="top-avatar">Y</span>
          </div>
        </div>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard health={health} />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route
              path="/sources"
              element={<CollectionPage type="sources" />}
            />
            <Route
              path="/reports"
              element={<CollectionPage type="reports" />}
            />
            <Route path="/research/:id/*" element={<ResearchWorkspace />} />
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  description="Return to your workspace to continue researching."
                  action={
                    <Link className="button primary" to="/">
                      Back to overview
                    </Link>
                  }
                />
              }
            />
          </Routes>
        </main>
        <footer>
          <span>
            <span className="footer-dot" /> APOLLO · DEEP RESEARCH META-AGENT
          </span>
          <span>From questions to clarity.</span>
        </footer>
      </div>
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">WORKSPACE</div>
            <h2 id="settings-title">Connection settings</h2>
            <p>
              Configure your server’s <code>.env</code> file to connect Apollo’s
              research services.
            </p>
            <div className="config-row">
              <span>MongoDB</span>
              <Badge
                status={
                  health?.database === "connected" ? "connected" : "unavailable"
                }
              />
            </div>
            <div className="config-row">
              <span>Groq + search</span>
              <Badge
                status={
                  health?.researchConfigured ? "configured" : "unavailable"
                }
              />
            </div>
            <p className="muted">
              Set MONGODB_URI, GROQ_API_KEY, GROQ_MODEL and TAVILY_API_KEY, then
              restart the server. Enable GEMINI_FALLBACK_ENABLED for optional
              Gemini fallback. Exa search fallback activates when EXA_API_KEY is
              configured.
            </p>
            <div className="security-note">
              <Check size={16} /> API credentials stay on the server.
            </div>
            <button
              className="button primary full"
              onClick={() => setSettings(false)}
            >
              Got it <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
