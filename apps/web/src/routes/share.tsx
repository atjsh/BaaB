import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { HowToUse } from '../components/HowToUse';
import { DirectoryForm } from '../components/DirectoryForm';
import { ImageForm } from '../components/ImageForm';
import { QRCode } from '../components/QRCode';
import { SessionInfo } from '../components/SessionInfo';
import { useBaab } from '../hooks/useBaab';
import { useBaabServer } from '../hooks/useBaabServer';

const humanBps = (bps: number) => {
  if (!bps || bps < 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const idx = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), units.length - 1);
  const value = bps / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};

export const Route = createFileRoute('/share')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Set up your browser to share securely using BaaB',
      },
      {
        title: 'Share - BaaB',
      },
    ],
  }),
});

function RouteComponent() {
  const {
    vapidKeys,
    setVapidKeys,
    subscription,
    setSubscription,
    logs,
    addLog,
    ensureKeysAndSubscription,
    reset: resetBaab,
  } = useBaab();

  const {
    isServerStarted,
    isBroadcasting,
    assetMode,
    setAssetMode,
    assetText,
    setAssetText,
    setImageAsset,
    setDirectoryAsset,
    chunkConcurrency,
    chunkJitterMs,
    lastBroadcastBytes,
    lastBroadcastMs,
    updateChunkConcurrency,
    updateChunkJitterMs,
    startServer,
    registerAsset,
    resetServer,
  } = useBaabServer({
    vapidKeys,
    setVapidKeys,
    subscription,
    setSubscription,
    addLog,
    ensureKeysAndSubscription,
    resetBaab,
  });

  const [enlargeQr, setEnlargeQr] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);

  const shareLink =
    subscription && vapidKeys
      ? `${window.location.origin}/receive?connect=${encodeURIComponent(
          btoa(JSON.stringify({ subscription, vapidKeys })),
        )}`
      : '';

  const handleReset = async () => {
    await resetServer();
  };

  if (isServerStarted) {
    return (
      <main className="p-2 flex flex-col gap-4 mb-20 max-w-3xl">
        <SessionInfo />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Share</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Stop Sharing
          </button>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <h3 className="font-bold">Connection Info</h3>
          <p className="text-sm">Share the link or QR code to allow others to connect.</p>
          {shareLink && (
            <div className="flex flex-row gap-4 w-full flex-wrap">
              <div>
                <div
                  onClick={() => setEnlargeQr(!enlargeQr)}
                  className="cursor-pointer"
                  style={{ width: enlargeQr ? 300 : 150, height: enlargeQr ? 300 : 150 }}
                >
                  <QRCode value={shareLink} />
                </div>
                <p className="text-xs text-gray-500">Click QR code to {enlargeQr ? 'shrink' : 'enlarge'}</p>
              </div>

              <div className="flex flex-col gap-1 w-full max-w-md">
                <label className="text-xs font-bold">Share Link</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareLink}
                    className="border p-3 rounded text-xs flex-1 truncate"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink);
                      alert('Copied!');
                    }}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-xs whitespace-nowrap cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="font-bold">Broadcast Asset</h3>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="assetMode"
                value="text"
                checked={assetMode === 'text'}
                onChange={() => setAssetMode('text')}
              />
              Text
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="assetMode"
                value="image"
                checked={assetMode === 'image'}
                onChange={() => setAssetMode('image')}
              />
              Image
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="assetMode"
                value="directory"
                checked={assetMode === 'directory'}
                onChange={() => setAssetMode('directory')}
              />
              Folder
            </label>
          </div>

          {assetMode === 'text' ? (
            <textarea
              value={assetText}
              onChange={(e) => setAssetText(e.target.value)}
              className="w-full border px-2 py-1 rounded text-sm"
              rows={5}
              placeholder="Enter text to share..."
            />
          ) : assetMode === 'image' ? (
            <ImageForm setImageAsset={setImageAsset} />
          ) : (
            <DirectoryForm setDirectoryAsset={setDirectoryAsset} />
          )}

          <button
            onClick={registerAsset}
            disabled={isBroadcasting}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {isBroadcasting ? 'Broadcasting...' : 'Update & Broadcast'}
          </button>

          <div className="text-xs text-gray-600" aria-live="polite">
            {lastBroadcastBytes && lastBroadcastMs && (
              <span>{humanBps((lastBroadcastBytes / lastBroadcastMs) * 1000)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-bold">Delivery Tuning</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Chunk concurrency</span>
              <input
                type="number"
                min={1}
                max={5}
                value={chunkConcurrency}
                onChange={(e) => updateChunkConcurrency(Number(e.target.value) || 1)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Jitter per chunk (ms)</span>
              <input
                type="number"
                min={0}
                max={500}
                value={chunkJitterMs}
                onChange={(e) => updateChunkJitterMs(Number(e.target.value) || 0)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="p-2 flex flex-col gap-4 mb-20 max-w-3xl">
      <h2 className="text-xl font-bold">Share</h2>
      <HowToUse />
      <div className="flex flex-col gap-4">
        <p>Click "Start Sharing". You will get a link/QR code to share with others.</p>
        <button
          onClick={async () => {
            setIsStartingServer(true);
            await startServer();
            setIsStartingServer(false);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded w-fit disabled:opacity-50"
          disabled={isStartingServer}
        >
          Start Sharing
        </button>
      </div>
      <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </main>
  );
}
