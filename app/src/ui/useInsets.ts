/**
 * Safe-area insets that degrade to zero when there is no `SafeAreaProvider` (Jest, isolated
 * renders) instead of throwing like `useSafeAreaInsets` does.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function useInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? ZERO;
}
