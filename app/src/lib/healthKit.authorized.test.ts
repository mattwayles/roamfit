/**
 * Track 37m — with the native module present: the first write of a launch asks for write access
 * itself (the in-memory flag resets every launch, which used to drop every workout queued before a
 * relaunch), then saves the workout; only write ("toShare") access is ever requested.
 */
const mockRequestAuthorization = jest.fn(async () => true);
const mockSaveWorkoutSample = jest.fn(async () => undefined);
jest.mock(
  '@kingstinct/react-native-healthkit',
  () => ({
    isHealthDataAvailable: jest.fn(async () => true),
    requestAuthorization: mockRequestAuthorization,
    saveWorkoutSample: mockSaveWorkoutSample,
    WorkoutActivityType: { functionalStrengthTraining: 20 },
  }),
  { virtual: true },
);

import { healthKitWriter } from './healthKit';

it('the first write of a launch requests write-only access, then saves the workout', async () => {
  await healthKitWriter.writeWorkout({
    startedAt: '2026-10-18T09:00:00.000Z',
    durationSec: 1800,
    activeEnergyKcal: 150,
  });
  expect(mockRequestAuthorization).toHaveBeenCalledTimes(1);
  expect(mockRequestAuthorization).toHaveBeenCalledWith({
    toShare: ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierActiveEnergyBurned'],
  });
  expect(mockSaveWorkoutSample).toHaveBeenCalledTimes(1);
  const [, , start, end] = mockSaveWorkoutSample.mock.calls[0] as unknown as [
    unknown,
    unknown,
    Date,
    Date,
  ];
  expect(end.getTime() - start.getTime()).toBe(1800 * 1000);

  // Later writes in the same launch don't ask again.
  await healthKitWriter.writeWorkout({
    startedAt: '2026-10-19T09:00:00.000Z',
    durationSec: 600,
    activeEnergyKcal: 50,
  });
  expect(mockRequestAuthorization).toHaveBeenCalledTimes(1);
  expect(mockSaveWorkoutSample).toHaveBeenCalledTimes(2);
});
