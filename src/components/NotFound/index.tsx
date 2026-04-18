import { BlinkingAsciiDots } from './DotBackground';

export function NotFound() {
  return (
    <main style={{ width: '100vw', height: '100vh', background: 'var(--theme-background, #FEF6F7)', overflow: 'hidden', position: 'relative' }}>
      <BlinkingAsciiDots animationSpeed={0.2} density={0.5} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
        <img src="/assets/not-found.svg" style={{ maxWidth: 384 }} alt="Not found" />
        <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: 24 }}>
          <h1 style={{ fontSize: '1.875rem', color: 'var(--theme-foreground, #151212)', fontFamily: 'monospace', margin: 0 }}>404</h1>
          <div style={{ height: 48, width: 2, background: 'var(--theme-foreground, #151212)', borderRadius: 9999 }} />
          <p style={{ color: 'var(--theme-foreground, #151212)', fontSize: '1.25rem', margin: 0 }}>This page does not exist</p>
        </div>
      </div>
    </main>
  );
}
