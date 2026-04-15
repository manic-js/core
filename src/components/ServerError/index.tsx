export function ServerError() {
  return (
    <main className="w-screen h-screen bg-background flex items-center justify-center">
      <div className="flex items-center justify-center flex-col gap-6">
        <h1 className="text-3xl text-foreground font-mono">500</h1>
        <div className="h-0.5 bg-foreground w-12 rounded-full" />
        <p className="text-foreground text-xl">Something went wrong</p>
      </div>
    </main>
  );
}
