/**
 * Measures a view so an absolute-fill SVG can wait for a real size. Drawn at 0×0 (its first frame,
 * before layout), a viewBox scale or an objectBoundingBox gradient divides by zero and CoreGraphics
 * logs "invalid numeric value (NaN)" / "CGPathCloseSubpath: no current point".
 */
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export function useLayoutSize(): {
  ready: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const [ready, setReady] = useState(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setReady(width > 0 && height > 0);
  }, []);
  return { ready, onLayout };
}
