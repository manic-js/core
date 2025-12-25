import {
  createElement,
  type ReactNode,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
} from "react";

interface ViewTransitionProps
  extends Omit<HTMLAttributes<HTMLElement>, "style"> {
  name: string;
  children?: ReactNode;
  className?: string;
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

export const ViewTransitions = {
  div: createViewTransitionElement("div"),
  span: createViewTransitionElement("span"),
  main: createViewTransitionElement("main"),
  section: createViewTransitionElement("section"),
  article: createViewTransitionElement("article"),
  header: createViewTransitionElement("header"),
  footer: createViewTransitionElement("footer"),
  nav: createViewTransitionElement("nav"),
  aside: createViewTransitionElement("aside"),
  h1: createViewTransitionElement("h1"),
  h2: createViewTransitionElement("h2"),
  h3: createViewTransitionElement("h3"),
  p: createViewTransitionElement("p"),
  img: createViewTransitionElement("img"),
  button: createViewTransitionElement("button"),
  a: createViewTransitionElement("a"),
  ul: createViewTransitionElement("ul"),
  li: createViewTransitionElement("li"),
} as const;

export { navigate, setViewTransitions } from "../router/lib/Router";
