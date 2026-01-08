/**
 * Type definitions for Web Push
 */

export type PushMessage<T = any> = {
  data: T;
  options?: {
    ttl?: number;
    topic?: string;
    urgency?: 'low' | 'normal' | 'high';
  };
};

export type PushSubscription = {
  endpoint: string;
  /** DOMHighResTimeStamp */
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export type VapidKeys = {
  subject: string | undefined;
  publicKey: string | undefined;
  privateKey: string | undefined;
};
