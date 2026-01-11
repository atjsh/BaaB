import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { HowToUse } from '../components/HowToUse';
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
  staticData: {
    breadcrumb: 'Receive',
  },
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
  const [logs, setLogs] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState('');

  const { serverConfig, receivedAssets, connectionStatus, handleConnectData, resetClient } = useBaabClient({
    addLog: (msg: string) => {
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    },
  });

  useEffect(() => {
    if (search.connect && !serverConfig && connectionStatus === 'idle') {
      navigate({
        search: () => ({ connect: undefined }),
      });
      handleConnectData(search.connect);
    }
  }, [connectionStatus, handleConnectData, search.connect, serverConfig]);

  const handleReset = async () => {
    await resetClient();
  };

  const handleSubmitInviteLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteLink.trim()) return;

    try {
      // Try to parse as a full URL first
      const url = new URL(inviteLink.trim());
      const connectParam = url.searchParams.get('connect');
      
      if (connectParam) {
        // If it's a valid URL with a connect parameter, use that
        await handleConnectData(connectParam);
        setInviteLink('');
      } else {
        // If URL doesn't have connect param, show error
        addLog('Invalid invite link: URL must contain a connect parameter');
      }
    } catch (error) {
      // If it's not a valid URL, treat it as raw connect data
      addLog('Input is not a valid URL, attempting to use as raw connect data');
      await handleConnectData(inviteLink.trim());
      setInviteLink('');
    }
  };

  if (connectionStatus === 'connected') {
    return (
      <main className="p-5 flex flex-col gap-4 mb-20 max-w-3xl">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Receive</h2>
          <button onClick={handleReset} className="text-red-500 text-sm underline">
            Stop Receiving
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Received Assets</h3>
          {receivedAssets.length === 0 ? (
            <p>No assets received yet. Waiting for server...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {receivedAssets.map((asset, i) => {
                // if (asset.type === 'directory') {
                //   const downloadName = `asset-${i + 1}.zip`;
                //   const href = asset.content.startsWith('data:')
                //     ? asset.content
                //     : `data:application/zip;base64,${asset.content}`;
                //   const manifest = asset.manifest || [];
                //   const listed = manifest.slice(0, 8);
                //   const remaining = manifest.length - listed.length;

                //   return (
                //     <div key={i} className="border p-4 rounded bg-white flex flex-col gap-3">
                //       <div className="flex justify-between items-center">
                //         <div className="font-semibold">{asset.directoryName || 'Shared folder'}</div>
                //         <div className="text-xs text-gray-500">
                //           {manifest.length} files · {formatBytes(asset.totalBytes)}
                //         </div>
                //       </div>
                //       <div className="border rounded bg-gray-50 p-2 max-h-32 overflow-y-auto flex flex-col gap-1 text-xs text-gray-700">
                //         {listed.map((entry, idx) => (
                //           <div key={idx} className="flex justify-between gap-2">
                //             <span className="truncate" title={entry.path}>
                //               {entry.path}
                //             </span>
                //             <span className="text-gray-500 whitespace-nowrap">{formatBytes(entry.size)}</span>
                //           </div>
                //         ))}
                //         {remaining > 0 && <div className="text-gray-500">+ {remaining} more files</div>}
                //       </div>
                //       <div className="flex justify-end">
                //         <a
                //           href={href}
                //           download={downloadName}
                //           className="text-xs bg-blue-500 text-white px-3 py-1 rounded"
                //         >
                //           Download zip
                //         </a>
                //       </div>
                //     </div>
                //   );
                // }

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
                    className="border p-4 rounded bg-white whitespace-pre-wrap break-all flex flex-col gap-2"
                  >
                    <div>{previewText}</div>
                    <div className="flex justify-end">
                      <a href={href} download={downloadName} className="text-xs text-blue-600 underline">
                        Download
                      </a>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="border p-4 rounded bg-white flex flex-col gap-2">
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
        <div className="logs mt-4 p-2 bg-gray-200 rounded text-xs font-mono h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className=" p-5 flex flex-col gap-4 mb-20 max-w-3xl">
      <h2 className="text-xl font-bold">Receive</h2>
      <HowToUse />

      {connectionStatus === 'idle' && (
        <div className="bg-white border rounded p-4 flex flex-col gap-3">
          <h3 className="font-bold">Connect using invite link</h3>
          <p className="text-sm text-gray-600">
            Paste the invite link you received from the sender, or enter the connect code directly.
          </p>
          <form onSubmit={handleSubmitInviteLink} className="flex flex-col gap-2">
            <input
              type="text"
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              placeholder="Paste invite link here..."
              className="border rounded px-3 py-2 w-full"
            />
            <button
              type="submit"
              disabled={!inviteLink.trim()}
              className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </form>
        </div>
      )}

      {connectionStatus === 'connecting' && <p>Connecting to the server...</p>}

      <div className="logs mt-4 p-2 bg-gray-200 rounded text-xs font-mono h-40 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </main>
  );
}
