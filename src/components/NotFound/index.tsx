import { navigate } from '../../router/lib/Router';
import { useState } from 'react';

type RouteEntry = { path: string; file: string; componentName: string };

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase(),
    s2 = b.toLowerCase();
  if (s1 === s2) return 1;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  let matches = 0,
    si = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i], si)) {
      matches++;
      si = longer.indexOf(shorter[i], si) + 1;
    }
  }
  // also reward shared segments
  const segsA = s1.split('/').filter(Boolean);
  const segsB = s2.split('/').filter(Boolean);
  const sharedSegs = segsA.filter(s => segsB.includes(s)).length;
  return (
    (matches / longer.length) * 0.6 +
    (sharedSegs / Math.max(segsA.length, segsB.length, 1)) * 0.4
  );
}

export function NotFound({
  routes,
  currentPath,
}: {
  routes?: RouteEntry[];
  currentPath?: string;
}) {
  const [showRoutes, setShowRoutes] = useState(false);
  return (
    <main
      style={{
        minHeight: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--theme-background, #fafafa)',
        width: '100vw',
      }}
    >
      <div
        style={{
          minHeight: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          padding: '96px 96px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: showRoutes ? 32 : routes ? 112 : 32,
          transition: 'gap 0.4s cubic-bezier(.19, 1, .22, 1)',
          maxWidth: 1024,
          margin: '0 auto',
        }}
        className="manic-not-found"
      >
        <style>{`
        @media (max-width: 640px) {
          .manic-not-found { padding: 96px 24px !important; }
          .manic-not-found-btns { flex-wrap: wrap; }
        }
      `}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src="/assets/icon.svg"
            style={{ width: 40, height: 40, opacity: 0.9 }}
            alt=""
          />
          <h1
            style={{
              fontSize: '2.25rem',
              color: 'var(--theme-accent, #e85d5d)',
              fontFamily: 'monospace',
              margin: 0,
              fontWeight: 700,
            }}
          >
            404
          </h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p
            style={{
              color: 'var(--theme-foreground, #151212)',
              fontSize: '1.25rem',
              margin: 0,
              fontWeight: 600,
            }}
          >
            We couldn't find the page you are looking for.
          </p>
          <p
            style={{
              color: 'var(--theme-foreground, #151212)',
              fontSize: '0.95rem',
              margin: 0,
              opacity: 0.55,
              maxWidth: 480,
              lineHeight: 1.6,
            }}
          >
            {routes ? (
              <>
                You might have mistyped the URL, or the route may not be
                configured yet. Make sure the file exists under{' '}
                <code
                  style={{
                    fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.06)',
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  app/routes/
                </code>{' '}
                and follows the file-based routing convention.
              </>
            ) : (
              'You might have mistyped the URL, or the page may have moved. Try going back or heading to the homepage.'
            )}
          </p>
        </div>

        <div
          className="manic-not-found-btns"
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          {routes ? (
            <a
              href="https://github.com/Rahuletto/manic/wiki/Routing"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.875rem',
                color: 'var(--theme-foreground, #151212)',
                textDecoration: 'none',
                padding: '8px 18px',
                borderRadius: 9999,
                border:
                  '1.5px solid color-mix(in srgb, var(--theme-foreground, #151212) 15%, transparent)',
                fontWeight: 500,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 40%, transparent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 15%, transparent)';
              }}
            >
              Routing docs →
            </a>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{
                fontSize: '0.875rem',
                color: 'var(--theme-foreground, #151212)',
                padding: '8px 18px',
                borderRadius: 9999,
                border:
                  '1.5px solid color-mix(in srgb, var(--theme-foreground, #151212) 15%, transparent)',
                fontWeight: 500,
                cursor: 'pointer',
                background: 'none',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 40%, transparent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 15%, transparent)';
              }}
            >
              Go home →
            </button>
          )}

          {routes && routes.length > 0 && (
            <button
              onClick={() => setShowRoutes(s => !s)}
              style={{
                fontSize: '0.875rem',
                color: 'var(--theme-foreground, #151212)',
                padding: '8px 18px',
                borderRadius: 9999,
                border: 'none',
                background:
                  'color-mix(in srgb, var(--theme-foreground, #151212) 8%, transparent)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 14%, transparent)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  'color-mix(in srgb, var(--theme-foreground, #151212) 8%, transparent)';
              }}
            >
              {showRoutes ? 'Hide routes' : 'Show all routes'}
            </button>
          )}
        </div>

        {routes && routes.length > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: showRoutes ? 400 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.15s cubic-bezier(.19, 1, .22, 1)',
            }}
          >
            {currentPath && (
              <div
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255,85,85,0.06)',
                  border: '1px solid rgba(255,85,85,0.15)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  marginBottom: 8,
                }}
              >
                <span style={{ color: '#ff5555' }}>{currentPath}</span>
                <span
                  style={{
                    color: '#ff5555',
                    opacity: 0.5,
                    fontSize: '0.75rem',
                  }}
                >
                  you are here
                </span>
              </div>
            )}
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                overflowY: 'auto',
                minHeight: 0,
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'monospace',
                  border: 0,
                }}
              >
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: 'var(--theme-background, #FEF6F7)',
                  }}
                >
                  <tr
                    style={{
                      background:
                        'color-mix(in srgb, var(--theme-foreground, #151212) 10%, transparent)',
                    }}
                  >
                    <th
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        color: 'var(--theme-accent, #e85d5d)',
                        fontWeight: 700,
                        borderRight:
                          '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                      }}
                    >
                      Path
                    </th>
                    <th
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        color: 'var(--theme-accent, #e85d5d)',
                        fontWeight: 700,
                        borderRight:
                          '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                      }}
                    >
                      Component
                    </th>
                    <th
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontSize: '0.8rem',
                        color: 'var(--theme-accent, #e85d5d)',
                        fontWeight: 700,
                      }}
                    >
                      Navigate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route, i) => {
                    const score = currentPath
                      ? similarity(currentPath, route.path)
                      : 0;
                    const rowColor =
                      score > 0.8
                        ? 'rgba(255,184,0,0.08)'
                        : i % 2 !== 0
                          ? 'color-mix(in srgb, var(--theme-foreground, #151212) 3%, transparent)'
                          : 'transparent';
                    const pathColor =
                      score > 0.8
                        ? '#ffb800'
                        : score > 0.5
                          ? '#ff9500'
                          : 'var(--theme-foreground, #151212)';
                    return (
                      <tr
                        key={route.path}
                        style={{
                          borderTop:
                            '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                          background: rowColor,
                        }}
                      >
                        <td
                          style={{
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            color: pathColor,
                            opacity: 0.9,
                            borderRight:
                              '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                          }}
                        >
                          {route.path}
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            color: 'var(--theme-foreground, #151212)',
                            opacity: 0.5,
                            borderRight:
                              '1px solid var(--theme-border, rgba(0,0,0,0.08))',
                          }}
                        >
                          <button
                            onClick={() =>
                              fetch(
                                `/_manic/open?file=${encodeURIComponent(route.file)}`
                              )
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              color: 'var(--theme-foreground, #151212)',
                              opacity: 0.5,
                              textDecoration: 'underline',
                              textDecorationStyle: 'dotted',
                            }}
                            title={route.file}
                          >
                            {route.componentName ||
                              route.file
                                .split('/')
                                .pop()
                                ?.replace(/\.tsx?$/, '')}
                          </button>
                        </td>
                        <td
                          style={{ padding: '10px 16px', textAlign: 'right' }}
                        >
                          <button
                            onClick={() => navigate(route.path)}
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--theme-foreground, #151212)',
                              opacity: 0.5,
                              cursor: 'pointer',
                              border: 'none',
                              padding: '3px 10px',
                              borderRadius: 9999,
                              background:
                                'color-mix(in srgb, var(--theme-foreground, #151212) 5%, transparent)',
                              transition: 'opacity 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.background =
                                'color-mix(in srgb, var(--theme-foreground, #151212) 10%, transparent)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.opacity = '0.5';
                              e.currentTarget.style.background =
                                'color-mix(in srgb, var(--theme-foreground, #151212) 5%, transparent)';
                            }}
                          >
                            Go →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
