import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Pause, Play } from "lucide-react";
const OldMastersPreloader = lazy(() => import("./vendor/OldMastersPreloader"));
const figures = [
  {
    src: "/art/apollo-belvedere.jpg",
    alt: "The Apollo Belvedere",
    x: 58,
    y: 100,
    h: 84,
    depth: 1,
  },
  {
    src: "/art/hercules.jpg",
    alt: "A marble Hercules torso",
    x: 24,
    y: 103,
    h: 90,
    depth: 1.25,
  },
  {
    src: "/art/flora.jpg",
    alt: "A marble figure with flowers",
    x: 88,
    y: 100,
    h: 100,
    depth: 0.75,
    flip: true,
    phone: false,
  },
];
const backdrop = "/art/david.jpg";
class CoverBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="masters-cover-fallback">
        <h1>Apollo</h1>
        <p>Your question. A clearer perspective.</p>
        <a href="#research-desk">
          Begin research <ArrowDown size={15} />
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function MastersLanding() {
  const navigate = useNavigate();
  const root = useRef(null);
  const [progress, setProgress] = useState(0),
    [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(true),
    [ready, setReady] = useState(false);
  const [seen] = useState(() => {
    try {
      return sessionStorage.getItem("apollo-masters-cover") === "seen";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let active = true,
      complete = 0;
    const images = [backdrop, ...figures.map((figure) => figure.src)];
    const cleanup = [];
    for (const src of images) {
      const image = new Image();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (active) setProgress((++complete / images.length) * 100);
      };
      image.onload = finish;
      image.onerror = finish;
      image.src = src;
      const timer = setTimeout(finish, 8000);
      cleanup.push(() => {
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
      });
    }
    return () => {
      active = false;
      cleanup.forEach((dispose) => dispose());
    };
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  function onLoaded() {
    setReady(true);
    try {
      sessionStorage.setItem("apollo-masters-cover", "seen");
    } catch {
      /* Storage is optional. */
    }
  }
  function route(event) {
    const link = event.target.closest("a[href]");
    const href = link?.getAttribute("href");
    if (
      href?.startsWith("/") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      navigate(href);
    }
  }
  return (
    <section
      className="masters-landing"
      ref={root}
      onClick={route}
      aria-label="Apollo research introduction"
    >
      <CoverBoundary>
        <Suspense
          fallback={
            <div className="masters-cover-fallback">
              <h1>Apollo</h1>
              <p>Deep Research Meta-Agent</p>
              <a href="#research-desk">
                Enter workspace <ArrowDown size={15} />
              </a>
            </div>
          }
        >
          <OldMastersPreloader
            progress={progress}
            minLoadMs={1200}
            skipIntro={seen}
            onLoaded={onLoaded}
            wordmark="Apollo"
            brand="A."
            tagline="Your question. A clearer perspective."
            eyebrow="DEEP RESEARCH · MMXXVI"
            figures={figures}
            backdrop={backdrop}
            fontHref="/fonts/masters-fonts.css"
            tone="carmine"
            palette={{
              stage: "#681b18",
              ground: "#140908",
              text: "#f3e9d9",
              muted: "#cfb2a6",
              word: "#f6eddb",
              rule: "#9b5041",
              glow: "#f4d1ac",
              highlight: "#e7b495",
              accent: "#f3e9d9",
            }}
            labels={["Curiosity", "Clarity"]}
            nav={[
              { label: "Research", href: "#research-desk" },
              { label: "The method", href: "#apollo-method" },
              { label: "Archive", href: "/history" },
              { label: "Sources", href: "/sources" },
            ]}
            asides={[
              {
                title: "The question",
                text: "Start with what you want to understand. Apollo builds the plan and follows the evidence.",
              },
              {
                title: "The method",
                text: "Athena investigates. Hermes verifies. Every finding leads back to its source.",
              },
            ]}
            annotations={[
              { x: 33, y: 44, label: "DISCOVER" },
              { x: 66, y: 36, label: "VERIFY" },
              { x: 48, y: 58, label: "UNDERSTAND" },
            ]}
            plate="VOL. 01"
            loadingLabel="Loading artwork"
            cta={{ label: "Begin research", href: "#research-desk" }}
            tilt={paused ? 0 : 1.8}
            paused={paused || !visible}
            height="100svh"
          />
        </Suspense>
      </CoverBoundary>
      <div className="masters-motion">
        <a href="#research-desk" aria-label="Scroll to research workspace">
          <ArrowDown size={14} />
          <span>Research desk</span>
        </a>
        <button
          disabled={!ready && !seen}
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
          aria-label={paused ? "Resume ambient motion" : "Pause ambient motion"}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}{" "}
          {paused ? "Resume motion" : "Pause motion"}
        </button>
      </div>
    </section>
  );
}
