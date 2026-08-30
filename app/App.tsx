import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder root screen. Wave 4 (docs/handoff/wave-04-*.md) owns the real UI
 * (Home → Generate → Approval → Active → Summary). This file exists only to prove the
 * dev-client boots on the simulator (wave-01a-skeleton done criteria).
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RoamFit</Text>
      <Text style={styles.subtitle}>Skeleton boots. Nothing to see yet.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
