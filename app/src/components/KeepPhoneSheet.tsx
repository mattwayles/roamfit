import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Button, Sheet, Txt } from '../ui';

/**
 * Track 43 — the confirm behind "Start fresh" / "Keep this phone's data". Choosing this phone lets
 * it replace the iCloud backup at the next backup, so the consequence is said before it is
 * committed. The safe choice (keep the backup) is the loud one, and there is no red.
 */
export function KeepPhoneSheet({
  visible,
  onClose,
  onConfirm,
  title,
  confirmLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Sheet testID="keep-phone-sheet" visible={visible} onClose={onClose} title={title}>
      <Txt variant="small" color="text2" style={styles.body}>
        Your iCloud backup will be replaced the next time Wanderlift backs up.
      </Txt>
      <View style={styles.buttons}>
        <Button testID="keep-phone-cancel" label="Keep my backup" onPress={onClose} />
        <Button
          testID="keep-phone-confirm"
          label={confirmLabel}
          variant="secondary"
          size="md"
          fullWidth
          onPress={onConfirm}
        />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    body: { marginBottom: space.xl },
    buttons: { gap: space.md },
  }),
);
