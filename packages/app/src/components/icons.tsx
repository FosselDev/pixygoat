/** Small stroke icons on a 16 px grid. */
import type { JSX } from "preact";

type P = JSX.SVGAttributes<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  Eye: (p: P) => (
    <Svg {...p}>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </Svg>
  ),
  EyeOff: (p: P) => (
    <Svg {...p}>
      <path d="M2 2l12 12" />
      <path d="M6.5 4.1A7 7 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-2.2 2.7M4 5.5A11 11 0 0 0 1.5 8s2.5 4.5 6.5 4.5c1 0 1.9-.2 2.7-.6" />
    </Svg>
  ),
  Undo: (p: P) => (
    <Svg {...p}>
      <path d="M6 4L3 7l3 3" />
      <path d="M3 7h6a4 4 0 010 8H7" />
    </Svg>
  ),
  Redo: (p: P) => (
    <Svg {...p}>
      <path d="M10 4l3 3-3 3" />
      <path d="M13 7H7a4 4 0 000 8h2" />
    </Svg>
  ),
  Random: (p: P) => (
    <Svg {...p}>
      <path d="M2 8c1-3 3-5 6-5s5 2 6 5" />
      <path d="M14 4v4h-4" />
      <path d="M14 8c-1 3-3 5-6 5s-5-2-6-5" />
      <path d="M2 12V8h4" />
    </Svg>
  ),
  Load: (p: P) => (
    <Svg {...p}>
      <path d="M3 9v4h10V9" />
      <path d="M8 2v8" />
      <path d="M5 7l3 3 3-3" />
    </Svg>
  ),
  Save: (p: P) => (
    <Svg {...p}>
      <path d="M3 3h8l2 2v8H3z" />
      <path d="M5 3v4h5V3" />
      <path d="M5 13V9h6v4" />
    </Svg>
  ),
  Export: (p: P) => (
    <Svg {...p}>
      <path d="M8 10V2" />
      <path d="M5 5l3-3 3 3" />
      <path d="M3 9v4h10V9" />
    </Svg>
  ),
  New: (p: P) => (
    <Svg {...p}>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
      <path d="M8 7v5M5.5 9.5h5" />
    </Svg>
  ),
  Plus: (p: P) => (
    <Svg {...p}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  ),
  Search: (p: P) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="M3 3l10 10M13 3L3 13" />
    </Svg>
  ),
  Warn: (p: P) => (
    <Svg {...p}>
      <path d="M8 2l6.5 11h-13z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11.3" r="0.3" fill="currentColor" />
    </Svg>
  ),
  Check: (p: P) => (
    <Svg {...p}>
      <path d="M3 8.5l3 3 7-7" />
    </Svg>
  ),
  Up: (p: P) => (
    <Svg {...p}>
      <path d="M8 13V3" />
      <path d="M4 7l4-4 4 4" />
    </Svg>
  ),
  Down: (p: P) => (
    <Svg {...p}>
      <path d="M8 3v10" />
      <path d="M4 9l4 4 4-4" />
    </Svg>
  ),
  Left: (p: P) => (
    <Svg {...p}>
      <path d="M13 8H3" />
      <path d="M7 4L3 8l4 4" />
    </Svg>
  ),
  Right: (p: P) => (
    <Svg {...p}>
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </Svg>
  ),
  Quad: (p: P) => (
    <Svg {...p}>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </Svg>
  ),
  Play: (p: P) => (
    <Svg {...p}>
      <path d="M4 3l9 5-9 5z" fill="currentColor" />
    </Svg>
  ),
  Pause: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="3" width="3.5" height="10" fill="currentColor" stroke="none" />
      <rect x="9.5" y="3" width="3.5" height="10" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Grid: (p: P) => (
    <Svg {...p}>
      <path d="M2 2h12v12H2z" />
      <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
    </Svg>
  ),
  Layers: (p: P) => (
    <Svg {...p}>
      <path d="M2 5l6-3 6 3-6 3z" />
      <path d="M2 8l6 3 6-3" />
      <path d="M2 11l6 3 6-3" />
    </Svg>
  ),
  Chevron: (p: P) => (
    <Svg {...p}>
      <path d="M5 3l5 5-5 5" />
    </Svg>
  ),
  Trash: (p: P) => (
    <Svg {...p}>
      <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9h5.6l.7-9" />
    </Svg>
  ),
  License: (p: P) => (
    <Svg {...p}>
      <circle cx="8" cy="6" r="4.2" />
      <path d="M5.6 9.6L5 14l3-1.6L11 14l-.6-4.4" />
    </Svg>
  ),
  Link: (p: P) => (
    <Svg {...p}>
      <path d="M6.5 9.5l3-3" />
      <path d="M7 4.5l1.5-1.5a2.5 2.5 0 013.5 3.5L10.5 8" />
      <path d="M9 11.5L7.5 13A2.5 2.5 0 014 9.5L5.5 8" />
    </Svg>
  ),
  Goat: (p: P) => (
    <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="2" y="1" width="1" height="1" fill="#c9c2b4" />
      <rect x="3" y="2" width="1" height="1" fill="#c9c2b4" />
      <rect x="12" y="1" width="1" height="1" fill="#c9c2b4" />
      <rect x="11" y="2" width="1" height="1" fill="#c9c2b4" />
      <rect x="1" y="5" width="2" height="2" fill="#e8a33c" />
      <rect x="12" y="5" width="2" height="2" fill="#e8a33c" />
      <rect x="4" y="3" width="7" height="7" fill="#e8a33c" />
      <rect x="5" y="10" width="5" height="3" fill="#e8a33c" />
      <rect x="5" y="5" width="1" height="2" fill="#1a1408" />
      <rect x="9" y="5" width="1" height="2" fill="#1a1408" />
      <rect x="6" y="11" width="3" height="1" fill="#a86f1e" />
      <rect x="7" y="12" width="1" height="1" fill="#1a1408" />
      <rect x="7" y="13" width="1" height="2" fill="#c9c2b4" />
    </svg>
  ),
};
