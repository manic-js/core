import {
  useState,
  useEffect,
  useCallback,
  createElement,
  createContext,
  useContext,
  type ReactNode,
} from 'react';

/** Theme mode: light, dark, or follow system preference */
type Theme = 'light' | 'dark' | 'system';

/** LocalStorage key for persisting theme preference */
const STORAGE_KEY = 'manic-theme';

/**
 * Context value for theme state and actions
 * @interface ThemeContextValue
 */
interface ThemeContextValue {
  /** Current theme setting */
  theme: Theme;
  /** Resolved theme (light/dark after resolving 'system') */
  resolvedTheme: 'light' | 'dark';
  /** Set the theme */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark */
  toggle: () => void;
  /** Whether dark mode is active */
  isDark: boolean;
  /** Whether light mode is active */
  isLight: boolean;
}

/** React context for theme state - use useTheme() to access */
const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Gets the system's color scheme preference
 * @returns 'light' or 'dark' based on system settings
 * @internal
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  const root = document.documentElement;

  if (resolvedTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Theme provider component that manages light/dark/system theme.
 * Wraps your app to provide theme context to all child components.
 * Adds 'dark' class to <html> element when dark mode is active.
 *
 * @param props - Component props
 * @param props.children - Child components that need theme access
 * @returns React element with theme context
 * @see https://www.manicjs.tech/docs/api/theme/theme-provider#behavior
 *
 * @example
 * import { ThemeProvider } from 'manicjs/theme';
 *
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? getSystemTheme() : theme
  );

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
    setResolvedTheme(newTheme === 'system' ? getSystemTheme() : newTheme);
  }, []);

  const toggle = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
        setResolvedTheme(getSystemTheme());
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggle,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
  };

  return createElement(ThemeContext.Provider, { value }, children);
}

/** Access theme state and helpers from ThemeProvider. @see https://www.manicjs.tech/docs/api/theme/use-theme#signature */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export interface ThemeToggleProps {
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode | ((theme: 'light' | 'dark') => ReactNode);
}

/** Accessible light/dark toggle button. @see https://www.manicjs.tech/docs/api/theme/theme-toggle#props-themetoggleprops */
export function ThemeToggle({ className, style, children }: ThemeToggleProps) {
  const { toggle, isDark, resolvedTheme } = useTheme();

  const content =
    typeof children === 'function' ? children(resolvedTheme) : children;

  return createElement(
    'button',
    {
      onClick: toggle,
      className,
      style,
      'aria-label': isDark ? 'Switch to light mode' : 'Switch to dark mode',
    },
    content || (isDark ? '☀️' : '🌙')
  );
}

/** Initialize persisted theme before first paint. @see https://www.manicjs.tech/docs/api/theme/init-theme#when-it-runs-today */
export function initTheme() {
  if (typeof window === 'undefined') return;
  applyTheme(getStoredTheme());
}

if (typeof window !== 'undefined') {
  initTheme();
}
