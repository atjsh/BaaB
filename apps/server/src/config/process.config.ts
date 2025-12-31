import { registerAs } from '@nestjs/config';

import { expectPropertyExists } from '../typescript/expect';

export const ProcessConfigFactory = registerAs(
  Symbol.for('process-config'),
  () =>
    ({
      port: expectPropertyExists(process.env, 'PORT'),
      webOrigin: expectPropertyExists(process.env, 'WEB_ORIGIN').split(','),
    }) as const,
);

export type ProcessConfig = ReturnType<typeof ProcessConfigFactory>;
export const ProcessConfig = ProcessConfigFactory.KEY;
