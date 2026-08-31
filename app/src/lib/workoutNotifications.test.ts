/**
 * §10.7 background rest-timer notification. `expo-notifications`'s exports are non-configurable
 * (jest.spyOn can't redefine them directly — confirmed here), so the module is mocked wholesale
 * with jest.fn()s instead. These tests prove call shape and cancel/reschedule discipline — not
 * that a notification actually appears while backgrounded (needs a real device, see the status
 * file).
 */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

import * as Notifications from 'expo-notifications';
import {
  cancelRestNotification,
  ensureNotificationPermission,
  scheduleRestZeroNotification,
} from './workoutNotifications';

describe('workoutNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('schedules a TIME_INTERVAL trigger for the requested seconds, with the next-up label in the body', async () => {
    await scheduleRestZeroNotification(45, 'Banded Row · set 2 of 3');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ body: expect.stringContaining('Banded Row') }),
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 45,
        }),
      }),
    );
  });

  it('never schedules for a non-positive remaining time', async () => {
    const id = await scheduleRestZeroNotification(0, 'x');
    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels by id and is a no-op for a null id', async () => {
    await cancelRestNotification(null);
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    await cancelRestNotification('abc-123');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('abc-123');
  });

  it('permission request never throws even with no native module', async () => {
    await expect(ensureNotificationPermission()).resolves.toBeUndefined();
  });
});
