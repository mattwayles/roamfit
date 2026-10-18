/**
 * Track 37e — Settings → Learn → Glossary. Every term the app uses, grouped, with a filter field
 * that matches a term or its definition. Read-only.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { GLOSSARY } from '../lib/glossary';
import { makeStyles, radius, space, type, useTheme } from '../theme';
import { Card, Icon, Screen, Txt } from '../ui';

export default function GlossaryScreen(): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GLOSSARY;
    return GLOSSARY.map((g) => ({
      ...g,
      terms: g.terms.filter(
        (t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q),
      ),
    })).filter((g) => g.terms.length > 0);
  }, [query]);

  return (
    <Screen scroll adjustForKeyboard testID="glossary-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Glossary
      </Txt>
      <View style={styles.search}>
        <Icon name="search" size={18} color="text3" />
        <TextInput
          testID="glossary-search"
          accessibilityLabel="Search the glossary"
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search terms"
          placeholderTextColor={theme.colors.text3}
          selectionColor={theme.colors.gold}
          keyboardAppearance={theme.scheme}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {groups.length === 0 ? (
        <Txt variant="body" color="text2" testID="glossary-empty">
          No term matches “{query.trim()}”.
        </Txt>
      ) : null}
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            {group.title}
          </Txt>
          <Card padding="md" style={styles.card}>
            {group.terms.map((t) => (
              <View
                key={t.term}
                style={styles.term}
                accessible
                accessibilityLabel={`${t.term}. ${t.definition}`}
                testID={`glossary-term-${t.term}`}
              >
                <Txt variant="bodyStrong">{t.term}</Txt>
                <Txt variant="small" color="text2">
                  {t.definition}
                </Txt>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((tk) =>
  StyleSheet.create({
    content: { paddingTop: space.sm, gap: space.xl },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: tk.colors.surface2,
    },
    input: { ...type.body, flex: 1, color: tk.colors.text, paddingVertical: 10 },
    group: { gap: space.sm },
    card: { gap: space.lg },
    term: { gap: 2 },
  }),
);
