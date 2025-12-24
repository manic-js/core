import { BlinkingAsciiDots } from "./DotBackground";

export function NotFound() {
  return (
    <main className="w-screen h-screen bg-background">
      <BlinkingAsciiDots animationSpeed={0.2} density={0.5} />
      <div className="w-screen h-screen absolute z-10 pointer-events-none flex-col gap-12  flex items-center justify-center">
        {/* LOGO */}
        <img
          src="/assets/not-found.svg"
          className="max-w-48 dark:invert-0 invert"
          alt="Search icon"
        />
        <div className="flex items-center justify-center flex-row gap-6">
          <h1 className="text-3xl text-foreground font-mono">404</h1>
          <div className="h-12 bg-foreground w-0.5 rounded-full" />
          <p className="text-foreground text-xl">This page does not exist</p>
        </div>
      </div>
    </main>
  );
}
