import {
  createElement,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useRouter } from './context';
import { navigate, preloadRoute } from './Router';

interface LinkProps {
  /** Target path to navigate to */
  to: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** CSS view-transition-name for animating this element across navigations */
  viewTransitionName?: string;
  /** Preload the target route on hover @default true */
  prefetch?: boolean;
  /** Replace the current history entry instead of pushing a new one */
  replace?: boolean;
}

/** Client-side navigation link with route prefetching on hover */
export function Link({
  to,
  children,
  className,
  style,
  viewTransitionName,
  prefetch = true,
  replace = false,
}: LinkProps) {
  useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(to, { replace });
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
    'a',
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
