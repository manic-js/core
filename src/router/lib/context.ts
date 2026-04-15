import { createContext, useContext } from "react";
import type { RouterContextValue } from "./types";

/** React context for router state — use useRouter() to access */
export const RouterContext = createContext<RouterContextValue | null>(null);

/** Access current route path, params, and navigate function. Must be used within a Router */
export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRouter must be used within a <Router>");
  return context;
}
