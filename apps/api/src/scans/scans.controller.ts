import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { LIMITS, emailScanSchema, feedbackSchema, messageScanSchema, scanListQuerySchema, urlScanSchema } from '@scamshield/validation';
import { ScansService } from './scans.service';
import { CurrentUser, type AuthUser } from '../common/security/auth-user';
import { zodPipe, parseSchema } from '../common/pipes/zod-validation.pipe';
import { assertEmlUpload, assertImageUpload } from './uploads';
import { loadEnv } from '../common/config/env';

const env = loadEnv();
const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: LIMITS.imageMaxBytes + 1024, files: 1 },
};

@ApiTags('scans')
@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post('message')
  @Throttle({ default: { limit: env.SCAN_THROTTLE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: 'Analyse a pasted message (SMS, WhatsApp, Telegram, job offer, payment request)' })
  async message(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(messageScanSchema)) input: { content: string; channel: string; consentToStore: boolean },
    @Req() request: Request,
  ) {
    return this.scans.scanMessage(user, input, request);
  }

  @Post('url')
  @Throttle({ default: { limit: env.SCAN_THROTTLE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: 'Analyse a URL with SSRF-protected network inspection and threat intelligence' })
  async url(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(urlScanSchema)) input: { url: string; consentToStore: boolean },
    @Req() request: Request,
  ) {
    return this.scans.scanUrl(user, input, request);
  }

  @Post('screenshot')
  @Throttle({ default: { limit: env.SCAN_THROTTLE_LIMIT, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        consentToStore: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({ summary: 'OCR a screenshot (PNG/JPEG) and analyse the extracted text' })
  async screenshot(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { consentToStore?: string | boolean },
    @Req() request: Request,
  ) {
    const upload = assertImageUpload(file);
    const consent = body.consentToStore === true || body.consentToStore === 'true';
    return this.scans.scanScreenshot(user, upload.buffer, upload.mimeType, consent, request);
  }

  @Post('qr')
  @Throttle({ default: { limit: env.SCAN_THROTTLE_LIMIT, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Decode a QR code and analyse its destination without opening it' })
  async qr(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request,
  ) {
    const upload = assertImageUpload(file);
    return this.scans.scanQr(user, upload.buffer, upload.mimeType, request);
  }

  @Post('email')
  @Throttle({ default: { limit: env.SCAN_THROTTLE_LIMIT, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: LIMITS.emlMaxBytes + 1024, files: 1 } }),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Analyse pasted email content or an uploaded .eml file' })
  async email(
    @CurrentUser() user: AuthUser,
    @Body() body: { raw?: string; consentToStore?: string | boolean },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request,
  ) {
    const consent = body.consentToStore === true || body.consentToStore === 'true';
    if (file) {
      const text = assertEmlUpload(file);
      return this.scans.scanEmail(user, text, consent, request);
    }
    const input = parseSchema(emailScanSchema, { raw: body.raw, consentToStore: consent });
    return this.scans.scanEmail(user, input.raw, input.consentToStore ?? false, request);
  }

  @Get('quota')
  async quota(@CurrentUser() user: AuthUser) {
    return this.scans.quota(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated scan history for the signed-in user' })
  async list(@CurrentUser() user: AuthUser, @Query(zodPipe(scanListQuerySchema)) query: Parameters<ScansService['list']>[1]) {
    return this.scans.list(user.id, query);
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scans.getById(user, id);
  }

  @Post(':id/explain')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate (or return cached) plain-language explanation of a completed scan' })
  async explain(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { explanation: await this.scans.explain(user, id) };
  }

  @Post(':id/feedback')
  @HttpCode(201)
  async feedback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(zodPipe(feedbackSchema)) body: { verdict: string; comment?: string },
  ) {
    return this.scans.submitFeedback(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteScan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() request: Request) {
    await this.scans.deleteScan(user, id, request);
  }

  @Delete()
  @HttpCode(204)
  async deleteAll(@CurrentUser() user: AuthUser, @Req() request: Request) {
    await this.scans.deleteAll(user, request);
  }
}
