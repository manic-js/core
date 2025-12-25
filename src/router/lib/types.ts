import type { ComponentType } from "react";

export interface RouteDef {
  path: string;
  component: ComponentType | null;
  loader?: () => Promise<{ default: ComponentType }>;
}

export interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
  params: Record<string, string>;
}
