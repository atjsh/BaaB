import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { share } from '@baab/shared';

import { HowToUse } from '../components/HowToUse';
import { ImageForm } from '../components/ImageForm';
import { QRCode } from '../components/QRCode';
import { SessionInfo } from '../components/SessionInfo';
import { useBaabServer } from '../hooks/useBaabServer';

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
  const [logs, setLogs] = useState<string[]>([]);

  const {
    isServerStarted,
    isBroadcasting,
    assetMode,
    setAssetMode,
    assetText,
    setAssetText,
    setImageAsset,
    startServer,
    registerAsset,
    resetServer,
    localPushSendOption,
  } = useBaabServer({
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  const [enlargeQr, setEnlargeQr] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);

  const shareLink = localPushSendOption
    ? `${window.location.origin}/receive?connect=${encodeURIComponent(
        btoa(
          JSON.stringify({
            ...localPushSendOption,
            type: 'remote',
          } satisfies share.ShareRemotePushSendOptions),
        ),
      )}`
    : '';

  const handleReset = async () => {
    await resetServer();
  };

  if (isServerStarted) {
    return (
      <main className="p-5 flex flex-col gap-4 mb-20 max-w-3xl">
        <SessionInfo />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Share</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Stop Sharing
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="font-bold">Upload</h3>
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
            <></>
          )}

          <button
            onClick={registerAsset}
            disabled={isBroadcasting}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {isBroadcasting ? 'Sharing...' : 'Share'}
          </button>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <h3 className="font-bold">Download</h3>
          {shareLink && (
            <div className="flex flex-row gap-4 w-full flex-wrap">
              <div>
                <p className="text-xs font-bold">Scan QR code to download</p>
                <div
                  onClick={() => setEnlargeQr(!enlargeQr)}
                  className="cursor-pointer"
                  style={{ width: enlargeQr ? 300 : 150, height: enlargeQr ? 300 : 150 }}
                >
                  <QRCode value={shareLink} />
                </div>
              </div>

              <div className="flex flex-col gap-1 w-full max-w-md">
                <label className="text-xs font-bold">Or, Open this link to download:</label>
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
                      alert('Link copied! Paste and send the link to others, so they can join the session.');
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

        <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="p-5 flex flex-col gap-4 mb-20 max-w-3xl">
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
