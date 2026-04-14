import { useId } from "react";

/** Ícone do logo — espelho de gestmiles-admin-panel.html */
export function GestMilesLogoMark({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={`am-logo-lg-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6A00A3" />
          <stop offset="100%" stopColor="#B56CFF" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="17" fill={`url(#am-logo-lg-${gid})`} />
      <path
        d="M14 58 Q36 12 58 26"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.8"
        fill="none"
        strokeDasharray="2.5 5.5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="46" r="2.2" fill="rgba(255,255,255,0.6)" />
      <circle cx="36" cy="26" r="2.2" fill="rgba(255,255,255,0.6)" />
      <circle cx="50" cy="18" r="2.2" fill="rgba(255,255,255,0.6)" />
      <g transform="translate(55,18) rotate(42) scale(0.56)">
        <path
          d="M0,-22 C2,-20 4,-12 4,-4 L26,10 L22,15 L4,6 L5,19 L12,24 L10,28 L0,25 L-10,28 L-12,24 L-5,19 L-4,6 L-22,15 L-26,10 L-4,-4 C-4,-12 -2,-20 0,-22 Z"
          fill="white"
        />
      </g>
    </svg>
  );
}
