import { useCallback, useEffect, useRef, useState } from "react";

interface AsciiDotsFullscreenProps {
  density?: number;
  animationSpeed?: number;
}

const hexToRgb = (hex: string) => {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  if (parsed.length === 3) {
    const r = (bigint >> 8) & 0xf;
    const g = (bigint >> 4) & 0xf;
    const b = bigint & 0xf;
    return `${r * 17}, ${g * 17}, ${b * 17}`;
  } else {
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  }
};

export const BlinkingAsciiDots = ({
  density = 0.5,
  animationSpeed = 0.2,
}: AsciiDotsFullscreenProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });
  const [colors, setColors] = useState({
    backgroundColor: "#f0eee6",
    textColor: "14, 14, 14",
  });
  const colorsRef = useRef(colors);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  const CHARS = "⠁⠂⠄⠈⠐⠠⡀⢀⠃⠅⠘⠨⠊⠋⠌⠍⠎⠏⠑⠒⠓⠔⠕⠖⠗⠙⠚⠛⠜⠝⠞⠟⠡⠢⠣⠤⠥⠦⠧⠩⠪⠫⠬⠭⠮⠯⠱⠲⠳⠴⠵⠶⠷⠹⠺⠻⠼⠽⠾⠿";

  const calculateGrid = useCallback(() => {
    if (!containerRef.current) return { cols: 0, rows: 0, cellSize: 0 };
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const baseCellSize = 16;
    const cellSize = baseCellSize / density;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    return { cols, rows, cellSize };
  }, [density]);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerRef.current.clientWidth * dpr;
    canvas.height = containerRef.current.clientHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const getMouseInfluence = useCallback((x: number, y: number) => {
    const dx = x - mouseRef.current.x;
    const dy = y - mouseRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 200;
    return Math.max(0, 1 - distance / maxDistance) * 2;
  }, []);

  const getWaveValue = useCallback((x: number, y: number, time: number) => {
    const wave1 =
      Math.sin(x * 0.05 + time * 0.5) * Math.cos(y * 0.05 - time * 0.3);
    const wave2 = Math.sin((x + y) * 0.04 + time * 0.7) * 0.5;
    const wave3 = Math.cos(x * 0.06 - y * 0.06 + time * 0.4) * 0.3;

    return (wave1 + wave2 + wave3) / 2;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    timeRef.current += animationSpeed * 0.016;
    const { cols, rows, cellSize } = calculateGrid();
    ctx.fillStyle = colorsRef.current.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${cellSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const posX = x * cellSize + cellSize / 2;
        const posY = y * cellSize + cellSize / 2;
        let waveValue = getWaveValue(posX, posY, timeRef.current);
        const mouseInfluence = getMouseInfluence(posX, posY);
        if (mouseInfluence > 0) {
          waveValue +=
            mouseInfluence *
            Math.sin(timeRef.current * 3) *
            (timeRef.current / 20);
        }
        const normalizedValue = (waveValue + 1) / 2;
        if (Math.abs(waveValue) > 0.15) {
          const charIndex = Math.floor(normalizedValue * CHARS.length);
          const char =
            CHARS[Math.min(CHARS.length - 1, Math.max(0, charIndex))];
          const opacity = normalizedValue * 0.3;
          ctx.fillStyle = `rgba(${colorsRef.current.textColor}, ${opacity})`;
          ctx.fillText(char ?? "", posX, posY);
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(animate);
  }, [animationSpeed, calculateGrid, getWaveValue, getMouseInfluence]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    handleResize();
    window.addEventListener("resize", handleResize);
    containerRef.current.addEventListener("mousemove", handleMouseMove);
    animationFrameId.current = requestAnimationFrame(animate);

    const getColors = () => {
      const style = getComputedStyle(document.documentElement);
      const bg = style.getPropertyValue("--color-background").trim();
      const fg = style.getPropertyValue("--color-foreground").trim();
      return { backgroundColor: bg, textColor: hexToRgb(fg) };
    };

    const updateThemeColors = () => setColors(getColors());

    const observer = new MutationObserver(updateThemeColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", updateThemeColors);

    updateThemeColors();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (containerRef.current) {
        containerRef.current.removeEventListener("mousemove", handleMouseMove);
      }
      mq.removeEventListener("change", updateThemeColors);
      observer.disconnect();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [animate, handleResize, handleMouseMove]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden dark:opacity-40"
      style={{ backgroundColor: colors.backgroundColor }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
