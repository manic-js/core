import {
  createElement,
  type ReactNode,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
} from 'react';

/**
 * Props for ViewTransition components
 * @interface ViewTransitionProps
 */
interface ViewTransitionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'style'
> {
  /** Unique name for the view transition (links with matching names across pages) */
  name: string;
  /** Child elements */
  children?: ReactNode;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

function createViewTransitionElement(tag: string) {
  return function ViewTransitionElement({
    name,
    children,
    className,
    style,
    ...props
  }: ViewTransitionProps): ReactElement {
    return createElement(
      tag,
      {
        ...props,
        className,
        style: { ...style, viewTransitionName: name },
      },
      children
    );
  };
}

/**
 * View Transitions components for animated page navigation.
 *
 * Use these components to mark elements that should animate between pages.
 * Elements with matching `name` props will transition smoothly
 * using the View Transitions API.
 *
 * @example
 * import { ViewTransitions, navigate } from 'manicjs/transitions';
 *
 * <ViewTransitions.div name="user-card">
 *   <UserCard user={user} />
 * </ViewTransitions.div>
 *
 * @example
 * // Using on another page with same name triggers animation
 * <ViewTransitions.img name="user-avatar" src={user.avatar} />
 *
 * @example
 * // Supported tags: div, span, main, section, article, header, footer, nav, aside, h1-h3, p, img, button, a, ul, li
 */
export const ViewTransitions = {
  div: createViewTransitionElement('div'),
  span: createViewTransitionElement('span'),
  main: createViewTransitionElement('main'),
  section: createViewTransitionElement('section'),
  article: createViewTransitionElement('article'),
  header: createViewTransitionElement('header'),
  footer: createViewTransitionElement('footer'),
  nav: createViewTransitionElement('nav'),
  aside: createViewTransitionElement('aside'),
  h1: createViewTransitionElement('h1'),
  h2: createViewTransitionElement('h2'),
  h3: createViewTransitionElement('h3'),
  p: createViewTransitionElement('p'),
  img: createViewTransitionElement('img'),
  button: createViewTransitionElement('button'),
  a: createViewTransitionElement('a'),
  ul: createViewTransitionElement('ul'),
  li: createViewTransitionElement('li'),
} as const;

export { navigate, setViewTransitions } from '../router/lib/Router';
