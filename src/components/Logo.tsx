import { useId } from "react";

/**
 * Marca do Foco — anel safira→dourado com mira e ponto central, sobre
 * um quadrado grafite. Mesma marca do favicon e ícones PWA.
 */
export function Logo({
  size = 36,
  className,
  title = "Foco",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId();
  const badgeId = `foco-badge-${uid}`;
  const ringId = `foco-ring-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={badgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#141a2e" />
          <stop offset="100%" stopColor="#2a3358" />
        </linearGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6b8afd" />
          <stop offset="100%" stopColor="#e8c468" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill={`url(#${badgeId})`} />
      <circle cx="24" cy="24" r="13" fill="none" stroke={`url(#${ringId})`} strokeWidth="2.6" />
      <g stroke="#e8c468" strokeWidth="2.2" strokeLinecap="round">
        <line x1="24" y1="7" x2="24" y2="13" />
        <line x1="24" y1="35" x2="24" y2="41" />
        <line x1="7" y1="24" x2="13" y2="24" />
        <line x1="35" y1="24" x2="41" y2="24" />
      </g>
      <circle cx="24" cy="24" r="4" fill="#6b8afd" />
    </svg>
  );
}
