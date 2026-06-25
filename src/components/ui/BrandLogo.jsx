import { useRef } from "react";
import { BRAND_NAME } from "../../theme.jsx";
import { uid } from "../../utils/businessLogic.js";

// Logo vectorial integrado a partir de la referencia visual entregada para mantenerlo portable en React y HTML.
export function BrandLogo({ size=48 }) {
  const ids = useRef({
    metal: `moxi-metal-${uid()}`,
    accent: `moxi-accent-${uid()}`,
    shadow: `moxi-shadow-${uid()}`,
  }).current;

  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 460 360" role="img" aria-label={BRAND_NAME}>
      <defs>
        <linearGradient id={ids.metal} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DCE6EF" />
          <stop offset="38%" stopColor="#8FA3B6" />
          <stop offset="100%" stopColor="#4B5F72" />
        </linearGradient>
        <linearGradient id={ids.accent} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <filter id={ids.shadow} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#0F172A" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter={`url(#${ids.shadow})`}>
        <path d="M54 254 156 58l74 146 74-146 102 196-92-45-40-76-38 75h-12l-38-75-39 76Z" fill={`url(#${ids.metal})`} stroke="#5B7287" strokeWidth="10" strokeLinejoin="round" />
        <path d="M30 308c118-70 281-70 398 0-118-26-281-26-398 0Z" fill={`url(#${ids.accent})`} opacity="0.18" />
        <path d="M18 312c127-92 297-92 424 0-122-47-297-47-424 0Z" fill={`url(#${ids.metal})`} stroke="#516578" strokeWidth="10" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
