import Link from "next/link";
import type { MapNode, NodeState } from "@/features/learning/service";

/**
 * 2.5D learning path: an SVG ribbon with a depth layer, parallax decor and
 * raised "coin" nodes. Interactive nodes are real HTML links in an ordered
 * list (keyboard/screen-reader friendly); the SVG is decorative only.
 * Original layout and artwork — not modelled on any third-party app.
 */
const STEP = 150;
const TOP = 90;
const W = 400;
// Alternate sides (never dead-centre) so the label card always fits beside the node at 320–360px widths.
const X = [130, 270, 150, 262, 128, 268, 150];

const stateLabel: Record<NodeState, string> = {
  completed: "дууссан",
  current: "одоогийн түвшин",
  available: "нээлттэй",
  locked: "өмнөх түвшнээ дуусгавал нээгдэнэ",
  premium_locked: "Premium эрх шаардлагатай",
};

const nodeStyle: Record<NodeState, string> = {
  completed: "bg-success text-white shadow-[0_6px_0_0_#0f7a36]",
  current: "bg-primary text-white shadow-[0_6px_0_0_#5b34c4] animate-node-pulse",
  available: "bg-primary text-white shadow-[0_6px_0_0_#5b34c4]",
  locked: "bg-line text-muted shadow-[0_6px_0_0_#c9c0e2]",
  premium_locked: "bg-ink text-lavender shadow-[0_6px_0_0_#120c26]",
};

function NodeIcon({ node }: { node: MapNode }) {
  const s = node.state;
  if (s === "completed") return <path d="M7 13l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
  if (s === "locked" || s === "premium_locked")
    return (
      <>
        <rect x="6" y="11" width="14" height="10" rx="2.5" fill="currentColor" />
        <path d="M9 11V8.5a4 4 0 018 0V11" fill="none" stroke="currentColor" strokeWidth="2.4" />
      </>
    );
  if (node.kind === "exam") return <path d="M8 4h10v5a5 5 0 01-10 0zM11 14h4v4h-4zM8 20h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />;
  return <path d="M13 3l2.5 5.5 6 .6-4.5 4 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.5-4 6-.6z" fill="currentColor" />;
}

export function LearningMap({ nodes, locale, courseSlug }: { nodes: MapNode[]; locale: string; courseSlug: string }) {
  const H = TOP * 2 + (nodes.length - 1) * STEP;
  const pts = nodes.map((_, i) => ({ x: X[i % X.length]!, y: TOP + i * STEP }));
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1]!;
    const my = (prev.y + p.y) / 2;
    return `${acc} C ${prev.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
  }, "");
  const doneIdx = nodes.findLastIndex((n) => n.state === "completed");
  const donePath = doneIdx >= 1 ? d.split(" C ").slice(0, doneIdx + 1).join(" C ") : null;

  const href = (n: MapNode) => {
    if (n.kind === "exam") return `/${locale}/certification/${courseSlug}`;
    if (n.state === "premium_locked") return `/${locale}/unlock/${courseSlug}`;
    if (n.state === "locked") return null;
    return `/${locale}/lessons/${n.id}`;
  };

  return (
    <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="lm-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#efe8ff" />
            <stop offset="1" stopColor="#f7f5fc" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} rx="32" fill="url(#lm-sky)" />
        {/* far parallax layer */}
        <g className="animate-drift" opacity=".55">
          {pts.map((p, i) => (
            <ellipse key={i} cx={i % 2 ? 60 : 340} cy={p.y + 40} rx="46" ry="14" fill="#fff" />
          ))}
        </g>
        {/* hills */}
        <path d={`M0 ${H} Q 100 ${H - 90} 200 ${H - 40} T 400 ${H - 70} V ${H} Z`} fill="#bba0ff" opacity=".35" />
        {/* ribbon depth + surface */}
        <path d={d} fill="none" stroke="#c9c0e2" strokeWidth="30" strokeLinecap="round" transform="translate(0 7)" />
        <path d={d} fill="none" stroke="#ffffff" strokeWidth="30" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#e4def3" strokeWidth="4" strokeDasharray="2 14" strokeLinecap="round" />
        {donePath && <path d={donePath} fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" opacity=".7" />}
        {pts.map((p, i) => (
          <ellipse key={i} cx={p.x} cy={p.y + 34} rx="30" ry="8" fill="#241a43" opacity=".12" />
        ))}
      </svg>

      <ol className="absolute inset-0 m-0 list-none p-0">
        {nodes.map((n, i) => {
          const p = pts[i]!;
          const link = href(n);
          const left = p.x > W / 2;
          const label = `Түвшин ${n.level}: ${n.title} — ${stateLabel[n.state]}`;
          const coin = (
            <span className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-white transition hover:brightness-110 ${nodeStyle[n.state]}`}>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><NodeIcon node={n} /></svg>
            </span>
          );
          return (
            <li key={n.id} className="absolute" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, transform: "translate(-50%, -50%)" }}>
              <div className="relative">
                {link ? (
                  <Link href={link} aria-label={label} className="block rounded-full" data-testid={`node-${n.level}`} data-state={n.state}>
                    {coin}
                  </Link>
                ) : (
                  <span role="img" aria-label={label} aria-disabled="true" className="block" data-testid={`node-${n.level}`} data-state={n.state}>
                    {coin}
                  </span>
                )}
                <div
                  className={`pointer-events-none absolute top-1/2 w-32 -translate-y-1/2 rounded-xl bg-white/90 px-2.5 py-1.5 text-xs shadow-sm sm:w-44 ${left ? "right-[4.5rem] text-right" : "left-[4.5rem]"}`}
                  aria-hidden="true"
                >
                  <p className="font-bold text-muted">
                    Түвшин {n.level}
                    {n.access_tier === "free" ? " · Үнэгүй" : n.kind === "exam" ? " · Сертификат" : " · Premium"}
                  </p>
                  <p className="font-extrabold leading-snug text-ink">{n.title}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
