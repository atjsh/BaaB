import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { HowToUse } from '../components/HowToUse';
import { SessionInfo } from '../components/SessionInfo';
import { useBaab } from '../hooks/useBaab';
import { useBaabClient } from '../hooks/useBaabClient';

type ReceiveRouteSearch = {
  connect?: string;
};

export const Route = createFileRoute('/receive')({
  component: Receive,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Receive assets via peer-to-peer connection',
      },
      {
        title: 'Receive - BaaB',
      },
    ],
  }),
  validateSearch: (search) => {
    const res: ReceiveRouteSearch = {};
    if ('connect' in search && typeof search.connect === 'string' && search.connect.length > 0) {
      res.connect = String(search.connect);
    }
    return res;
  },
});

function Receive() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
    serverConfig,
    receivedAssets,
    connectionStatus,
    handleConnectData,
    resetClient,
    lastReceiveBytes,
    lastReceiveMs,
  } = useBaabClient({
    vapidKeys,
    setVapidKeys,
    subscription,
    setSubscription,
    addLog,
    ensureKeysAndSubscription,
    resetBaab,
  });

  // Handle search param (guarded against double render)
  useEffect(() => {
    if (search.connect && !serverConfig && connectionStatus === 'idle') {
      navigate({
        search: () => ({ connect: undefined }),
      });
      handleConnectData(search.connect);
    }
  }, [connectionStatus, handleConnectData, search.connect, serverConfig]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const urlStr = formData.get('serverUrl') as string;

    try {
      const url = new URL(urlStr);
      const connectData = url.searchParams.get('connect');
      if (connectData) {
        handleConnectData(connectData);
      } else {
        addLog('Invalid URL: missing connect parameter');
      }
    } catch (e) {
      addLog('Invalid URL format');
    }
  };

  const handleReset = async () => {
    await resetClient();
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
  };

  const humanBps = (bps: number) => {
    if (!bps || bps < 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const idx = Math.min(Math.floor(Math.log(bps) / Math.log(1024)), units.length - 1);
    const value = bps / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
  };

  if (connectionStatus === 'connected') {
    return (
      <main className="p-2 flex flex-col gap-4 mb-20 max-w-3xl">
        <SessionInfo />
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Receive</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Stop Receiving
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Received Assets</h3>
          <div className="text-xs text-gray-600" aria-live="polite">
            {lastReceiveBytes && lastReceiveMs && (
              <span>
                Speed meter: last receive {formatBytes(lastReceiveBytes)} in {lastReceiveMs.toFixed(0)} ms (~
                {humanBps((lastReceiveBytes / lastReceiveMs) * 1000)}).
              </span>
            )}
          </div>
          {receivedAssets.length === 0 ? (
            <p>No assets received yet. Waiting for server...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {receivedAssets.map((asset, i) => {
                if (asset.type === 'directory') {
                  const downloadName = `asset-${i + 1}.zip`;
                  const href = asset.content.startsWith('data:')
                    ? asset.content
                    : `data:application/zip;base64,${asset.content}`;
                  const manifest = asset.manifest || [];
                  const listed = manifest.slice(0, 8);
                  const remaining = manifest.length - listed.length;

                  return (
                    <div key={i} className="border p-4 rounded bg-white shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div className="font-semibold">{asset.directoryName || 'Shared folder'}</div>
                        <div className="text-xs text-gray-500">
                          {manifest.length} files · {formatBytes(asset.totalBytes)}
                        </div>
                      </div>
                      <div className="border rounded bg-gray-50 p-2 max-h-32 overflow-y-auto flex flex-col gap-1 text-xs text-gray-700">
                        {listed.map((entry, idx) => (
                          <div key={idx} className="flex justify-between gap-2">
                            <span className="truncate" title={entry.path}>
                              {entry.path}
                            </span>
                            <span className="text-gray-500 whitespace-nowrap">{formatBytes(entry.size)}</span>
                          </div>
                        ))}
                        {remaining > 0 && <div className="text-gray-500">+ {remaining} more files</div>}
                      </div>
                      <div className="flex justify-end">
                        <a
                          href={href}
                          download={downloadName}
                          className="text-xs bg-blue-500 text-white px-3 py-1 rounded"
                        >
                          Download zip
                        </a>
                      </div>
                    </div>
                  );
                }

                const downloadName = `asset-${i + 1}.${asset.type === 'text' ? 'txt' : 'webp'}`;
                const href =
                  asset.type === 'text'
                    ? `data:text/plain;charset=utf-8,${encodeURIComponent(asset.content)}`
                    : asset.content;

                const MAX_PREVIEW_CHARS = 600;
                const isLongText = asset.type === 'text' && asset.content.length > MAX_PREVIEW_CHARS;
                const previewText =
                  asset.type === 'text'
                    ? isLongText
                      ? `${asset.content.slice(0, MAX_PREVIEW_CHARS)}\n…\n(${asset.content.length - MAX_PREVIEW_CHARS} more chars)`
                      : asset.content
                    : '';

                return asset.type === 'text' ? (
                  <div
                    key={i}
                    className="border p-4 rounded bg-white shadow-sm whitespace-pre-wrap break-all flex flex-col gap-2"
                  >
                    <div>{previewText}</div>
                    <div className="flex justify-end">
                      <a href={href} download={downloadName} className="text-xs text-blue-600 underline">
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="border p-4 rounded bg-white shadow-sm flex flex-col gap-2">
                    <img src={asset.content} alt={`Received asset ${i + 1}`} className="max-w-full h-auto" />
                    <div className="flex justify-end">
                      <a href={href} download={downloadName} className="text-xs text-blue-600 underline">
                        Download
                      </a>
                    </div>
                  </div>
                );
              })}
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
    <main className=" p-2 flex flex-col gap-4 mb-20 max-w-3xl">
      <h2 className="text-xl font-bold">Receive</h2>
      <HowToUse />

      <form className=" flex flex-col gap-10 max-w-md " onSubmit={handleFormSubmit}>
        <div className=" flex flex-col gap-1 ">
          <label htmlFor="serverUrl">
            <span className=" font-bold">Enter the link</span>
            <p className=" text-sm block">
              To get started, paste the link.
              <br />
              If you don't have one, ask the sharer for one. <br />
              Sharer could send you the URL via chat, email, etc.
            </p>
          </label>

          <textarea
            id="serverUrl"
            name="serverUrl"
            required
            placeholder="https://baab.atj.sh/receive/?connect=eyJ..."
            className="w-full border px-2 py-1 rounded text-xs resize-none"
            rows={20}
          />
          <p className=" text-sm block">Only paste URL from trusted sources.</p>
        </div>

        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded block w-fit disabled:opacity-50"
          disabled={connectionStatus === 'connecting'}
        >
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      </form>

      <div className="logs mt-4 p-2 bg-gray-100 rounded text-xs font-mono h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </main>
  );
}
