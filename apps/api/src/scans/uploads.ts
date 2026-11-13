import { ApiException } from '../common/http/api-exception';
import { LIMITS } from '@scamshield/validation';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * File-signature validation. Content-Type from the browser is never trusted on
 * its own; the bytes must match an allowed image format.
 */
export function assertImageUpload(file: { buffer?: Buffer; mimetype?: string; size?: number; originalname?: string } | undefined): {
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
} {
  if (!file?.buffer || !file.size) {
    throw new ApiException({ code: 'UPLOAD_INVALID', message: 'Choose an image file to scan.', status: 400 });
  }
  if (file.size > LIMITS.imageMaxBytes) {
    throw new ApiException({
      code: 'UPLOAD_TOO_LARGE',
      message: `Images must be smaller than ${Math.round(LIMITS.imageMaxBytes / (1024 * 1024))} MB.`,
      status: 413,
    });
  }
  const buffer = file.buffer;
  const isPng = buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = buffer.subarray(0, 3).equals(JPEG_SIGNATURE);
  if (!isPng && !isJpeg) {
    throw new ApiException({
      code: 'UPLOAD_INVALID',
      message: 'Only PNG and JPEG images are supported. The file contents did not match an image format.',
      status: 415,
    });
  }
  return { buffer, mimeType: isPng ? 'image/png' : 'image/jpeg' };
}

export function assertEmlUpload(file: { buffer?: Buffer; size?: number; originalname?: string } | undefined): string {
  if (!file?.buffer || !file.size) {
    throw new ApiException({ code: 'UPLOAD_INVALID', message: 'Choose an .eml file to scan.', status: 400 });
  }
  if (file.size > LIMITS.emlMaxBytes) {
    throw new ApiException({
      code: 'UPLOAD_TOO_LARGE',
      message: `Email files must be smaller than ${Math.round(LIMITS.emlMaxBytes / (1024 * 1024))} MB.`,
      status: 413,
    });
  }
  if (file.buffer.includes(0x00)) {
    throw new ApiException({
      code: 'UPLOAD_INVALID',
      message: 'That file does not look like a plain-text email (.eml).',
      status: 415,
    });
  }
  const text = file.buffer.toString('utf8');
  if (!/^[A-Za-z0-9-]{1,64}:/m.test(text.slice(0, 4000)) && !text.includes('@')) {
    throw new ApiException({
      code: 'UPLOAD_INVALID',
      message: 'No email headers or addresses were found in that file.',
      status: 422,
    });
  }
  return text.slice(0, LIMITS.emailRawMax);
}
