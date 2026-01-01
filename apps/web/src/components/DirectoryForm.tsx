import JSZip from 'jszip';
import { useState } from 'react';
import type { DirectoryManifestEntry } from '@baab/shared';
import type { DirectoryAsset } from '../types/assets';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};

export function DirectoryForm({ setDirectoryAsset }: { setDirectoryAsset: (asset: DirectoryAsset | null) => void }) {
  const [manifest, setManifest] = useState<DirectoryManifestEntry[]>([]);
  const [directoryName, setDirectoryName] = useState('');
  const [totalBytes, setTotalBytes] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    setError('');
    if (!files || files.length === 0) {
      setManifest([]);
      setDirectoryAsset(null);
      setStatus('');
      setDirectoryName('');
      setTotalBytes(0);
      return;
    }

    const fileArr = Array.from(files);
    const relativePaths = fileArr.map((f) => f.webkitRelativePath || f.name);
    const guessedRoot = relativePaths[0]?.split('/')[0] || 'shared-folder';
    const newManifest: DirectoryManifestEntry[] = fileArr.map((f, idx) => ({
      path: relativePaths[idx],
      size: f.size,
    }));
    const bytes = fileArr.reduce((acc, f) => acc + f.size, 0);

    setStatus('Zipping folder...');
    try {
      const zip = new JSZip();
      fileArr.forEach((file, idx) => {
        const path = relativePaths[idx];
        zip.file(path, file);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(zipBlob);
      });

      const asset: DirectoryAsset = {
        zipDataUrl: dataUrl,
        manifest: newManifest,
        directoryName: guessedRoot,
        totalBytes: bytes,
        fileCount: fileArr.length,
      };

      setManifest(newManifest);
      setDirectoryName(guessedRoot);
      setTotalBytes(bytes);
      setDirectoryAsset(asset);
      setStatus(`Ready to send ${fileArr.length} files (${formatBytes(bytes)})`);
    } catch (e: any) {
      console.error(e);
      setError('Failed to zip folder');
      setStatus('');
      setDirectoryAsset(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label htmlFor="directoryUpload" className="font-bold text-sm">
          Upload Folder
        </label>
      </div>

      <label
        htmlFor="directoryUpload"
        className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="font-semibold">Click to choose a folder</span>
        </div>
        <input
          id="directoryUpload"
          className="hidden"
          type="file"
          //@ts-expect-error webkitdirectory is non-standard but supported in modern browsers
          webkitdirectory="true"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {(status || error) && (
        <div className={`text-xs ${error ? 'text-red-600' : 'text-gray-600'}`}>{error || status}</div>
      )}

      {manifest.length > 0 && (
        <div className="bg-white border rounded-lg p-3 shadow-sm text-xs text-gray-700 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{directoryName}</div>
            <div className="text-gray-500">
              {manifest.length} files · {formatBytes(totalBytes)}
            </div>
          </div>
          <div className="border-t pt-2 flex flex-col gap-1 max-h-32 overflow-y-auto">
            {manifest.slice(0, 8).map((entry, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <span className="truncate" title={entry.path}>
                  {entry.path}
                </span>
                <span className="text-gray-500 whitespace-nowrap">{formatBytes(entry.size)}</span>
              </div>
            ))}
            {manifest.length > 8 && <div className="text-gray-500">+ {manifest.length - 8} more files</div>}
          </div>
        </div>
      )}
    </div>
  );
}
