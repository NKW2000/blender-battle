import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiErrorCode,
  CHALLENGE_MAX_ASSETS,
  ChallengeAssetType,
  type ChallengeDetail,
} from '@bb/shared';
import { Repository } from 'typeorm';

import { AppException } from '@/common/exceptions/app.exception';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { CloudinaryService } from '@/modules/uploads/cloudinary.service';

import { ChallengesService } from './challenges.service';
import { ChallengeAsset } from './entities/challenge-asset.entity';

@Injectable()
export class ChallengeAssetsService {
  constructor(
    @InjectRepository(ChallengeAsset)
    private readonly assets: Repository<ChallengeAsset>,
    private readonly challenges: ChallengesService,
    private readonly uploads: CloudinaryService,
  ) {}

  async add(
    challengeId: string,
    file: Express.Multer.File,
    type: ChallengeAssetType,
    actor: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    const challenge = await this.challenges.findEntityOrFail(challengeId);
    this.challenges.assertCanEdit(challenge, actor);

    const existing = await this.assets.countBy({ challengeId });
    if (existing >= CHALLENGE_MAX_ASSETS) {
      throw new AppException(
        ApiErrorCode.UPLOAD_FAILED,
        `A challenge can hold at most ${CHALLENGE_MAX_ASSETS} attachments. Remove one first.`,
        409,
      );
    }

    const uploaded = await this.uploads.uploadChallengeAsset(file, challengeId, type);

    await this.assets.save(
      this.assets.create({
        challengeId,
        type,
        url: uploaded.url,
        publicId: uploaded.publicId,
        filename: uploaded.filename,
        bytes: uploaded.bytes,
        mimeType: uploaded.mimeType,
        // Appended last; managers reorder by re-uploading, which is rare enough
        // not to justify a drag-and-drop ordering endpoint in this phase.
        sortOrder: existing,
      }),
    );

    return this.challenges.findById(challengeId);
  }

  async remove(
    challengeId: string,
    assetId: string,
    actor: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    const challenge = await this.challenges.findEntityOrFail(challengeId);
    this.challenges.assertCanEdit(challenge, actor);

    // Scoped by challengeId as well as id, so an asset id from another challenge
    // cannot be deleted by someone who happens to own this one.
    const asset = await this.assets.findOne({ where: { id: assetId, challengeId } });
    if (!asset) throw AppException.notFound('Attachment');

    await this.assets.delete({ id: asset.id });

    // Remote cleanup after the row is gone: a failure here costs storage, while
    // the reverse order could leave a row pointing at a destroyed asset.
    await this.uploads.destroy(
      asset.publicId,
      asset.type === ChallengeAssetType.REFERENCE_IMAGE ? 'image' : 'raw',
    );

    return this.challenges.findById(challengeId);
  }
}
