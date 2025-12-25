import {
  createElement,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useRouter } from "./context";
import { navigate, preloadRoute } from "./Router";

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  viewTransitionName?: string;
  prefetch?: boolean;
}

export function Link({
  to,
  children,
  className,
  style,
  viewTransitionName,
  prefetch = true,
}: LinkProps) {
  useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(to);
  };

  const handlePreload = () => {
    if (prefetch) {
      preloadRoute(to);
    }
  };

  const linkStyle: CSSProperties = viewTransitionName
    ? { ...style, viewTransitionName }
    : style || {};

  return createElement(
    "a",
    {
      href: to,
      className,
      style: linkStyle,
      onClick: handleClick,
      onMouseEnter: handlePreload,
      onFocus: handlePreload,
    },
    children
  );
}
