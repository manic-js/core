import { createContext, useContext } from "react";
import type { RouterContextValue } from "./types";

export const RouterContext = createContext<RouterContextValue | null>(null);

export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRouter must be used within a <Router>");
  return context;
}
