import { requireNativeModule } from 'expo-modules-core';

import type { BackupStat, BackupWhich } from '../index';

/** The raw native surface (ios/ICloudBackupModule.swift). App code uses the typed `index.ts`. */
export interface ICloudBackupNative {
  isAvailable(): Promise<boolean>;
  upload(localPath: string): Promise<void>;
  download(toPath: string, which?: BackupWhich): Promise<boolean>;
  stat(which?: BackupWhich): Promise<BackupStat | null>;
}

// Under Jest this whole file is replaced by ./__mocks__/ICloudBackupModule.ts (see jest.setup.js),
// so the native lookup below only ever runs in a real dev-client / release build.
export default requireNativeModule<ICloudBackupNative>('ICloudBackup');
