import {
  createElement,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useRouter } from "./context";

let viewTransitionsEnabled = true;

export function setViewTransitions(enabled: boolean): void {
  viewTransitionsEnabled = enabled;
}

export function navigate(to: string): void {
  const updateState = () => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (
    viewTransitionsEnabled &&
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (
      document as Document & { startViewTransition: (cb: () => void) => void }
    ).startViewTransition === "function"
  ) {
    (
      document as Document & { startViewTransition: (cb: () => void) => void }
    ).startViewTransition(updateState);
  } else {
    updateState();
  }
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  viewTransitionName?: string;
}

export function Link({
  to,
  children,
  className,
  style,
  viewTransitionName,
}: LinkProps) {
  useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(to);
  };

  const linkStyle: CSSProperties = viewTransitionName
    ? { ...style, viewTransitionName }
    : style || {};

  return createElement(
    "a",
    { href: to, className, style: linkStyle, onClick: handleClick },
    children
  );
}
