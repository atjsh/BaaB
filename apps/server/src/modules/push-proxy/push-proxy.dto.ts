import { IsObject, IsOptional, IsUrl } from 'class-validator';

export class SendPushNotificationReqBody {
  @IsUrl()
  endpoint: string;

  @IsOptional()
  body?: Record<string, any> | string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
