import { chat } from '@baab/shared';

import { QRCode } from './QRCode';

interface InviteLinkSectionProps {
  inviteLink: string;
  enlargeQr: boolean;
  onToggleQr: () => void;
}

export function InviteLinkSection({ inviteLink, enlargeQr, onToggleQr }: InviteLinkSectionProps) {
  return (
    <div className="border-b p-4 bg-yellow-50">
      <p className="text-sm font-medium mb-2">Share this link to start chatting:</p>
      <div className="flex flex-row gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold mb-1">Scan QR code</p>
          <div
            onClick={onToggleQr}
            className="cursor-pointer"
            style={{ width: enlargeQr ? 200 : 100, height: enlargeQr ? 200 : 100 }}
          >
            <QRCode value={inviteLink} />
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="text-xs font-bold">Or copy link:</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              className="border p-2 rounded text-xs flex-1 truncate"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteLink);
                alert('Link copied!');
              }}
              className="bg-blue-500 text-white px-3 py-1 rounded text-xs whitespace-nowrap"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConnectionStatusBannerProps {
  status: chat.ConversationStatus;
  connectionStatus?: 'idle' | 'connecting' | 'connected';
  onRetry?: () => void;
}

export function ConnectionStatusBanner({ status, connectionStatus, onRetry }: ConnectionStatusBannerProps) {
  if (connectionStatus === 'connecting') {
    return (
      <div className="border-b p-4 bg-yellow-50">
        <p className="text-sm">Connecting to host...</p>
      </div>
    );
  }

  if (status === chat.ConversationStatus.UNAVAILABLE) {
    return (
      <div className="border-b p-4 bg-red-50">
        <p className="text-sm text-red-700 mb-2">Unable to reach the other party. They may be offline.</p>
        {onRetry && (
          <button onClick={onRetry} className="text-xs bg-red-500 text-white px-3 py-1 rounded">
            Try Again
          </button>
        )}
      </div>
    );
  }

  return null;
}

interface DebugLogsProps {
  logs: string[];
  maxLogs?: number;
}

export function DebugLogs({ logs, maxLogs = 20 }: DebugLogsProps) {
  if (logs.length === 0) return null;

  return (
    <div className="border-t p-2 bg-gray-200 text-xs font-mono h-24 overflow-y-auto">
      {logs.slice(0, maxLogs).map((log, i) => (
        <div key={i} className="text-gray-600">
          {log}
        </div>
      ))}
    </div>
  );
}
