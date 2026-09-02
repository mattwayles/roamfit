/**
 * @roamfit/store — SQLite persistence + session lifecycle (§4.3-4.7, §8, §9.1/9.3/9.9,
 * §10.10, §11.1/11.3, §12). See ADR 0003 for the package's driver-agnostic design.
 */
export * from './db';
export * from './ids';
export * from './dates';
export * from './migrate';
export * from './generation';
export * from './completion';
export * from './levelUp';
export * from './llmQueueWorker';
export * from './deviceQueueWorker';
export * from './sync/lastWriteWins';
export * from './sync/firestoreSyncClient';
export * from './sync/firestoreSyncWorker';

export * as usersRepo from './repositories/users';
export * as exerciseStateRepo from './repositories/exerciseState';
export * as progressionStateRepo from './repositories/progressionState';
export * as sessionsRepo from './repositories/sessions';
export * as signalsRepo from './repositories/signals';
export * as milestonesRepo from './repositories/milestones';
export * as statsRepo from './repositories/stats';
export * as queuesRepo from './repositories/queues';
export * as remoteConfigRepo from './repositories/remoteConfig';
export * as syncCursorRepo from './repositories/syncCursor';
export * as instrumentationRepo from './repositories/instrumentation';
