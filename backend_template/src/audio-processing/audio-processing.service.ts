import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { Consultation } from '../consultations/consultation.entity';
import {
  CreateAudioUploadTargetDto,
  StartAudioProcessingDto,
} from './dto/audio-processing.dto';

const execFileAsync = promisify(execFile);

const DEFAULT_DATASET_SLUG = 'cdss-temp-consultation-audio';
const AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/flac',
  'application/octet-stream',
  '',
];

type CommandResult = {
  command: string;
  stdout: string;
  stderr: string;
};

type DatasetUploadResult = CommandResult & {
  status: string;
  datasetId: string;
};

type DatasetManifestItem = {
  consultation_id: string;
  source?: string | null;
  bucket_path?: string | null;
  audio_file?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  task?: string | null;
  kaggle_input_hint?: string | null;
  transcript_file?: string | null;
  result_file?: string | null;
  asr_result_file?: string | null;
  medical_extraction_file?: string | null;
  primary_transcript_file?: string | null;
  fallback_transcript_file?: string | null;
  processed_at?: string | null;
  selected_engine?: string | null;
  fallback_used?: boolean;
  alternatives_available?: boolean;
  output_persistence?: {
    persisted_at?: string;
    transcript_sha256?: string;
    source_output_dir?: string | null;
  };
};

type DatasetManifest = {
  dataset_slug: string;
  dataset_title: string;
  updated_at: string;
  latest_consultation_id: string | null;
  audio_file: string | null;
  consultations: DatasetManifestItem[];
};

type KaggleResultJson = Record<string, unknown> & {
  status?: string;
  consultation_id?: string;
  final_transcript?: string;
  transcript?: string;
  asr?: Record<string, unknown>;
  medical_extraction?: Record<string, unknown>;
  processed_at?: string;
};

type AudioUploadInput = {
  consultationId?: string;
  filename?: string;
  contentType?: string | string[];
  body: Buffer;
};

type ConsultationAudioPatch = {
  audioBucketPath?: string;
  audioProcessingStatus?: string;
  transcript?: string;
  audioProcessingResult?: Record<string, unknown>;
};

@Injectable()
export class AudioProcessingService {
  private readonly runtimeRoot = path.resolve(
    process.cwd(),
    'runtime',
    'audio-processing',
  );
  private readonly tmpMetadataCheckDir = path.join(
    this.runtimeRoot,
    'tmp_metadata_check',
  );
  private readonly tmpDatasetDownloadDir = path.join(
    this.runtimeRoot,
    'tmp_dataset_download',
  );
  private readonly consultationCounterFile = path.join(
    this.runtimeRoot,
    'consultation_counter.json',
  );

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Consultation)
    private readonly consultations: Repository<Consultation>,
  ) {}

  async createUploadTarget(dto: CreateAudioUploadTargetDto) {
    const consultationId = await this.resolveConsultationId(dto.consultationId);
    const filename = dto.filename || 'audio.webm';
    const contentType = dto.contentType || 'audio/webm';

    this.assertAudioFile({ filename, contentType });

    const extension = this.audioExtensionFrom({ filename, contentType });
    const objectPath = `consultations/${consultationId}/raw.${extension}`;

    return {
      method: 'backend-raw-upload',
      consultationId,
      bucket: this.storageBucket(),
      path: objectPath,
      contentType,
      uploadUrl: `/api/audio/upload?consultationId=${encodeURIComponent(
        consultationId,
      )}&filename=${encodeURIComponent(filename)}`,
    };
  }

  async uploadAudio(input: AudioUploadInput) {
    const consultationId = await this.resolveConsultationId(input.consultationId);
    const filename = input.filename || 'audio.webm';
    const contentType = this.firstHeader(input.contentType) || 'audio/webm';

    try {
      this.assertAudioFile({ filename, contentType });

      const extension = this.audioExtensionFrom({ filename, contentType });
      const objectPath = `consultations/${consultationId}/raw.${extension}`;
      await this.uploadToStorage({
        objectPath,
        body: input.body,
        contentType,
      });
      await this.markConsultation(consultationId, {
        audioBucketPath: objectPath,
        audioProcessingStatus: 'uploaded',
      });

      return {
        ok: true,
        consultationId,
        bucket: this.storageBucket(),
        path: objectPath,
        bytes: input.body.length,
        message: 'Audio uploaded to Supabase Storage',
      };
    } catch (error) {
      await this.markConsultation(consultationId, {
        audioProcessingStatus: 'upload_error',
      });
      throw this.toHttpError(error);
    }
  }

  async startProcessing(dto: StartAudioProcessingDto) {
    const consultationId = this.safeConsultationId(dto.consultationId);
    const bucketPath = String(dto.bucketPath || '').trim();

    if (!bucketPath) {
      throw new BadRequestException('bucketPath is required');
    }
    if (!bucketPath.startsWith(`consultations/${consultationId}/`)) {
      throw new BadRequestException('bucketPath does not match consultationId');
    }

    try {
      await this.markConsultation(consultationId, {
        audioBucketPath: bucketPath,
        audioProcessingStatus: 'kaggle_preparing',
      });

      const audioBuffer = await this.downloadFromStorage(bucketPath);
      const datasetDir = await this.prepareDatasetFolder({
        consultationId,
        audioBuffer,
        bucketPath,
      });
      const datasetResult = await this.uploadKaggleDataset(
        datasetDir,
        consultationId,
      );
      const datasetReady = await this.waitForKaggleDatasetReady();
      const kernelDir = await this.prepareKernelFolder();
      const kernelResult = await this.pushKaggleKernel(kernelDir);

      if (this.config.get<string>('DELETE_SUPABASE_AFTER_KAGGLE') === 'true') {
        await this.removeFromStorage(bucketPath);
      }

      await this.markConsultation(consultationId, {
        audioProcessingStatus: 'kaggle_running',
      });

      return {
        ok: true,
        status: 'kaggle_running',
        consultationId,
        bucketPath,
        datasetStatus: datasetResult.status,
        datasetId: datasetResult.datasetId,
        datasetCommand: datasetResult.command,
        datasetReadyCommand: datasetReady.command,
        kernelCommand: kernelResult.command,
        datasetStdout: datasetResult.stdout,
        datasetStderr: datasetResult.stderr,
        datasetReadyStdout: datasetReady.stdout,
        datasetReadyStderr: datasetReady.stderr,
        kernelStdout: kernelResult.stdout,
        kernelStderr: kernelResult.stderr,
      };
    } catch (error) {
      await this.markConsultation(consultationId, {
        audioProcessingStatus: 'kaggle_error',
      });
      throw this.toHttpError(error);
    }
  }

  async getKaggleKernelStatus() {
    try {
      const status = await this.runKaggle([
        'kernels',
        'status',
        this.requiredConfig('KAGGLE_KERNEL_REF'),
      ]);
      return { ok: true, ...status };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async fetchKaggleKernelOutput() {
    try {
      const outputDir = path.join(this.runtimeRoot, 'outputs');
      await this.ensureCleanDir(outputDir);

      const cli = await this.runKaggle([
        'kernels',
        'output',
        this.requiredConfig('KAGGLE_KERNEL_REF'),
        '-p',
        outputDir,
        '-o',
      ]);

      const resultJson =
        (await this.readJsonIfExists<KaggleResultJson | null>(
          path.join(outputDir, 'result.json'),
          null,
        )) ?? null;

      let datasetPersistence: unknown = null;
      if (
        resultJson &&
        this.config.get<string>('KAGGLE_PERSIST_OUTPUTS_TO_DATASET') !==
          'false'
      ) {
        try {
          datasetPersistence = await this.persistKaggleOutputToDataset(
            resultJson,
            outputDir,
          );
        } catch (error) {
          datasetPersistence = {
            status: 'error',
            error: this.errorMessage(error),
          };
        }
      }

      if (resultJson?.consultation_id) {
        const transcript = String(
          resultJson.final_transcript || resultJson.transcript || '',
        );
        await this.markConsultation(resultJson.consultation_id, {
          transcript,
          audioProcessingStatus: resultJson.status
            ? 'completed'
            : 'output_downloaded',
          audioProcessingResult: resultJson,
        });
      }

      return {
        ok: true,
        ...cli,
        outputDir,
        resultJson,
        datasetPersistence,
      };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private async resolveConsultationId(value?: string) {
    const requestedId = String(value || '').trim();
    if (requestedId && requestedId !== 'AUTO') {
      return this.safeConsultationId(requestedId);
    }
    return this.allocateNextConsultationId();
  }

  private safeConsultationId(value: string) {
    const id = String(value || '').trim();
    if (!id) throw new BadRequestException('consultationId is required');
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id)) {
      throw new BadRequestException(
        'consultationId must contain only letters, numbers, underscore or dash',
      );
    }
    return id;
  }

  private assertAudioFile({
    filename,
    contentType,
  }: {
    filename: string;
    contentType: string;
  }) {
    const name = String(filename || '').toLowerCase();
    const type = String(contentType || '').toLowerCase();

    const validExtension = ['.mp3', '.webm', '.wav', '.m4a', '.ogg', '.flac'].some(
      (extension) => name.endsWith(extension),
    );
    const validType = AUDIO_CONTENT_TYPES.some(
      (allowed) => type === allowed || type.startsWith(`${allowed};`),
    );

    if (!validExtension || !validType) {
      throw new BadRequestException('Only audio files are allowed');
    }
  }

  private audioExtensionFrom({
    filename,
    contentType,
  }: {
    filename: string;
    contentType: string;
  }) {
    const name = String(filename || '').toLowerCase();
    const extension = name.match(/\.(mp3|webm|wav|m4a|ogg|flac)$/)?.[1];
    if (extension) return extension;

    const type = String(contentType || '').toLowerCase();
    if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
    if (type.includes('webm')) return 'webm';
    if (type.includes('wav')) return 'wav';
    if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
    if (type.includes('ogg')) return 'ogg';
    if (type.includes('flac')) return 'flac';
    return 'mp3';
  }

  private firstHeader(value?: string | string[]) {
    if (Array.isArray(value)) return value[0];
    return value;
  }

  private storageBucket() {
    return this.config.get<string>('SUPABASE_BUCKET', 'temp-consultation-audio');
  }

  private hasSupabaseApiConfig() {
    return Boolean(
      this.config.get<string>('SUPABASE_URL') &&
        this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  private hasS3Config() {
    return Boolean(
      this.config.get<string>('SUPABASE_S3_ENDPOINT') &&
        this.config.get<string>('SUPABASE_S3_ACCESS_KEY_ID') &&
        this.config.get<string>('SUPABASE_S3_SECRET_ACCESS_KEY'),
    );
  }

  private requiredConfig(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`Missing ${key} in backend environment`);
    return value;
  }

  private ensureStorageConfigured() {
    if (this.hasSupabaseApiConfig() || this.hasS3Config()) return;
    throw new Error(
      'Missing Supabase storage credentials. Provide SUPABASE_SERVICE_ROLE_KEY or SUPABASE_S3_* variables.',
    );
  }

  private async uploadToStorage(input: {
    objectPath: string;
    body: Buffer;
    contentType: string;
  }) {
    this.ensureStorageConfigured();
    if (this.hasSupabaseApiConfig()) {
      await this.uploadToSupabaseStorage(input);
      return;
    }
    await this.uploadToS3Storage(input);
  }

  private async downloadFromStorage(objectPath: string) {
    this.ensureStorageConfigured();
    if (this.hasSupabaseApiConfig()) {
      return this.downloadFromSupabaseStorage(objectPath);
    }
    return this.downloadFromS3Storage(objectPath);
  }

  private async removeFromStorage(objectPath: string) {
    this.ensureStorageConfigured();
    if (this.hasSupabaseApiConfig()) {
      await this.removeFromSupabaseStorage(objectPath);
      return;
    }
    await this.removeFromS3Storage(objectPath);
  }

  private storageObjectUrl(bucket: string, objectPath: string) {
    const supabaseUrl = this.requiredConfig('SUPABASE_URL').replace(/\/$/, '');
    const encodedPath = objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(
      bucket,
    )}/${encodedPath}`;
  }

  private async supabaseFetch(url: string, init: RequestInit) {
    const serviceRoleKey = this.requiredConfig('SUPABASE_SERVICE_ROLE_KEY');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${serviceRoleKey}`);
    headers.set('apikey', serviceRoleKey);

    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        details ||
          `Supabase Storage request failed (${response.status} ${response.statusText})`,
      );
    }
    return response;
  }

  private async uploadToSupabaseStorage({
    objectPath,
    body,
    contentType,
  }: {
    objectPath: string;
    body: Buffer;
    contentType: string;
  }) {
    await this.supabaseFetch(this.storageObjectUrl(this.storageBucket(), objectPath), {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: body as unknown as BodyInit,
    });
  }

  private async downloadFromSupabaseStorage(objectPath: string) {
    const response = await this.supabaseFetch(
      this.storageObjectUrl(this.storageBucket(), objectPath),
      { method: 'GET' },
    );
    return Buffer.from(await response.arrayBuffer());
  }

  private async removeFromSupabaseStorage(objectPath: string) {
    await this.supabaseFetch(
      `${this.requiredConfig('SUPABASE_URL').replace(
        /\/$/,
        '',
      )}/storage/v1/object/${encodeURIComponent(this.storageBucket())}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [objectPath] }),
      },
    );
  }

  private s3ObjectUrl(objectPath: string) {
    const endpoint = this.requiredConfig('SUPABASE_S3_ENDPOINT').replace(
      /\/$/,
      '',
    );
    const endpointUrl = new URL(endpoint);
    const basePath = endpointUrl.pathname.replace(/\/$/, '');
    const objectSegments = [
      this.storageBucket(),
      ...objectPath.split('/').filter(Boolean),
    ].map((segment) => this.awsUriEncode(segment));
    const canonicalUri = `${basePath}/${objectSegments.join('/')}`.replace(
      /\/{2,}/g,
      '/',
    );

    return {
      url: `${endpointUrl.origin}${canonicalUri}`,
      canonicalUri,
      host: endpointUrl.host,
    };
  }

  private async uploadToS3Storage({
    objectPath,
    body,
    contentType,
  }: {
    objectPath: string;
    body: Buffer;
    contentType: string;
  }) {
    const request = this.signS3Request({
      method: 'PUT',
      objectPath,
      body,
      contentType,
    });
    const response = await fetch(request.url, {
      method: 'PUT',
      headers: request.headers,
      body: body as unknown as BodyInit,
    });
    await this.assertStorageResponse(response);
  }

  private async downloadFromS3Storage(objectPath: string) {
    const request = this.signS3Request({
      method: 'GET',
      objectPath,
      body: Buffer.alloc(0),
    });
    const response = await fetch(request.url, {
      method: 'GET',
      headers: request.headers,
    });
    await this.assertStorageResponse(response);
    return Buffer.from(await response.arrayBuffer());
  }

  private async removeFromS3Storage(objectPath: string) {
    const request = this.signS3Request({
      method: 'DELETE',
      objectPath,
      body: Buffer.alloc(0),
    });
    const response = await fetch(request.url, {
      method: 'DELETE',
      headers: request.headers,
    });
    await this.assertStorageResponse(response);
  }

  private signS3Request({
    method,
    objectPath,
    body,
    contentType,
  }: {
    method: 'GET' | 'PUT' | 'DELETE';
    objectPath: string;
    body: Buffer;
    contentType?: string;
  }) {
    const accessKeyId = this.requiredConfig('SUPABASE_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.requiredConfig('SUPABASE_S3_SECRET_ACCESS_KEY');
    const region = this.config.get<string>('SUPABASE_S3_REGION', 'us-east-1');
    const { url, canonicalUri, host } = this.s3ObjectUrl(objectPath);
    const now = new Date();
    const amzDate = now
      .toISOString()
      .replace(/[:-]/g, '')
      .replace(/\.\d{3}/, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    if (contentType) {
      headers['content-type'] = contentType;
    }

    const sortedHeaderEntries = Object.entries(headers).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const canonicalHeaders = sortedHeaderEntries
      .map(([key, value]) => `${key}:${String(value).trim()}\n`)
      .join('');
    const signedHeaders = sortedHeaderEntries.map(([key]) => key).join(';');
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signingKey = this.awsSigningKey(secretAccessKey, dateStamp, region);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    return {
      url,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  private awsSigningKey(secretAccessKey: string, dateStamp: string, region: string) {
    const dateKey = this.hmac(`AWS4${secretAccessKey}`, dateStamp);
    const dateRegionKey = this.hmac(dateKey, region);
    const dateRegionServiceKey = this.hmac(dateRegionKey, 's3');
    return this.hmac(dateRegionServiceKey, 'aws4_request');
  }

  private hmac(key: string | Buffer, value: string) {
    return createHmac('sha256', key).update(value, 'utf8').digest();
  }

  private awsUriEncode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private async assertStorageResponse(response: Response) {
    if (response.ok) return;
    const details = await response.text();
    throw new Error(
      details ||
        `Supabase S3 request failed (${response.status} ${response.statusText})`,
    );
  }

  private kaggleEnv() {
    const env: Record<string, string | undefined> = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    };

    for (const key of ['KAGGLE_API_TOKEN', 'KAGGLE_USERNAME', 'KAGGLE_KEY']) {
      if (!env[key]) delete env[key];
    }

    return env;
  }

  private async configureKaggleCredentials() {
    const username = this.config.get<string>('KAGGLE_USERNAME');
    const key = this.config.get<string>('KAGGLE_KEY');

    if (!username || !key) return;

    const kaggleDir = path.join(os.homedir(), '.kaggle');
    await fs.mkdir(kaggleDir, { recursive: true });

    const credentialsPath = path.join(kaggleDir, 'kaggle.json');
    await fs.writeFile(
      credentialsPath,
      JSON.stringify({ username, key }, null, 2),
      'utf8',
    );
    await fs.chmod(credentialsPath, 0o600);
  }

  private async runKaggle(args: string[]): Promise<CommandResult> {
    await this.configureKaggleCredentials();

    const kaggleCommand = this.config.get<string>('KAGGLE_CLI_PATH', 'kaggle');
    try {
      const result = await execFileAsync(kaggleCommand, args, {
        env: this.kaggleEnv(),
        maxBuffer: 50 * 1024 * 1024,
      });

      return {
        command: `kaggle ${args.join(' ')}`,
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || ''),
      };
    } catch (error) {
      const maybeProcessError = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      const details = [
        maybeProcessError.stdout,
        maybeProcessError.stderr,
        maybeProcessError.message,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      throw new Error(details || `Kaggle command failed: kaggle ${args.join(' ')}`);
    }
  }

  private requireKaggleUsername() {
    return this.requiredConfig('KAGGLE_USERNAME');
  }

  private getDatasetSlug() {
    const slug = this.config.get<string>('KAGGLE_DATASET_SLUG');
    if (slug) return slug;

    const datasetRef = this.config.get<string>('KAGGLE_DATASET_REF');
    if (datasetRef) return this.slugFromRef(datasetRef);

    return DEFAULT_DATASET_SLUG;
  }

  private getDatasetRef() {
    const datasetRef = this.config.get<string>('KAGGLE_DATASET_REF');
    if (datasetRef) return datasetRef;
    return `${this.requireKaggleUsername()}/${this.getDatasetSlug()}`;
  }

  private async allocateNextConsultationId() {
    const prefix = this.config.get<string>('CONSULTATION_ID_PREFIX', 'CONS_');
    const width = Number(this.config.get<string>('CONSULTATION_ID_WIDTH', '4'));
    const datasetSlug = this.getDatasetSlug();
    const datasetTitle = this.config.get<string>(
      'KAGGLE_DATASET_TITLE',
      'CDSS Temp Consultation Audio',
    );
    let maxNumber = 0;

    const localCounter = await this.readJsonIfExists<{
      lastNumber?: number;
    }>(this.consultationCounterFile, {});
    maxNumber = Math.max(maxNumber, Number(localCounter?.lastNumber || 0));

    const downloaded = await this.downloadExistingDataset(
      this.tmpDatasetDownloadDir,
    );
    if (downloaded) {
      const manifest = this.normalizeManifest(
        await this.readJsonIfExists<Record<string, unknown>>(
          path.join(this.tmpDatasetDownloadDir, 'manifest.json'),
          {},
        ),
        datasetSlug,
        datasetTitle,
      );
      for (const item of manifest.consultations) {
        maxNumber = Math.max(
          maxNumber,
          this.consultationNumber(item.consultation_id),
        );
      }
      maxNumber = Math.max(
        maxNumber,
        this.consultationNumber(manifest.latest_consultation_id),
      );
    }

    const nextNumber = maxNumber + 1;
    const consultationId = `${prefix}${String(nextNumber).padStart(width, '0')}`;
    await fs.mkdir(this.runtimeRoot, { recursive: true });
    await this.writeJson(this.consultationCounterFile, {
      lastNumber: nextNumber,
      lastConsultationId: consultationId,
      updated_at: new Date().toISOString(),
    });

    return consultationId;
  }

  private async kaggleDatasetExists(slug = this.getDatasetSlug()) {
    const datasetId = `${this.requireKaggleUsername()}/${slug}`;

    await this.configureKaggleCredentials();
    await this.ensureCleanDir(this.tmpMetadataCheckDir);

    try {
      await execFileAsync(
        this.config.get<string>('KAGGLE_CLI_PATH', 'kaggle'),
        ['datasets', 'metadata', datasetId, '-p', this.tmpMetadataCheckDir],
        {
          env: this.kaggleEnv(),
          maxBuffer: 20 * 1024 * 1024,
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async downloadExistingDataset(targetDir: string) {
    const exists = await this.kaggleDatasetExists();
    await this.ensureCleanDir(targetDir);

    if (!exists) return false;

    try {
      await this.runKaggle([
        'datasets',
        'download',
        '-d',
        this.getDatasetRef(),
        '-p',
        targetDir,
        '--unzip',
      ]);
      return true;
    } catch {
      return false;
    }
  }

  private async prepareDatasetFolder({
    consultationId,
    audioBuffer,
    bucketPath,
  }: {
    consultationId: string;
    audioBuffer: Buffer;
    bucketPath: string;
  }) {
    const datasetRef = this.getDatasetRef();
    const datasetSlug = this.getDatasetSlug();
    const datasetTitle = this.config.get<string>(
      'KAGGLE_DATASET_TITLE',
      'CDSS Temp Consultation Audio',
    );
    const datasetDir = path.join(
      this.runtimeRoot,
      'consultation_audio_dataset_builder',
    );
    const audioDir = path.join(datasetDir, 'audio', consultationId);

    const downloaded = await this.downloadExistingDataset(datasetDir);
    if (!downloaded) {
      await this.ensureCleanDir(datasetDir);
    }
    await fs.mkdir(audioDir, { recursive: true });

    const sourceExt = path.extname(bucketPath || '').toLowerCase() || '.mp3';
    const audioRelativePath = path
      .join('audio', consultationId, `raw${sourceExt}`)
      .replaceAll('\\', '/');
    await fs.writeFile(path.join(datasetDir, audioRelativePath), audioBuffer);

    const manifestPath = path.join(datasetDir, 'manifest.json');
    const manifest = this.normalizeManifest(
      await this.readJsonIfExists<Record<string, unknown>>(manifestPath, {}),
      datasetSlug,
      datasetTitle,
    );
    const createdAt = new Date().toISOString();
    const existingIndex = manifest.consultations.findIndex(
      (item) => item.consultation_id === consultationId,
    );
    const consultationRecord: DatasetManifestItem = {
      consultation_id: consultationId,
      source: 'supabase_storage',
      bucket_path: bucketPath,
      audio_file: audioRelativePath,
      created_at:
        existingIndex >= 0
          ? manifest.consultations[existingIndex].created_at
          : createdAt,
      updated_at: createdAt,
      task: 'transcription_and_cdss_processing',
      kaggle_input_hint: `/kaggle/input/${datasetSlug}/${audioRelativePath}`,
    };

    if (existingIndex >= 0) {
      manifest.consultations[existingIndex] = consultationRecord;
    } else {
      manifest.consultations.push(consultationRecord);
    }

    manifest.updated_at = createdAt;
    manifest.latest_consultation_id = consultationId;
    manifest.audio_file = audioRelativePath;

    await this.writeJson(manifestPath, manifest);
    await this.writeDatasetMetadata(datasetDir, datasetRef, datasetTitle);

    return datasetDir;
  }

  private async uploadKaggleDataset(
    datasetDir: string,
    consultationId: string,
  ): Promise<DatasetUploadResult> {
    const username = this.requireKaggleUsername();
    const slug = this.getDatasetSlug();
    const datasetId = `${username}/${slug}`;
    const exists = await this.kaggleDatasetExists(slug);
    const skipExistingDatasets =
      this.config.get<string>('KAGGLE_SKIP_EXISTING_DATASETS') === 'true';

    if (exists && skipExistingDatasets) {
      return {
        command: 'skipped',
        stdout: `SKIP: dataset already exists: ${datasetId}`,
        stderr: '',
        status: 'skipped_existing',
        datasetId,
      };
    }

    if (exists) {
      const args = [
        'datasets',
        'version',
        '-p',
        datasetDir,
        '-m',
        `Upload consultation audio ${consultationId}`,
        '--dir-mode',
        'zip',
      ];

      if (this.config.get<string>('KAGGLE_DELETE_OLD_VERSIONS') === 'true') {
        args.push('-d');
      }

      const result = await this.runKaggle(args);
      return { ...result, status: 'versioned', datasetId };
    }

    const result = await this.runKaggle([
      'datasets',
      'create',
      '-p',
      datasetDir,
      '--dir-mode',
      'zip',
    ]);

    return { ...result, status: 'created', datasetId };
  }

  private async waitForKaggleDatasetReady() {
    const timeoutMs = Number(
      this.config.get<string>('KAGGLE_DATASET_READY_TIMEOUT_MS', '180000'),
    );
    const intervalMs = Number(
      this.config.get<string>('KAGGLE_DATASET_READY_INTERVAL_MS', '10000'),
    );
    const startedAt = Date.now();
    let lastStatus: CommandResult | null = null;

    while (Date.now() - startedAt <= timeoutMs) {
      lastStatus = await this.runKaggle([
        'datasets',
        'status',
        this.getDatasetRef(),
      ]);
      if (String(lastStatus.stdout || '').toLowerCase().includes('ready')) {
        return { ...lastStatus, ready: true };
      }
      await this.sleep(intervalMs);
    }

    throw new Error(
      `Kaggle dataset did not become ready within ${timeoutMs}ms. Last status: ${
        lastStatus?.stdout || 'unknown'
      }`,
    );
  }

  private async prepareKernelFolder() {
    const kernelRef = this.requiredConfig('KAGGLE_KERNEL_REF');
    const datasetRef = this.getDatasetRef();
    const kernelDir = path.join(this.runtimeRoot, 'kernel');
    await this.ensureCleanDir(kernelDir);

    const sourceProcessor = this.config.get<string>(
      'KAGGLE_PROCESSOR_PATH',
      path.resolve(process.cwd(), 'kaggle-kernel', 'processor.py'),
    );
    const kernelType = this.config.get<string>('KAGGLE_KERNEL_TYPE', 'notebook');
    const codeFile =
      this.config.get<string>('KAGGLE_KERNEL_CODE_FILE') ||
      (kernelType === 'notebook'
        ? `${this.getDatasetSlug().replace(
            'temp-consultation-audio',
            'audio-processor',
          )}.ipynb`
        : 'processor.py');

    if (kernelType === 'notebook') {
      await this.writeProcessorNotebook(
        sourceProcessor,
        path.join(kernelDir, codeFile),
      );
    } else {
      await fs.copyFile(sourceProcessor, path.join(kernelDir, codeFile));
    }

    await this.writeJson(path.join(kernelDir, 'kernel-metadata.json'), {
      id: kernelRef,
      title: this.config.get<string>(
        'KAGGLE_KERNEL_TITLE',
        'cdss-audio-processor',
      ),
      code_file: codeFile,
      language: 'python',
      kernel_type: kernelType,
      is_private: true,
      enable_gpu: this.isTruthyEnv(this.config.get<string>('KAGGLE_ENABLE_GPU')),
      enable_internet: this.isTruthyEnv(
        this.config.get<string>('KAGGLE_ENABLE_INTERNET'),
      ),
      dataset_sources: [
        datasetRef,
        ...this.csvEnv(this.config.get<string>('KAGGLE_EXTRA_DATASET_SOURCES')),
      ],
      competition_sources: [],
      kernel_sources: [],
      model_sources: this.csvEnv(
        this.config.get<string>('KAGGLE_MODEL_SOURCES'),
      ),
    });

    return kernelDir;
  }

  private pushKaggleKernel(kernelDir: string) {
    const args = ['kernels', 'push', '-p', kernelDir];
    const accelerator = this.config.get<string>('KAGGLE_ACCELERATOR');

    if (accelerator) {
      args.push('--accelerator', accelerator);
    }

    return this.runKaggle(args);
  }

  private async persistKaggleOutputToDataset(
    resultJson: KaggleResultJson,
    outputDir: string,
  ) {
    if (!resultJson || resultJson.status !== 'completed_transcription') {
      return {
        skipped: true,
        status: 'skipped_no_completed_result',
        reason: 'No completed result.json is available to persist.',
      };
    }

    const consultationId = String(resultJson.consultation_id || '');
    if (!consultationId) {
      return {
        skipped: true,
        status: 'skipped_missing_consultation_id',
        reason: 'result.json has no consultation_id.',
      };
    }

    const datasetRef = this.getDatasetRef();
    const datasetSlug = this.getDatasetSlug();
    const datasetTitle = this.config.get<string>(
      'KAGGLE_DATASET_TITLE',
      'CDSS Temp Consultation Audio',
    );
    const datasetDir = path.join(
      this.runtimeRoot,
      'consultation_audio_dataset_builder',
    );
    const downloaded = await this.downloadExistingDataset(datasetDir);
    if (!downloaded) {
      throw new Error('Cannot persist transcript: Kaggle dataset does not exist.');
    }

    const manifestPath = path.join(datasetDir, 'manifest.json');
    const manifest = this.normalizeManifest(
      await this.readJsonIfExists<Record<string, unknown>>(manifestPath, {}),
      datasetSlug,
      datasetTitle,
    );
    const consultationIndex = manifest.consultations.findIndex(
      (item) => item.consultation_id === consultationId,
    );
    if (consultationIndex < 0) {
      throw new Error(
        `Cannot persist transcript: consultation ${consultationId} is not in manifest.json.`,
      );
    }

    const finalTranscript = String(
      resultJson.final_transcript || resultJson.transcript || '',
    );
    const transcriptHash = this.sha256(finalTranscript);
    const consultationRecord = manifest.consultations[consultationIndex];
    const audioOutputDir = path.join(datasetDir, 'audio', consultationId);
    const transcriptRelativePath = path
      .join('audio', consultationId, 'transcript.txt')
      .replaceAll('\\', '/');
    const transcriptPath = path.join(datasetDir, transcriptRelativePath);
    const alreadyPersisted =
      consultationRecord.output_persistence?.transcript_sha256 ===
        transcriptHash && (await this.pathExists(transcriptPath));

    if (alreadyPersisted) {
      return {
        skipped: true,
        status: 'skipped_already_persisted',
        datasetId: datasetRef,
        consultationId,
        transcriptFile: transcriptRelativePath,
        transcriptSha256: transcriptHash,
      };
    }

    await fs.mkdir(audioOutputDir, { recursive: true });

    const resultRelativePath = path
      .join('audio', consultationId, 'result.json')
      .replaceAll('\\', '/');
    const asrRelativePath = path
      .join('audio', consultationId, 'asr_result.json')
      .replaceAll('\\', '/');
    const medicalRelativePath = path
      .join('audio', consultationId, 'medical_extraction.json')
      .replaceAll('\\', '/');

    await fs.writeFile(transcriptPath, finalTranscript, 'utf8');
    await this.writeJson(path.join(datasetDir, resultRelativePath), resultJson);

    if (resultJson.asr) {
      await this.writeJson(path.join(datasetDir, asrRelativePath), resultJson.asr);
    }

    if (resultJson.medical_extraction) {
      await this.writeJson(
        path.join(datasetDir, medicalRelativePath),
        resultJson.medical_extraction,
      );
    }

    const primaryTranscript = this.stringFromNested(
      resultJson.asr,
      'primary_result',
      'text',
    );
    const fallbackTranscript = this.stringFromNested(
      resultJson.asr,
      'fallback_result',
      'text',
    );
    let primaryRelativePath: string | null = null;
    let fallbackRelativePath: string | null = null;

    if (primaryTranscript) {
      primaryRelativePath = path
        .join('audio', consultationId, 'primary_transcript.txt')
        .replaceAll('\\', '/');
      await fs.writeFile(
        path.join(datasetDir, primaryRelativePath),
        primaryTranscript,
        'utf8',
      );
    }

    if (fallbackTranscript) {
      fallbackRelativePath = path
        .join('audio', consultationId, 'fallback_transcript.txt')
        .replaceAll('\\', '/');
      await fs.writeFile(
        path.join(datasetDir, fallbackRelativePath),
        fallbackTranscript,
        'utf8',
      );
    }

    const persistedAt = new Date().toISOString();
    manifest.consultations[consultationIndex] = {
      ...consultationRecord,
      updated_at: persistedAt,
      transcript_file: transcriptRelativePath,
      result_file: resultRelativePath,
      asr_result_file: resultJson.asr ? asrRelativePath : null,
      medical_extraction_file: resultJson.medical_extraction
        ? medicalRelativePath
        : null,
      primary_transcript_file: primaryRelativePath,
      fallback_transcript_file: fallbackRelativePath,
      processed_at: resultJson.processed_at || consultationRecord.processed_at,
      selected_engine: this.stringFromNested(resultJson.asr, 'selected_engine'),
      fallback_used: Boolean(resultJson.asr?.fallback_used),
      alternatives_available: Boolean(resultJson.asr?.alternatives_available),
      output_persistence: {
        persisted_at: persistedAt,
        transcript_sha256: transcriptHash,
        source_output_dir: outputDir,
      },
    };
    manifest.updated_at = persistedAt;
    manifest.latest_consultation_id = consultationId;

    await this.writeJson(manifestPath, manifest);
    await this.writeDatasetMetadata(datasetDir, datasetRef, datasetTitle);

    const result = await this.uploadKaggleDataset(datasetDir, consultationId);
    return {
      ...result,
      skipped: false,
      consultationId,
      transcriptFile: transcriptRelativePath,
      resultFile: resultRelativePath,
      asrResultFile: resultJson.asr ? asrRelativePath : null,
      medicalExtractionFile: resultJson.medical_extraction
        ? medicalRelativePath
        : null,
      primaryTranscriptFile: primaryRelativePath,
      fallbackTranscriptFile: fallbackRelativePath,
      transcriptSha256: transcriptHash,
    };
  }

  private async writeProcessorNotebook(sourceFile: string, targetFile: string) {
    const source = await fs.readFile(sourceFile, 'utf8');
    const lines = source.split(/\r?\n/);
    const notebook = {
      cells: [
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: lines.map((line, index) =>
            index === lines.length - 1 ? line : `${line}\n`,
          ),
        },
      ],
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3',
        },
        language_info: {
          name: 'python',
          pycodemirror_mode: {
            name: 'ipython',
            version: 3,
          },
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    };

    await this.writeJson(targetFile, notebook);
  }

  private normalizeManifest(
    rawManifest: Record<string, unknown> | null | undefined,
    datasetSlug: string,
    datasetTitle: string,
  ): DatasetManifest {
    const now = new Date().toISOString();
    const consultations = Array.isArray(rawManifest?.consultations)
      ? (rawManifest.consultations as DatasetManifestItem[])
      : [];

    if (
      !consultations.length &&
      rawManifest?.consultation_id &&
      rawManifest.audio_file
    ) {
      consultations.push({
        consultation_id: String(rawManifest.consultation_id),
        source: String(rawManifest.source || 'supabase_storage'),
        bucket_path: this.nullableString(rawManifest.bucket_path),
        audio_file: String(rawManifest.audio_file),
        created_at: this.nullableString(rawManifest.created_at) || now,
        task:
          this.nullableString(rawManifest.task) ||
          'transcription_and_cdss_processing',
      });
    }

    return {
      dataset_slug:
        this.nullableString(rawManifest?.dataset_slug) || datasetSlug,
      dataset_title:
        this.nullableString(rawManifest?.dataset_title) || datasetTitle,
      updated_at: now,
      latest_consultation_id:
        this.nullableString(rawManifest?.latest_consultation_id) ||
        this.nullableString(rawManifest?.consultation_id),
      audio_file: this.nullableString(rawManifest?.audio_file),
      consultations,
    };
  }

  private async writeDatasetMetadata(
    datasetDir: string,
    datasetRef: string,
    datasetTitle: string,
  ) {
    await this.writeJson(path.join(datasetDir, 'dataset-metadata.json'), {
      title: datasetTitle,
      id: datasetRef,
      licenses: [
        {
          name: this.config.get<string>('KAGGLE_DATASET_LICENSE', 'CC0-1.0'),
        },
      ],
      isPrivate: true,
      description:
        this.config.get<string>('KAGGLE_DATASET_DESCRIPTION') ||
        'Temporary consultation audio dataset for CDSS development.',
    });
  }

  private async markConsultation(
    consultationId: string,
    patch: ConsultationAudioPatch,
  ) {
    const consultation = await this.consultations.findOne({
      where: { id: consultationId },
    });
    if (!consultation) return;

    Object.assign(consultation, patch);
    await this.consultations.save(consultation);
  }

  private async ensureCleanDir(dir: string) {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }

  private async writeJson(filePath: string, data: unknown) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private async readJsonIfExists<T>(filePath: string, fallback: T) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  private async pathExists(filePath: string) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private slugFromRef(ref: string) {
    const parts = String(ref || '').split('/');
    return parts[1] || ref;
  }

  private consultationNumber(id?: string | null) {
    const match = String(id || '').match(/(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  private nullableString(value: unknown) {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return text || null;
  }

  private isTruthyEnv(value?: string) {
    return String(value || '').toLowerCase() === 'true';
  }

  private csvEnv(value?: string) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private stringFromNested(
    value: Record<string, unknown> | undefined,
    firstKey: string,
    secondKey?: string,
  ) {
    if (!value) return null;
    const first = value[firstKey];
    if (!secondKey) return typeof first === 'string' ? first : null;
    if (!first || typeof first !== 'object') return null;
    const second = (first as Record<string, unknown>)[secondKey];
    return typeof second === 'string' ? second : null;
  }

  private toHttpError(error: unknown) {
    if (error instanceof BadRequestException) return error;
    if (error instanceof InternalServerErrorException) return error;
    return new InternalServerErrorException(this.errorMessage(error));
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
