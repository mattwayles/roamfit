/**
 * Track 37i — the user's bands: which of B1-B5 they own, what each is called and what colour it is,
 * and whether they stack two for more tension than their heaviest. Shared by Settings → Your bands
 * and onboarding's bands step. Every change saves at once through the caller.
 *
 * Colour is the band's identity mid-set (see `BandChip`), so each band offers a short palette of
 * common loop-band colours rather than a free colour picker; the label is free text, so a band can
 * be named whatever is printed on it.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SINGLE_BANDS } from '@roamfit/engine';
import type { BandSettings, SingleBandId } from '@roamfit/engine';
import type { BandTension } from '@roamfit/store';
import { makeStyles, radius, space, type, useTheme } from '../theme';
import { Icon, Txt, haptics } from '../ui';
import { textToneOn } from './BandChip';
import { CheckRow, Group, SwitchRow } from './SettingsList';

/** Common loop-band colours, lightest-feeling to darkest. */
export const BAND_PALETTE: readonly { name: string; color: string }[] = [
  { name: 'Yellow', color: '#facc15' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Red', color: '#dc2626' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Purple', color: '#7c3aed' },
  { name: 'Blue', color: '#2563eb' },
  { name: 'Green', color: '#16a34a' },
  { name: 'Grey', color: '#9ca3af' },
  { name: 'Black', color: '#1f2937' },
];

const LIGHTEST_TO_HEAVIEST = ['lightest', 'light', 'medium', 'heavy', 'heaviest'];

export const BANDS_CAPTION =
  'B1 is your lightest band and B5 your heaviest. Untick any you do not have and Wanderlift will ' +
  'only ever hand you bands you own.';

export const STACKING_CAPTION =
  'Once your heaviest band is no longer enough, use it together with a lighter one for more ' +
  'tension. Hold or anchor both bands side by side, so they stretch as one.';

export function BandSetup({
  settings,
  tensions,
  onChangeSettings,
  onChangeTension,
}: {
  settings: BandSettings;
  tensions: Record<SingleBandId, BandTension>;
  onChangeSettings: (patch: Partial<BandSettings>) => void;
  onChangeTension: (
    band: SingleBandId,
    patch: Partial<Pick<BandTension, 'label' | 'color'>>,
  ) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState<SingleBandId | null>(null);
  const toggleOwned = (band: SingleBandId) =>
    onChangeSettings({
      owned: settings.owned.includes(band)
        ? settings.owned.filter((b) => b !== band)
        : SINGLE_BANDS.filter((b) => b === band || settings.owned.includes(b)),
    });

  return (
    <>
      <Group title="Bands you own" caption={BANDS_CAPTION}>
        {SINGLE_BANDS.map((band, i) => (
          <View key={band}>
            <CheckRow
              testID={`band-owned-${band}`}
              label={`${band} · ${tensions[band].label === band ? LIGHTEST_TO_HEAVIEST[i] : tensions[band].label}`}
              description={editing === band ? undefined : 'Tap the colour to rename or recolour'}
              checked={settings.owned.includes(band)}
              onPress={() => toggleOwned(band)}
            />
            <BandEditor
              band={band}
              tension={tensions[band]}
              open={editing === band}
              onToggle={() => setEditing(editing === band ? null : band)}
              onChange={(patch) => onChangeTension(band, patch)}
            />
          </View>
        ))}
      </Group>
      {settings.owned.length === 0 ? (
        <Txt variant="small" color="text2" testID="bands-none-note">
          No bands? No problem: every workout will use bodyweight exercises only.
        </Txt>
      ) : null}
      <Group title="Stacking" caption={STACKING_CAPTION}>
        <SwitchRow
          testID="toggle-band-stacking"
          icon="trendingUp"
          tone="gold"
          label="Stack bands above B5"
          value={settings.stacking}
          onValueChange={(stacking) => onChangeSettings({ stacking })}
        />
      </Group>
      {settings.stacking && !settings.owned.includes('B5') ? (
        <Txt variant="small" color="text2" testID="bands-stacking-note">
          Stacking pairs your B5 with a lighter band, so it starts once you own a B5.
        </Txt>
      ) : null}
    </>
  );
}

function BandEditor({
  band,
  tension,
  open,
  onToggle,
  onChange,
}: {
  band: SingleBandId;
  tension: BandTension;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Pick<BandTension, 'label' | 'color'>>) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const [label, setLabel] = useState(tension.label);
  return (
    <View style={styles.editor}>
      <Pressable
        testID={`band-edit-${band}`}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${band}, currently ${tension.label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        style={[styles.swatch, { backgroundColor: tension.color }]}
        hitSlop={8}
      >
        <Txt variant="eyebrow" color={textToneOn(tension.color)}>
          {tension.label}
        </Txt>
        <Icon name="edit" size={14} color={textToneOn(tension.color)} />
      </Pressable>
      {open ? (
        <View style={styles.editorBody} testID={`band-editor-${band}`}>
          <TextInput
            testID={`band-label-${band}`}
            accessibilityLabel={`Name for ${band}`}
            style={styles.input}
            value={label}
            maxLength={16}
            onChangeText={setLabel}
            onEndEditing={() => onChange({ label: label.trim() || band })}
            onSubmitEditing={() => onChange({ label: label.trim() || band })}
            returnKeyType="done"
            placeholder={band}
            placeholderTextColor={theme.colors.text3}
            keyboardAppearance={theme.scheme}
          />
          <View style={styles.palette} accessibilityRole="radiogroup">
            {BAND_PALETTE.map((c) => {
              const selected = c.color.toLowerCase() === tension.color.toLowerCase();
              return (
                <Pressable
                  key={c.color}
                  testID={`band-color-${band}-${c.name}`}
                  accessibilityRole="radio"
                  accessibilityLabel={c.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    haptics.selection();
                    onChange({ color: c.color });
                  }}
                  style={[
                    styles.paletteSwatch,
                    { backgroundColor: c.color },
                    selected && styles.paletteSelected,
                  ]}
                >
                  {selected ? <Icon name="check" size={16} color={textToneOn(c.color)} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((tk) =>
  StyleSheet.create({
    editor: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
    swatch: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xs,
      minHeight: 44,
      minWidth: 88,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tk.colors.lineStrong,
    },
    editorBody: { gap: space.md },
    input: {
      ...type.body,
      color: tk.colors.text,
      minHeight: 44,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      backgroundColor: tk.colors.surface2,
    },
    palette: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    paletteSwatch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: tk.colors.lineStrong,
    },
    paletteSelected: { borderWidth: 3, borderColor: tk.colors.text },
  }),
);
