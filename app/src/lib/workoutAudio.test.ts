/**
 * §10.8 audio+haptics surface. As documented in workoutAudio.ts's file header, `expo-audio`
 * cannot even be imported under Jest (no native module — confirmed by probing it directly), so
 * this suite proves the honest bar for a Jest environment: every exported function is safe to
 * call (never throws) when the native module is absent, and the right no-op path is taken. It
 * does NOT prove a tone actually plays or sounds distinct — that needs a real device (see the
 * status file).
 */
import * as Haptics from 'expo-haptics';
import {
  configureWorkoutAudioSession,
  cueCompletion,
  cueCount,
  cueHalfway,
  cueRestZero,
  cueStart,
} from './workoutAudio';

describe('workoutAudio', () => {
  it('configureWorkoutAudioSession never throws even without a real expo-audio native module', async () => {
    await expect(configureWorkoutAudioSession(false)).resolves.toBeUndefined();
    await expect(configureWorkoutAudioSession(true)).resolves.toBeUndefined();
  });

  it('every cue helper is safe to call with no native audio module present', () => {
    expect(() => cueCount()).not.toThrow();
    expect(() => cueHalfway()).not.toThrow();
    expect(() => cueStart()).not.toThrow();
    expect(() => cueCompletion()).not.toThrow();
    expect(() => cueRestZero()).not.toThrow();
  });

  it('cueCompletion fires a success-notification haptic (the info a muted user still gets)', () => {
    const spy = jest.spyOn(Haptics, 'notificationAsync');
    cueCompletion();
    expect(spy).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    spy.mockRestore();
  });

  it('cueCount fires a light impact haptic on every tick', () => {
    const spy = jest.spyOn(Haptics, 'impactAsync');
    cueCount();
    expect(spy).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    spy.mockRestore();
  });
});
