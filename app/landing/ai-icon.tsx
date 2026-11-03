/**
 * NotaNota AI mark: an eighth note whose head is a speech bubble with a sound wave cut out of it.
 * Redrawn from the approved sketch as clean geometry; one colour (currentColor), optical sizes 24–56px.
 */
export function AiIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  // Below 28px the wave gets a heavier stroke so the cut-out does not fill in.
  const wave = size < 28 ? 3.6 : 3;
  return (
    <svg className={`ai-icon ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <mask id={`ai-icon-cut-${size}`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <path d="M12.5 44.5h3.6l2.6-4.4 3.9 8.6 4.1-12.2 3.9 11.4 2.7-5.6h3.2" fill="none" stroke="#000" strokeWidth={wave} strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <g fill="currentColor" mask={`url(#ai-icon-cut-${size})`}>
        {/* head: a rounded bubble with a short tail at the lower left */}
        <path d="M24.5 28.5c9.6 0 17.5 6.6 17.5 15.3S34.1 59.1 24.5 59.1c-1.9 0-3.7-.3-5.4-.8l-6.8 4.4c-.9.6-2-.3-1.7-1.3l1.9-6.3C8.8 52.3 7 48.3 7 43.8c0-8.7 7.9-15.3 17.5-15.3Z" />
        {/* stem and flag */}
        <path d="M37.8 9.2c0-1.6 1.3-2.9 2.9-2.9 1 0 1.9.5 2.4 1.3 2.4 3.7 5.6 6.4 9.1 8.9 4.4 3.1 7.4 7.4 7.4 12.8 0 3.9-1.6 7.4-4.1 10-.6.6-1.5-.1-1.1-.9 1-1.9 1.4-3.8 1.4-5.6 0-3.9-2.6-6.9-6.8-8.8-1.9-.9-3.6-2-5-3.3V44h-6.2Z" />
      </g>
    </svg>
  );
}
