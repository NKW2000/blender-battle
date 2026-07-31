import { Module } from '@nestjs/common';

import { CloudinaryService } from './cloudinary.service';

/**
 * Phase 2 will add challenge reference images/files here. Kept as its own module
 * from Phase 1 so that work is an addition, not a refactor of the users module.
 */
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class UploadsModule {}
