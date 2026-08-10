import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';

/** Global: auth is the only consumer today, but nothing about it is auth-specific. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
