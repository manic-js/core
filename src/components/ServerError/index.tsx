import { useState, useEffect, useCallback, useRef } from 'react';

interface SourceFrame {
  file: string;
  line: number;
  column: number;
  sourceLines: string[];
  highlightIndex: number;
  fullSource: string;
}

interface ParsedFrame {
  fn: string;
  file: string;
  line: number;
  column: number;
  raw: string;
  isApp: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function parseAllFrames(stack: string): ParsedFrame[] {
  return stack
    .split('\n')
    .map(line => line.trim())
    .filter(l => l.length > 0)
    .map(raw => {
      // Handle various formats: "at ...", "Function — ...", etc.
      const m =
        raw.match(/at\s+(.*?)\s+\((.*):(\d+):(\d+)\)/) ||
        raw.match(/at\s+()(.*):(\d+):(\d+)/) ||
        raw.match(/(.*?)\s*[—@]\s*(.*):(\d+):(\d+)/) ||
        raw.match(/()(.*):(\d+):(\d+)/);

      if (!m) return null;
      const file = m[2];
      const isApp =
        !file.includes('node_modules') &&
        !file.includes('react-refresh') &&
        !file.includes('https://esm.sh') &&
        !file.includes('_bun/client') &&
        !file.startsWith('bun:');

      return {
        fn: m[1] || '(anonymous)',
        file,
        line: parseInt(m[3], 10),
        column: parseInt(m[4], 10),
        raw: raw.trim(),
        isApp,
      };
    })
    .filter(Boolean) as ParsedFrame[];
}

function firstAppFrame(frames: ParsedFrame[]): ParsedFrame | null {
  return frames.find(f => f.isApp) ?? frames[0] ?? null;
}

// Minimal VLQ decoder for source map resolution
function decodeVLQ(input: string): number[] {
  const charToValue: Record<string, number> = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach((c, i) => (charToValue[c] = i));
  const values: number[] = [];
  let current = 0,
    shift = 0;
  for (let i = 0; i < input.length; i++) {
    let val = charToValue[input[i]];
    if (val === undefined) continue;
    current += (val & 31) << shift;
    if (val & 32) {
      shift += 5;
    } else {
      const isNegative = current & 1;
      current >>= 1;
      values.push(isNegative ? -current : current);
      current = 0;
      shift = 0;
    }
  }
  return values;
}

async function resolveFrame(loc: ParsedFrame): Promise<SourceFrame | null> {
  try {
    const res = await fetch(loc.file);
    if (!res.ok) return null;
    const text = await res.text();
    let mapContent: any = null;
    const inlineMapMatch = text.match(
      /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/
    );

    if (inlineMapMatch) {
      mapContent = JSON.parse(atob(inlineMapMatch[1]));
    } else {
      const externalMapMatch = text.match(/\/\/# sourceMappingURL=(.*\.map)/);
      if (externalMapMatch) {
        try {
          const mapUrl = new URL(externalMapMatch[1], loc.file).toString();
          const mapRes = await fetch(mapUrl);
          if (mapRes.ok) mapContent = await mapRes.json();
        } catch (e) {
          console.warn('[Manic] External map fetch failed', e);
        }
      }
    }

    if (mapContent) {
      const map = mapContent;
      const mappings = map.mappings.split(';');
      const sources = map.sources;
      const sourcesContent = map.sourcesContent || [];

      let targetSrcIdx = 0,
        targetSrcLine = 0,
        targetSrcCol = 0;
      const lineIdx = loc.line - 1;

      for (let i = 0; i < mappings.length; i++) {
        let lineCol = 0;
        const lineMappings = mappings[i].split(',');

        for (const segment of lineMappings) {
          if (!segment) continue;
          const decoded = decodeVLQ(segment);
          if (decoded.length === 0) continue;

          lineCol += decoded[0];
          if (decoded.length >= 4) {
            targetSrcIdx += decoded[1];
            targetSrcLine += decoded[2];
            targetSrcCol += decoded[3];
          }

          if (i === lineIdx && lineCol >= loc.column - 1) {
            const content = sourcesContent[targetSrcIdx] || '';
            const lines = content.split('\n');
            const start = Math.max(0, targetSrcLine - 5);
            const end = Math.min(lines.length, targetSrcLine + 7 + 1);
            return {
              file: sources[targetSrcIdx] || loc.file,
              line: targetSrcLine + 1,
              column: targetSrcCol + 1,
              sourceLines: lines.slice(start, end),
              highlightIndex: targetSrcLine - start,
              fullSource: content,
            };
          }
        }

        if (i === lineIdx && targetSrcLine > 0) {
          const content = sourcesContent[targetSrcIdx] || '';
          const lines = content.split('\n');
          const start = Math.max(0, targetSrcLine - 5);
          const end = Math.min(lines.length, targetSrcLine + 7 + 1);
          return {
            file: sources[targetSrcIdx] || loc.file,
            line: targetSrcLine + 1,
            column: targetSrcCol + 1,
            sourceLines: lines.slice(start, end),
            highlightIndex: targetSrcLine - start,
            fullSource: content,
          };
        }
      }
    }

    // Fallback: show the fetched file as-is
    const all = text.split('\n');
    const start = Math.max(0, loc.line - 6);
    const end = Math.min(all.length, loc.line + 7);
    return {
      file: loc.file,
      line: loc.line,
      column: loc.column,
      sourceLines: all.slice(start, end),
      highlightIndex: loc.line - 1 - start,
      fullSource: text,
    };
  } catch (e) {
    return null;
  }
}

function tokenize(code: string): { text: string; type: string }[] {
  const tokens: { text: string; type: string }[] = [];
  const re =
    /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|export|import|from|if|else|await|async|try|catch|throw|new|class|extends|typeof|instanceof|default|switch|case|break|continue|for|while|do|in|of|yield)\b)|(\b(?:string|number|boolean|any|void|null|undefined|true|false|Record|Promise|Array|Map|Set|Error)\b)|(\b[A-Z][a-zA-Z0-9]*\b)|([{}()[\];,.])|(\b\d+\b)/gm;
  let last = 0,
    m;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last)
      tokens.push({ text: code.slice(last, m.index), type: 'plain' });
    if (m[1]) tokens.push({ text: m[0], type: 'comment' });
    else if (m[2]) tokens.push({ text: m[0], type: 'string' });
    else if (m[3]) tokens.push({ text: m[0], type: 'keyword' });
    else if (m[4]) tokens.push({ text: m[0], type: 'type' });
    else if (m[5]) tokens.push({ text: m[0], type: 'component' });
    else if (m[6]) tokens.push({ text: m[0], type: 'punct' });
    else if (m[7]) tokens.push({ text: m[0], type: 'number' });
    last = m.index + m[0].length;
  }
  if (last < code.length)
    tokens.push({ text: code.slice(last), type: 'plain' });
  return tokens;
}

const TOKEN_COLORS: Record<string, string> = {
  keyword: '#ff79c6',
  string: '#f1fa8c',
  comment: '#6272a4',
  type: '#8be9fd',
  component: '#50fa7b',
  punct: '#888',
  number: '#bd93f9',
  plain: '#d4d4d4',
};

// ── Component ────────────────────────────────────────────────

export function ServerError({ error }: { error?: Error }) {
  const [frame, setFrame] = useState<SourceFrame | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFullStack, setShowFullStack] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    const el = document.getElementById('manic-error-overlay');
    if (el) el.style.display = 'none';
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (!error?.stack) return;
    const frames = parseAllFrames(error.stack);
    const loc = firstAppFrame(frames);
    if (!loc) return;
    resolveFrame(loc).then(setFrame);
  }, [error]);

  const allFrames = error?.stack ? parseAllFrames(error.stack) : [];
  const appFrames = allFrames.filter(f => f.isApp);
  const displayFrames = showFullStack ? allFrames : appFrames;

  const copyForAI = useCallback(() => {
    if (!error) return;
    const loc = frame
      ? `${frame.file}:${frame.line}:${frame.column}`
      : 'unknown';
    const code = frame
      ? frame.sourceLines
          .map(
            (l, i) =>
              `${i === frame.highlightIndex ? '>' : ' '} ${frame.line - frame.highlightIndex + i} | ${l}`
          )
          .join('\n')
      : '';
    const text = `# Error: ${error.name}\n\n## Message\n${error.message}\n\n## Location\n${loc}\n\n## Source\n\`\`\`tsx\n${code}\n\`\`\`\n\n## Stack\n${error.stack}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [error, frame]);

  const mono =
    "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace";

  return (
    <div
      id="manic-error-overlay"
      onClick={close}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.66)',
        overflow: 'auto',
      }}
    >
      <style>{`
        #manic-error-overlay-box {
          font-family: ${mono};
          line-height: 1.5;
          width: 90vw;
          max-width: 1200px;
          color: #d8d8d8;
          box-sizing: border-box;
          margin: 40px auto;
          padding: 25px 40px;
          background: #181818;
          border-radius: 6px 6px 8px 8px;
          border-top: 8px solid #ff5555;
          box-shadow: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22);
          text-align: left;
        }
        @media (max-width: 768px) {
          #manic-error-overlay-box {
            width: 100vw;
            margin: 0;
            border-radius: 0;
            padding: 20px;
          }
          .manic-error-header {
            flex-direction: column;
            align-items: flex-start !important;
          }
          .manic-error-copy {
            margin-top: 10px;
            width: 100%;
          }
        }
      `}</style>
      <div id="manic-error-overlay-box" onClick={e => e.stopPropagation()}>
        <div
          className="manic-error-header"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#ff5555a0',
                letterSpacing: '0.05em',
                marginBottom: 6,
              }}
            >
              {error?.name || 'Error'}
            </div>
            <pre
              style={{
                fontFamily: 'inherit',
                fontSize: 16,
                fontWeight: 600,
                color: '#ff5555',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error?.message || 'An unexpected error occurred.'}
            </pre>
          </div>
          <button
            className="manic-error-copy"
            onClick={copyForAI}
            style={{
              flexShrink: 0,
              fontFamily: mono,
              fontSize: 12,
              fontWeight: 600,
              color: copied ? '#50fa7b' : '#999',
              background: copied
                ? 'rgba(80,250,123,0.1)'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${copied ? 'rgba(80,250,123,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'all 150ms',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? 'Copied' : 'Copy for LLMs'}
          </button>
        </div>

        {frame && (
          <div
            style={{
              fontSize: 13,
              color: '#888',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#2dd9da', fontWeight: 600 }}>ManicScan</span>
            <span>•</span>
            <span style={{ color: '#aaa', wordBreak: 'break-all' }}>
              {frame.file
                .replace(/^file:\/\/\//, '')
                .replace(/^https?:\/\/[^\/]+\//, '')
                .split('/Coding/')
                .pop()
                ?.split('/')
                .slice(1)
                .join('/') || frame.file}
            </span>
          </div>
        )}

        {frame && (
          <div
            style={{
              background: '#1e1e1e',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                background: '#252525',
                padding: '8px 16px',
                borderBottom: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {(() => {
                const name = frame.file.split('/').pop();
                return (
                  <>
                    <span
                      style={{ fontSize: 12, color: '#ccc', fontWeight: 600 }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#555',
                        marginLeft: 'auto',
                      }}
                    >
                      {frame.line}:{frame.column}
                    </span>
                  </>
                );
              })()}
            </div>
            <div style={{ overflowX: 'auto' }}>
              {frame.sourceLines.map((line, i) => {
                const lineNum = frame.line - frame.highlightIndex + i;
                const isError = i === frame.highlightIndex;
                const tokens = tokenize(line);

                let currentCol = 1;
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      background: isError
                        ? 'rgba(255, 85, 85, 0.12)'
                        : 'transparent',
                      borderLeft: isError
                        ? '3px solid #ff5555'
                        : '3px solid transparent',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 45,
                        minWidth: 45,
                        padding: '0 8px',
                        textAlign: 'right',
                        fontSize: 12,
                        lineHeight: '22px',
                        color: isError ? '#ff5555' : '#555',
                        background: isError
                          ? 'rgba(255, 85, 85, 0.06)'
                          : 'rgba(255,255,255,0.02)',
                        userSelect: 'none',
                      }}
                    >
                      {lineNum}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        padding: '0 12px',
                        fontSize: 13,
                        lineHeight: '22px',
                        whiteSpace: 'pre',
                        color: '#ccc',
                      }}
                    >
                      {tokens.map((t, j) => {
                        const start = currentCol;
                        const end = currentCol + t.text.length;
                        currentCol = end;

                        const isTarget =
                          isError &&
                          frame.column >= start &&
                          frame.column < end;

                        return (
                          <span
                            key={j}
                            style={{
                              color: isTarget
                                ? '#ff5555'
                                : TOKEN_COLORS[t.type] || TOKEN_COLORS.plain,
                              textDecoration: isTarget
                                ? 'underline wavy #ff5555'
                                : 'none',
                              textDecorationThickness: isTarget
                                ? '1px'
                                : 'auto',
                              textUnderlineOffset: isTarget ? '2px' : 'auto',
                            }}
                          >
                            {t.text}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {allFrames.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Call Stack
              </span>
              <button
                onClick={() => setShowFullStack(!showFullStack)}
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  color: '#888',
                  background: 'none',
                  border: '1px solid #333',
                  borderRadius: 4,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                {showFullStack
                  ? 'Show app frames only'
                  : `Show all frames (${allFrames.length})`}
              </button>
            </div>
            {displayFrames.length > 0 && (
              <div
                style={{
                  background: '#1e1e1e',
                  border: '1px solid #2a2a2a',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {displayFrames.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 16px',
                      fontSize: 12,
                      borderBottom:
                        i < displayFrames.length - 1
                          ? '1px solid #2a2a2a'
                          : 'none',
                      opacity: f.isApp ? 1 : 0.5,
                      wordBreak: 'break-all',
                    }}
                  >
                    <span style={{ color: '#d4d4d4' }}>
                      {f.fn !== '(anonymous)' ? f.fn : ''}
                    </span>
                    {f.fn !== '(anonymous)' && (
                      <span style={{ color: '#555' }}>{' — '}</span>
                    )}
                    <span style={{ color: '#2dd9da' }}>
                      {f.file.split('/').slice(-2).join('/')}
                    </span>
                    <span style={{ color: '#555' }}>
                      :{f.line}:{f.column}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            fontSize: 13,
            color: '#666',
            borderTop: '1px solid #2a2a2a',
            paddingTop: 12,
            lineHeight: 1.8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: '200px' }}>
            Click outside or press{' '}
            <kbd
              style={{
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 700,
                background: '#262830',
                color: '#a6a7ab',
                padding: '2px 5px',
                borderRadius: 4,
                border: '1px solid #363940',
                borderBottomWidth: 3,
              }}
            >
              Esc
            </kbd>{' '}
            to dismiss. Fix the code to auto-reload.
          </div>
          <div style={{ opacity: 0.5 }}>
            <svg
              width="24"
              height="22"
              viewBox="0 0 247 232"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M34.2656 18.5566V231.295L0.490234 213H0V0L34.2656 18.5566Z"
                fill="#AAAAAA"
              />
              <rect
                x="247"
                y="231.295"
                width="212.734"
                height="212.734"
                transform="rotate(-180 247 231.295)"
                fill="#EDEDED"
              />
              <path
                d="M212.734 0L247 18.5605H34.2656L0 0H212.734Z"
                fill="#D9D9D9"
              />
              <path
                d="M211.985 154.08L213.321 154.971L214.687 154.126L221.281 150.046L226.258 153.964L227.969 155.312L229.538 153.802L229.867 153.484V214.162H179.988V152.534L181.804 153.964L183.229 155.086L184.736 154.08L190.855 150.003L196.975 154.08L198.36 155.004L199.747 154.08L205.865 150.003L211.985 154.08ZM229.867 146.544L227.639 148.688L223 145.036L221.626 143.954L220.139 144.874L213.42 149.029L207.252 144.92L205.866 143.996L204.479 144.92L198.36 148.996L192.242 144.92L190.855 143.996L189.47 144.92L183.473 148.914L179.988 146.171V134H229.867V146.544Z"
                fill="#E66E6E"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
