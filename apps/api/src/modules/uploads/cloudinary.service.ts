import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AVATAR_ALLOWED_MIME,
  AVATAR_MAX_BYTES,
  CHALLENGE_ASSET_MAX_BYTES,
  CHALLENGE_FILE_ALLOWED_MIME,
  CHALLENGE_IMAGE_ALLOWED_MIME,
  ChallengeAssetType,
  SUBMISSION_IMAGE_ALLOWED_MIME,
  SUBMISSION_IMAGE_MAX_BYTES,
  SUBMISSION_IMAGE_SIZE,
  SUBMISSION_MODEL_EXTENSIONS,
  SUBMISSION_MODEL_MAX_BYTES,
} from '@bb/shared';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

import { AppConfig } from '@/config/app.config';
import { AppException } from '@/common/exceptions/app.exception';

export interface UploadedAsset {
  url: string;
  publicId: string;
}

/**
 * Cloudinary wrapper. Isolated behind this service so no feature module imports
 * the SDK directly — swapping to S3 later is one file, not a grep.
 *
 * Uploads are server-side (signed) rather than unsigned browser-direct: an
 * unsigned preset is a public write endpoint into the account's storage.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(config: AppConfig) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
  }

  async uploadAvatar(file: Express.Multer.File, userId: string): Promise<UploadedAsset> {
    this.assertValidAvatar(file);

    const result = await this.uploadBuffer(file.buffer, {
      folder: 'blender-battle/avatars',
      // Deterministic id keyed to the user: replacing an avatar overwrites in
      // place instead of accumulating orphaned assets.
      public_id: userId,
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 512, height: 512, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  /**
   * Challenge reference image or downloadable file.
   *
   * Images go through Cloudinary's transform pipeline, which re-encodes them —
   * anything that is not really an image fails there rather than being served
   * back to a browser. Non-image files are stored as `raw` and are never
   * transformed, so they must not be served from a domain that shares an origin
   * with the app; Cloudinary's own domain satisfies that.
   */
  async uploadChallengeAsset(
    file: Express.Multer.File,
    challengeId: string,
    type: ChallengeAssetType,
  ): Promise<UploadedAsset & { bytes: number; filename: string; mimeType: string }> {
    this.assertValidChallengeAsset(file, type);

    const isImage = type === ChallengeAssetType.REFERENCE_IMAGE;

    const result = await this.uploadBuffer(file.buffer, {
      folder: `blender-battle/challenges/${challengeId}`,
      resource_type: isImage ? 'image' : 'raw',
      // Random suffix, not the original filename: two managers uploading
      // "reference.png" to the same challenge must not overwrite each other.
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      ...(isImage
        ? {
            transformation: [
              { width: 2048, height: 2048, crop: 'limit' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          }
        : {}),
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? file.size,
      filename: file.originalname,
      mimeType: file.mimetype,
    };
  }

  /**
   * A competitor's render, the image the ballot actually shows.
   *
   * Forced through the image pipeline for the same reason avatars are: a file
   * that is not really an image fails re-encoding here rather than reaching a
   * voter's browser. Not overwritten and not keyed to the user, because a room's
   * entry is a historical record — a later room must never replace an earlier
   * one's evidence.
   */
  async uploadSubmissionImage(
    file: Express.Multer.File,
    roomId: string,
  ): Promise<UploadedAsset> {
    this.assertValid(file, {
      maxBytes: SUBMISSION_IMAGE_MAX_BYTES,
      allowedMime: SUBMISSION_IMAGE_ALLOWED_MIME as readonly string[],
      label: 'render',
    });

    const result = await this.uploadBuffer(file.buffer, {
      folder: `blender-battle/rooms/${roomId}/renders`,
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      transformation: [
        { width: 2048, height: 2048, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  /**
   * A public-challenge entry image — the final render or the workspace shot.
   *
   * Enforced to an exact SUBMISSION_IMAGE_SIZE square. The size is checked on the
   * *uploaded* file's real dimensions, not the client's word: a wrong-size image
   * is uploaded, found out, deleted, and rejected, so the check cannot be spoofed
   * by lying about dimensions. No resize transform — the whole point is that the
   * artist exports at the required size, not that we silently reshape their work.
   */
  async uploadEntryImage(
    file: Express.Multer.File,
    challengeId: string,
    kind: 'renders' | 'workspace',
  ): Promise<UploadedAsset> {
    this.assertValid(file, {
      maxBytes: SUBMISSION_IMAGE_MAX_BYTES,
      allowedMime: SUBMISSION_IMAGE_ALLOWED_MIME as readonly string[],
      label: kind === 'workspace' ? 'workspace photo' : 'render',
    });

    const result = await this.uploadBuffer(file.buffer, {
      folder: `blender-battle/challenges/${challengeId}/${kind}`,
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      // Format/quality only — never a resize, so the reported width/height are the
      // artist's real dimensions.
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    if (result.width !== SUBMISSION_IMAGE_SIZE || result.height !== SUBMISSION_IMAGE_SIZE) {
      await this.destroy(result.public_id);
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        `The ${kind === 'workspace' ? 'workspace photo' : 'render'} must be exactly ${SUBMISSION_IMAGE_SIZE}×${SUBMISSION_IMAGE_SIZE}px (received ${result.width}×${result.height}).`,
        400,
      );
    }

    return { url: result.secure_url, publicId: result.public_id };
  }

  /**
   * The 3D file behind the render.
   *
   * Interchange formats only — `.blend` is deliberately not accepted. A packed
   * .blend routinely runs to hundreds of megabytes and can be opened by exactly
   * one program; FBX/OBJ/glTF are an order of magnitude smaller and readable
   * everywhere, which also leaves room for an in-page viewer later.
   *
   * Stored as `raw` and never transformed, so it is served from Cloudinary's
   * domain rather than one sharing an origin with the app.
   */
  async uploadSubmissionModel(
    file: Express.Multer.File,
    roomId: string,
  ): Promise<UploadedAsset & { filename: string }> {
    const extension = (file.originalname.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();

    // Extension is the real check here: browsers report these formats
    // inconsistently, and most arrive as a generic octet-stream.
    if (!SUBMISSION_MODEL_EXTENSIONS.includes(extension as never)) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, `Model must be one of ${SUBMISSION_MODEL_EXTENSIONS.join(', ')}`, 400);
    }

    if (file.size > SUBMISSION_MODEL_MAX_BYTES) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, `Model must be under ${Math.round(SUBMISSION_MODEL_MAX_BYTES / 1024 / 1024)}MB`, 400);
    }

    const result = await this.uploadBuffer(file.buffer, {
      folder: `blender-battle/rooms/${roomId}/models`,
      resource_type: 'raw',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      filename: file.originalname,
    };
  }

  /** Shared size/MIME guard, so every uploader rejects the same way. */
  private assertValid(
    file: Express.Multer.File,
    rules: { maxBytes: number; allowedMime: readonly string[]; label: string },
  ): void {
    if (!file) throw new AppException(ApiErrorCode.UPLOAD_FAILED, `A ${rules.label} is required`, 400);

    if (file.size > rules.maxBytes) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, `The ${rules.label} must be under ${Math.round(rules.maxBytes / 1024 / 1024)}MB`, 400);
    }

    if (!rules.allowedMime.includes(file.mimetype)) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, `The ${rules.label} must be a JPEG, PNG or WebP image`, 400);
    }
  }

  async destroy(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      // A failed cleanup costs storage, not correctness — never fail the request.
      this.logger.warn(`Failed to destroy asset ${publicId}: ${(error as Error).message}`);
    }
  }

  /**
   * Validates the declared MIME type and size.
   *
   * Note this trusts the client-declared content type. Before Phase 2 opens
   * arbitrary reference-file uploads to managers, this must be upgraded to magic-
   * byte sniffing — a .exe renamed to .png passes the check as written.
   */
  private assertValidAvatar(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, 'No file received', 400);
    }

    if (file.size > AVATAR_MAX_BYTES) {
      throw new AppException(
        ApiErrorCode.UPLOAD_FAILED,
        `Image must be ${AVATAR_MAX_BYTES / 1024 / 1024}MB or smaller`,
        400,
      );
    }

    if (!AVATAR_ALLOWED_MIME.includes(file.mimetype as (typeof AVATAR_ALLOWED_MIME)[number])) {
      throw new AppException(
        ApiErrorCode.UPLOAD_FAILED,
        'Image must be JPEG, PNG or WebP',
        400,
      );
    }
  }

  /**
   * Size and declared-type checks for challenge attachments.
   *
   * The MIME type is still client-declared. For images that is acceptable — the
   * transform pipeline re-encodes and rejects anything that is not decodable.
   * For raw files it is NOT a content guarantee, which is why they are stored
   * as `raw` on Cloudinary's domain and only ever offered as a download, never
   * rendered or executed by this application.
   */
  private assertValidChallengeAsset(
    file: Express.Multer.File,
    type: ChallengeAssetType,
  ): void {
    if (!file?.buffer?.length) {
      throw new AppException(ApiErrorCode.UPLOAD_FAILED, 'No file received', 400);
    }

    if (file.size > CHALLENGE_ASSET_MAX_BYTES) {
      throw new AppException(
        ApiErrorCode.UPLOAD_FAILED,
        `File must be ${CHALLENGE_ASSET_MAX_BYTES / 1024 / 1024}MB or smaller`,
        400,
      );
    }

    const allowed: readonly string[] =
      type === ChallengeAssetType.REFERENCE_IMAGE
        ? CHALLENGE_IMAGE_ALLOWED_MIME
        : CHALLENGE_FILE_ALLOWED_MIME;

    if (!allowed.includes(file.mimetype)) {
      throw new AppException(
        ApiErrorCode.UPLOAD_FAILED,
        type === ChallengeAssetType.REFERENCE_IMAGE
          ? 'Reference images must be JPEG, PNG or WebP'
          : 'Reference files must be a .zip or .blend',
        400,
      );
    }
  }

  private uploadBuffer(
    buffer: Buffer,
    options: Record<string, unknown>,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          this.logger.error(`Cloudinary upload failed: ${error?.message ?? 'no result'}`);
          reject(new AppException(ApiErrorCode.UPLOAD_FAILED, 'Upload failed', 502));
          return;
        }
        resolve(result);
      });

      stream.end(buffer);
    });
  }
}
