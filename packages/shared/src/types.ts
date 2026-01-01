export type VapidKeys = { publicKey: string; privateKey: string };
export type RemoteConfig = { subscription: PushSubscriptionJSON; vapidKeys: VapidKeys };
export type DirectoryManifestEntry = { path: string; size: number };
export type MessagePayload = {
  type: 'HANDSHAKE' | 'ASSET' | 'ACK' | 'CHUNK';
  senderConfig?: RemoteConfig;
  asset?: string;
  assetMode?: 'text' | 'image' | 'directory';
  manifest?: DirectoryManifestEntry[];
  directoryName?: string;
  totalBytes?: number;
  fileCount?: number;
  id?: string;
  index?: number;
  total?: number;
  data?: string;
};
