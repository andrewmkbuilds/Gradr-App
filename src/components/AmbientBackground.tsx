/**
 * Ambient motion layer: slow-drifting glow orbs plus a parallax grid.
 * Purely decorative, pointer-events-none, and paused under
 * prefers-reduced-motion (handled in index.css).
 */
export function AmbientBackground() {
  return (
    <div className="ambient-field fixed inset-0" aria-hidden="true">
      <div className="ambient-grid" />
      <div
        className="ambient-orb"
        style={{
          width: "42vw",
          height: "42vw",
          top: "-12vw",
          left: "-8vw",
          background: "hsl(var(--primary) / 0.9)",
          animationDelay: "0s",
        }}
      />
      <div
        className="ambient-orb"
        style={{
          width: "38vw",
          height: "38vw",
          bottom: "-14vw",
          right: "-10vw",
          background: "hsl(var(--brand-secondary) / 0.9)",
          animationDelay: "-9s",
        }}
      />
      <div
        className="ambient-orb"
        style={{
          width: "30vw",
          height: "30vw",
          top: "40%",
          left: "55%",
          background: "hsl(var(--info) / 0.6)",
          animationDelay: "-17s",
        }}
      />
    </div>
  );
}

export default AmbientBackground;
