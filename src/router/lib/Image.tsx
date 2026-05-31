import {
  createElement,
  type ImgHTMLAttributes,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';

/**
 * Props for the Image component
 * @interface ImageProps
 */
export interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Target image source URL or path */
  src: string;
  /** Display width of the image (pixels or percentage) */
  width?: number | string;
  /** Display height of the image (pixels or percentage) */
  height?: number | string;
  /** Image optimization quality (1-100, default: 80) */
  quality?: number;
  /** Placeholder style while image is loading ('blur' | 'empty') */
  placeholder?: 'blur' | 'empty';
  /** Low-resolution blur data URL to show as placeholder background */
  blurDataURL?: string;
}

/**
 * High-performance Image component.
 *
 * Provides automatic image format conversion, resizing, and responsive scaling.
 * Prevents Cumulative Layout Shift (CLS) and supports lazy loading.
 *
 * @param props - Image component props
 * @returns React element
 */
export function Image({
  src,
  width,
  height,
  quality = 95,
  placeholder,
  blurDataURL,
  loading = 'lazy',
  style,
  ...props
}: ImageProps) {
  const isLocal = src ? !/^(https?:|\/\/)/.test(src) : false;
  const isSvg = src
    ? (src.split('?')[0] || '').toLowerCase().endsWith('.svg')
    : false;

  if (process.env.NODE_ENV !== 'production') {
    if (!width && !height && !isSvg) {
      console.warn(
        `[Manic Image Warning]: Image with src "${src}" is missing "width" and/or "height" properties. Setting dimensions prevents Cumulative Layout Shift (CLS).`
      );
    }
  }

  let optimizedSrc = src;
  if (src && isLocal && !src.startsWith('data:') && !isSvg) {
    const params = new URLSearchParams();
    params.set('url', src);
    if (width && !isNaN(Number(width))) {
      params.set('w', String(width));
    }
    params.set('q', String(quality));
    optimizedSrc = `/api/_manic/image?${params.toString()}`;
  }

  const finalStyle: CSSProperties = {
    ...style,
    ...(placeholder === 'blur' && blurDataURL
      ? {
          backgroundImage: `url("${blurDataURL}")`,
          backgroundSize: 'cover',
          backgroundPosition: '50% 50%',
          filter: 'blur(20px)',
          transition: 'filter 0.3s ease-out',
        }
      : {}),
  };

  return createElement('img', {
    ...props,
    src: optimizedSrc,
    width,
    height,
    loading,
    style: finalStyle,
    onLoad: (e: SyntheticEvent<HTMLImageElement, Event>) => {
      if (placeholder === 'blur') {
        const target = e.currentTarget;
        target.style.filter = 'none';
      }
      if (props.onLoad) {
        props.onLoad(e);
      }
    },
  });
}
