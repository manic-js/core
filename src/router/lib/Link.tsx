import {
  createElement,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { useRouter } from './context';
import { navigate, preloadRoute } from './Router';

/**
 * Props for the Link component
 * @interface LinkProps
 */
interface LinkProps {
  /** Target URL path to navigate to */
  to: string;
  /** Link content */
  children: ReactNode;
  /** CSS class name for styling */
  className?: string;
  /** Inline CSS styles */
  style?: CSSProperties;
  /** CSS view-transition-name for animating this element across navigations */
  viewTransitionName?: string;
  /** Preload the target route on hover (default: true) */
  prefetch?: boolean;
  /** Replace the current history entry instead of pushing a new one */
  replace?: boolean;
}

/**
 * Client-side navigation link with route prefetching.
 *
 * Provides SPA navigation without full page reloads.
 * Prefetches route code on hover/focus for instant navigation.
 *
 * @param props - Link component props
 * @param props.to - Target URL path
 * @param props.children - Link content
 * @param props.className - CSS class name
 * @param props.style - Inline styles
 * @param props.viewTransitionName - View Transition name
 * @param props.prefetch - Preload route on hover
 * @param props.replace - Replace history entry
 * @returns React element
 * @see https://www.manicjs.tech/docs/api/router/link#props
 *
 * @example
 * import { Link } from 'manicjs/router';
 *
 * <Link to="/about">About</Link>
 *
 * @example
 * // With prefetch disabled
 * <Link to="/heavy" prefetch={false}>Heavy Page</Link>
 *
 * @example
 * // With View Transitions
 * <Link to="/user/1" viewTransitionName="user-card">View User</Link>
 */
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
