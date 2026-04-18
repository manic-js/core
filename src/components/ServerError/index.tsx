export function ServerError() {
  const mono = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
  return (
    <main style={{
      minHeight: '100vh', maxHeight: '100vh', overflow: 'hidden',
      background: 'var(--theme-background, #FEF6F7)',
      padding: '96px 96px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      justifyContent: 'center', gap: 32, maxWidth: 1024, margin: '0 auto',
    }}>
      <style>{`@media(max-width:640px){.manic-err{padding:96px 24px !important}}`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="/assets/icon.svg" style={{ width: 40, height: 40, opacity: 0.9 }} alt="" />
        <h1 style={{ fontSize: '2.25rem', color: 'var(--theme-accent, #e85d5d)', fontFamily: mono, margin: 0, fontWeight: 700 }}>Error</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--theme-foreground, #151212)', fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>
          A client-side exception occurred.
        </p>
        <p style={{ color: 'var(--theme-foreground, #151212)', fontSize: '0.95rem', margin: 0, opacity: 0.55, maxWidth: 480, lineHeight: 1.6 }}>
          Something went wrong while rendering this page. Try reloading — if it keeps happening, contact the developers. See the browser console for more information.
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          fontSize: '0.875rem', color: 'var(--theme-foreground, #151212)',
          padding: '8px 18px', borderRadius: 9999, cursor: 'pointer',
          background: 'color-mix(in srgb, var(--theme-foreground, #151212) 8%, transparent)',
          border: 'none', fontWeight: 500, transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-foreground, #151212) 14%, transparent)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--theme-foreground, #151212) 8%, transparent)'; }}
      >
        Reload
      </button>
    </main>
  );
}
