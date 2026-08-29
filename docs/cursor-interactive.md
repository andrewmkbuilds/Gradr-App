# Cursor atmosphere and `data-cursor="interactive"`

The pointer atmosphere (`src/components/effects/CursorEffects.tsx`) paints three
decorative layers that follow the mouse:

| Layer  | Attribute                    | Behaviour |
|--------|------------------------------|-----------|
| Halo   | `data-cursor-layer="halo"`   | Lazy spring, soft ambient glow. Grows and brightens over interactive targets. |
| Ring   | `data-cursor-layer="ring"`   | Snappy spring. Scales up on hover, shrinks on mouse-down. |
| Dot    | `data-cursor-layer="dot"`    | Raw motion value, zero latency. Fades out over interactive targets. |

The whole layer is decorative: `pointer-events-none`, `aria-hidden`, and the
native cursor is never replaced — only accompanied.

## When it mounts

It renders only when **all** of these hold:

- depth capability resolves to `full` (see `useSpatialPointer()` →
  `useDepthCapability()`),
- the viewport is `md` and wider (`hidden md:block`),
- the moving pointer is a real mouse (`event.pointerType === "mouse"`).

Reduced motion — the OS setting *or* the in-app motion toggle — forces depth to
`off`, which unmounts the whole layer. Touch devices, narrow viewports, low
core/memory devices and save-data resolve to `lite` or `off` and never get it.

Use the depth debug overlay to see the resolved state on any device: append
`?debug=depth` to any URL (it sticks for the session; `?debug=off` clears it).
It is always on in dev builds.

## Marking an element as an interactive target

Natively interactive elements are detected automatically:

```
a, button, [role="button"], [role="link"], input, select, textarea, summary
```

Anything else that *behaves* like a target should opt in explicitly:

```tsx
<div
  data-cursor="interactive"
  onClick={onSelect}
  role="button"
  tabIndex={0}
>
  …
</div>
```

Rules of thumb:

- **Do** mark custom clickable cards, drag handles, canvas hit-areas, and
  composite controls whose real `<button>` is a small child but whose whole
  surface reacts.
- **Do** put the attribute on the *outermost* element of the target. Detection
  uses `Element.closest()`, so any descendant of a marked element counts.
- **Don't** mark large layout containers (sections, page shells, grids) — the
  ring would stay expanded across most of the screen.
- **Don't** use it as a substitute for real semantics. `data-cursor` is
  cosmetic; keyboard users still need a `<button>`/`<a>` or a proper
  `role` + `tabIndex` + key handling.

### Opting out

There is no opt-out attribute. If a native control should not read as a target,
it usually should not be a native control — render it as non-interactive markup
instead.

## Testing

- `bun run test:cursor` — Playwright end-to-end coverage: desktop mount, ring
  hover/press scaling, mobile non-mount, reduced-motion unmount.
- `src/test/depthCapabilityGate.test.ts` — unit coverage for the capability gate
  (reduced motion, viewport width, coarse pointer, memory, cores, FPS probe).

When adding a new `data-cursor="interactive"` surface, no test update is needed;
the e2e script picks the first visible interactive target on the route.

## Pinning a level for testing

`?depth=full|lite|off` pins the depth capability for the session (`?depth=auto`
hands control back to detection). A pinned level also freezes the frame-rate
probe, so a slow or headless device cannot silently downgrade mid-test.
Reduced motion still wins over any pin.
