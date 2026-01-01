import type { DirectoryManifestEntry } from '@baab/shared';

export type DirectoryAsset = {
  zipDataUrl: string;
  manifest: DirectoryManifestEntry[];
  directoryName: string;
  totalBytes: number;
  fileCount: number;
};
