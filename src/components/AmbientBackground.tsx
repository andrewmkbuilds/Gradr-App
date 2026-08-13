/**
 * Ambient depth layer.
 *
 * Four stacked planes read as physical distance behind the content:
 *   1. a far perspective floor that recedes toward the horizon
 *   2. a parallax grid
 *   3. slow-drifting glow orbs (the light sources)
 *   4. a handful of near motes catching that light
 *
 * Purely decorative, pointer-events-none, and fully stopped under
 * prefers-reduced-motion / the in-app motion toggle (`data-motion-decorative`).
 */
const MOTES = [
  { left: "12%", top: "22%", size: 4, delay: "0s", dur: "19s" },
  { left: "78%", top: "18%", size: 3, delay: "-4s", dur: "23s" },
  { left: "34%", top: "68%", size: 5, delay: "-9s", dur: "26s" },
  { left: "62%", top: "54%", size: 3, delay: "-13s", dur: "21s" },
  { left: "88%", top: "74%", size: 4, delay: "-6s", dur: "28s" },
  { left: "22%", top: "44%", size: 2, delay: "-16s", dur: "24s" },
];

export function AmbientBackground() {
  return (
    <div className="ambient-field fixed inset-0" aria-hidden="true">
      <div className="ambient-floor" data-motion-decorative />
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
      <div className="ambient-motes" data-motion-decorative>
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="ambient-mote"
            style={{
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              animationDelay: m.delay,
              animationDuration: m.dur,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default AmbientBackground;
