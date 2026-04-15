import { useState, useEffect, useCallback } from "react";

interface SourceFrame {
  file: string;
  line: number;
  column: number;
  lines: string[];
  highlightIndex: number;
}

function parseStackFrame(stack: string): { file: string; line: number; column: number } | null {
  const lines = stack.split("\n");
  for (const l of lines) {
    if (l.includes("node_modules") || l.includes("react-refresh")) continue;
    if (!l.includes(".tsx") && !l.includes(".ts") && !l.includes(".jsx")) continue;
    const match =
      l.match(/at\s+.*\((.*):(\d+):(\d+)\)/) ||
      l.match(/at\s+(.*):(\d+):(\d+)/);
    if (match) {
      return { file: match[1], line: parseInt(match[2], 10), column: parseInt(match[3], 10) };
    }
  }
  return null;
}

function formatStack(stack: string): string {
  return stack
    .split("\n")
    .filter((l) => l.trim().startsWith("at "))
    .map((l) => l.trim())
    .join("\n");
}

export function ServerError({ error }: { error?: Error }) {
  const [frame, setFrame] = useState<SourceFrame | null>(null);
  const isDev =
    typeof window !== "undefined" &&
    (window as any).location.hostname === "localhost";

  const close = useCallback(() => {
    const el = document.getElementById("manic-error-overlay");
    if (el) el.style.display = "none";
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!isDev || !error?.stack) return;
    const loc = parseStackFrame(error.stack);
    if (!loc) return;

    fetch(loc.file)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.text();
      })
      .then((text) => {
        const allLines = text.split("\n");
        const start = Math.max(0, loc.line - 4);
        const end = Math.min(allLines.length, loc.line + 3);
        setFrame({
          file: loc.file,
          line: loc.line,
          column: loc.column,
          lines: allLines.slice(start, end),
          highlightIndex: loc.line - 1 - start,
        });
      })
      .catch(() => {});
  }, [error, isDev]);

  const stack = error?.stack ? formatStack(error.stack) : "";

  return (
    <div
      id="manic-error-overlay"
      onClick={close}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.66)",
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          fontFamily:
            "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
          lineHeight: 1.5,
          maxWidth: "80vw",
          color: "#d8d8d8",
          boxSizing: "border-box",
          margin: "30px auto",
          padding: "25px 40px",
          background: "#181818",
          borderRadius: "6px 6px 8px 8px",
          borderTop: "8px solid #ff5555",
          boxShadow:
            "0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22)",
          textAlign: "left",
          direction: "ltr",
        }}
      >
        {/* Error name + message */}
        <pre
          style={{
            fontFamily: "inherit",
            fontSize: 16,
            margin: "0 0 1em",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          <span style={{ fontWeight: 600, color: "#ff5555" }}>
            {error?.message || "An unexpected error occurred."}
          </span>
        </pre>

        {/* File location */}
        {frame && (
          <pre
            style={{
              fontFamily: "inherit",
              fontSize: 16,
              margin: "0 0 1em",
              color: "#2dd9da",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {frame.file}:{frame.line}:{frame.column}
          </pre>
        )}

        {/* Source code frame */}
        {frame && (
          <pre
            style={{
              fontFamily: "inherit",
              fontSize: 16,
              margin: "0 0 1em",
              color: "#e2aa53",
              overflowX: "auto",
              scrollbarWidth: "thin",
            }}
          >
            {frame.lines.map((line, i) => {
              const lineNum = frame.line - frame.highlightIndex + i;
              const gutter = String(lineNum).padStart(
                String(frame.line + 3).length,
                " "
              );
              const isError = i === frame.highlightIndex;
              const prefix = isError ? ">" : " ";
              const text = `${prefix} ${gutter} | ${line}`;

              if (isError) {
                return (
                  <span key={i}>
                    <span style={{ color: "#ff5555", fontWeight: 700 }}>
                      {text}
                    </span>
                    {"\n"}
                    <span style={{ color: "#ff5555" }}>
                      {"  " +
                        " ".repeat(gutter.length) +
                        " | " +
                        " ".repeat(Math.max(0, frame.column - 1)) +
                        "^"}
                    </span>
                    {"\n"}
                  </span>
                );
              }
              return (
                <span key={i}>
                  {text}
                  {"\n"}
                </span>
              );
            })}
          </pre>
        )}

        {/* Stack trace */}
        {stack && (
          <pre
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              margin: "0 0 1em",
              color: "#c9c9c9",
              overflowX: "auto",
              scrollbarWidth: "none",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {stack}
          </pre>
        )}

        {/* Tip */}
        <div
          style={{
            fontSize: 13,
            color: "#999",
            borderTop: "1px dotted #999",
            paddingTop: 13,
            lineHeight: 1.8,
          }}
        >
          Click outside or press{" "}
          <kbd
            style={{
              fontFamily:
                "ui-monospace, Menlo, Monaco, Consolas, monospace",
              fontSize: "0.75rem",
              fontWeight: 700,
              background: "rgb(38, 40, 44)",
              color: "rgb(166, 167, 171)",
              padding: "0.15rem 0.3rem",
              borderRadius: "0.25rem",
              border: "0.0625rem solid rgb(54, 57, 64)",
              borderBottomWidth: "0.1875rem",
            }}
          >
            Esc
          </kbd>{" "}
          to dismiss. Fix the code to auto-reload.
        </div>
      </div>
    </div>
  );
}
