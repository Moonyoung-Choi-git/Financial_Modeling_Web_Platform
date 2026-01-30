/**
 * DART API Client (명세서 Section 2 - DART 데이터 수집)
 *
 * Key Features:
 * - API Call Ledger (Section 2.5)
 * - Rate Limit Handling (020)
 * - Retry Logic with Exponential Backoff
 * - Circuit Breaker for Maintenance (800)
 * - Idempotency (duplicate call prevention)
 * - Payload Hash Calculation (SHA-256)
 */

import crypto from 'crypto';
import prisma from '../db';
import {
  DartClientConfig,
  DartApiResponse,
  DartApiError,
  DartRateLimitError,
  DartMaintenanceError,
  DartNoDataError,
  DartStatusCode,
  ApiCallMetadata,
} from './types';

// ============================================================================
// Circuit Breaker State (명세서 Section 2.5 - 800 점검 대응)
// ============================================================================

class CircuitBreaker {
  private isOpen = false;
  private reopenAt?: Date;

  open(duration: number = 10 * 60 * 1000) { // 기본 10분
    this.isOpen = true;
    this.reopenAt = new Date(Date.now() + duration);
    console.warn(`[DART Circuit Breaker] OPEN until ${this.reopenAt.toISOString()}`);
  }

  close() {
    this.isOpen = false;
    this.reopenAt = undefined;
    console.log('[DART Circuit Breaker] CLOSED');
  }

  check(): boolean {
    if (!this.isOpen) return false;

    if (this.reopenAt && Date.now() > this.reopenAt.getTime()) {
      this.close();
      return false;
    }

    return true;
  }
}

const circuitBreaker = new CircuitBreaker();

// ============================================================================
// DART API Client
// ============================================================================

export class DartClient {
  private config: Required<DartClientConfig>;
  private requestQueue: Map<string, Promise<any>> = new Map(); // Idempotency

  constructor(config: DartClientConfig) {
    this.config = {
      baseUrl: 'https://opendart.fss.or.kr/api',
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      enableLogging: true,
      ...config,
    };

    if (!this.config.apiKey) {
      throw new Error('[DART Client] API key is required');
    }
  }

  /**
   * 명세서 Section 2.5 - Canonical Parameter String 생성
   * 정렬된 key=value 형태로 파라미터를 표준화하여 Idempotency 보장
   */
  private canonicalParams(params: Record<string, any>): string {
    const entries = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b));

    return entries.map(([k, v]) => `${k}=${v}`).join('&');
  }

  /**
   * SHA-256 해시 계산
   */
  private calculateHash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * API Call Ledger 기록 (명세서 Section 2.5)
   */
  private async recordApiCall(metadata: ApiCallMetadata, payload?: any): Promise<string> {
    const apiCall = await prisma.rawDartApiCall.create({
      data: {
        endpoint: metadata.endpoint,
        paramsCanonical: metadata.paramsCanonical,
        requestedAt: metadata.requestedAt,
        completedAt: metadata.completedAt,
        latencyMs: metadata.latencyMs,
        httpStatus: metadata.httpStatus,
        dartStatus: metadata.dartStatus,
        dartMessage: metadata.dartMessage,
        responseFormat: metadata.responseFormat,
        payloadHash: metadata.payloadHash,
        payloadSize: metadata.payloadSize,
        retryCount: metadata.retryCount,
        jobId: metadata.jobId,
        workerId: metadata.workerId,
      },
    });

    // JSON payload 저장
    if (payload && metadata.responseFormat === 'json') {
      await prisma.rawDartPayloadJson.create({
        data: {
          apiCallId: apiCall.id,
          bodyJson: payload,
          parsedOk: true,
        },
      });
    }

    return apiCall.id;
  }

  /**
   * Idempotency Check (명세서 Section 2.5)
   * 동일한 endpoint + params 조합이 이미 처리 중이면 해당 Promise 반환
   */
  private getIdempotencyKey(endpoint: string, params: Record<string, any>): string {
    return `${endpoint}:${this.canonicalParams(params)}`;
  }

  /**
   * HTTP GET 요청 with Retry Logic
   */
  private async fetchWithRetry<T = any>(
    endpoint: string,
    params: Record<string, any>,
    options: {
      jobId?: string;
      workerId?: string;
      retryCount?: number;
    } = {}
  ): Promise<{ data: T; metadata: ApiCallMetadata }> {
    // Circuit Breaker Check (800 점검 대응)
    if (circuitBreaker.check()) {
      throw new DartMaintenanceError('Circuit breaker is open - DART API under maintenance');
    }

    const retryCount = options.retryCount || 0;
    const requestedAt = new Date();
    const paramsCanonical = this.canonicalParams(params);

    // Idempotency Check
    const idempotencyKey = this.getIdempotencyKey(endpoint, params);
    if (this.requestQueue.has(idempotencyKey)) {
      if (this.config.enableLogging) {
        console.log(`[DART Client] Idempotency: Reusing in-flight request for ${endpoint}`);
      }
      return this.requestQueue.get(idempotencyKey)!;
    }

    // Create request promise
    const requestPromise = this._executeRequest<T>(endpoint, params, {
      requestedAt,
      paramsCanonical,
      jobId: options.jobId,
      workerId: options.workerId,
      retryCount,
    });

    // Store in queue for idempotency
    this.requestQueue.set(idempotencyKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Remove from queue after completion
      setTimeout(() => this.requestQueue.delete(idempotencyKey), 5000); // 5초 후 제거
    }
  }

  private async _executeRequest<T>(
    endpoint: string,
    params: Record<string, any>,
    context: {
      requestedAt: Date;
      paramsCanonical: string;
      jobId?: string;
      workerId?: string;
      retryCount: number;
    }
  ): Promise<{ data: T; metadata: ApiCallMetadata }> {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    url.searchParams.set('crtfc_key', this.config.apiKey);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const completedAt = new Date();
      const latencyMs = completedAt.getTime() - context.requestedAt.getTime();

      // Parse response
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      let data: any;
      let payloadHash: string;
      let payloadSize: number;

      if (isJson) {
        const text = await response.text();
        payloadSize = text.length;
        payloadHash = this.calculateHash(text);
        data = JSON.parse(text);
      } else {
        const buffer = await response.arrayBuffer();
        payloadSize = buffer.byteLength;
        payloadHash = this.calculateHash(Buffer.from(buffer));
        data = buffer;
      }

      // DART API 상태 코드 처리 (명세서 Section 2.5)
      const dartStatus = data?.status || '000';
      const dartMessage = data?.message || '';

      const metadata: ApiCallMetadata = {
        endpoint,
        paramsCanonical: context.paramsCanonical,
        requestedAt: context.requestedAt,
        completedAt,
        latencyMs,
        httpStatus: response.status,
        dartStatus,
        dartMessage,
        responseFormat: isJson ? 'json' : 'zip',
        payloadHash,
        payloadSize,
        retryCount: context.retryCount,
        jobId: context.jobId,
        workerId: context.workerId,
      };

      // Record API Call
      await this.recordApiCall(metadata, isJson ? data : undefined);

      // Handle DART Status Codes
      await this.handleDartStatus(dartStatus, dartMessage, context.retryCount);

      return { data: data as T, metadata };

    } catch (error: any) {
      clearTimeout(timeout);

      // Retry logic for network errors
      if (context.retryCount < this.config.maxRetries && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * Math.pow(2, context.retryCount);

        if (this.config.enableLogging) {
          console.warn(`[DART Client] Retry ${context.retryCount + 1}/${this.config.maxRetries} after ${delay}ms: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, delay));

        return this._executeRequest<T>(endpoint, params, {
          ...context,
          retryCount: context.retryCount + 1,
        });
      }

      throw error;
    }
  }

  /**
   * DART Status Code Handler (명세서 Section 2.5)
   */
  private async handleDartStatus(status: string, message: string, retryCount: number): Promise<void> {
    switch (status) {
      case DartStatusCode.SUCCESS:
        return; // OK

      case DartStatusCode.NO_DATA:
        // 013: 데이터 없음 - 정상 케이스 (에러 아님)
        if (this.config.enableLogging) {
          console.log('[DART Client] No data available (013)');
        }
        throw new DartNoDataError(message);

      case DartStatusCode.RATE_LIMIT:
        // 020: 레이트 리밋 초과 - 재시도 가능
        if (this.config.enableLogging) {
          console.warn('[DART Client] Rate limit exceeded (020) - backing off');
        }
        throw new DartRateLimitError(message);

      case DartStatusCode.MAINTENANCE:
        // 800: 점검 중 - Circuit Breaker Open
        circuitBreaker.open(10 * 60 * 1000); // 10분
        throw new DartMaintenanceError(message);

      case DartStatusCode.INVALID_KEY:
      case DartStatusCode.RESTRICTED_IP:
        // 010, 012: 인증 오류 - 재시도 불가
        throw new DartApiError(status, message, 403, false);

      default:
        // 기타 오류
        throw new DartApiError(status, message || 'Unknown DART API error', 500, retryCount < this.config.maxRetries);
    }
  }

  /**
   * 재시도 가능한 에러 판별
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof DartApiError) {
      return error.retryable;
    }

    // Network errors
    if (error.name === 'AbortError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * GET 요청 (범용)
   */
  async get<T = DartApiResponse>(
    endpoint: string,
    params: Record<string, any> = {},
    options: { jobId?: string; workerId?: string } = {}
  ): Promise<T> {
    const result = await this.fetchWithRetry<T>(endpoint, params, options);
    return result.data;
  }

  /**
   * Binary 다운로드 (XBRL zip 등)
   */
  async downloadBinary(
    endpoint: string,
    params: Record<string, any> = {},
    options: { jobId?: string; workerId?: string } = {}
  ): Promise<Buffer> {
    const result = await this.fetchWithRetry<ArrayBuffer>(endpoint, params, options);
    return Buffer.from(result.data);
  }
}

/**
 * Singleton Instance (환경변수에서 API 키 로드)
 */
let dartClientInstance: DartClient | null = null;

export function getDartClient(): DartClient {
  if (!dartClientInstance) {
    const apiKey = (process.env.DART_CRTFC_KEY || process.env.OPENDART_API_KEY || '').trim();

    if (!apiKey) {
      throw new Error('[DART Client] DART_CRTFC_KEY (or OPENDART_API_KEY) environment variable is not set');
    }

    dartClientInstance = new DartClient({
      apiKey,
      enableLogging: process.env.NODE_ENV !== 'production',
    });
  }

  return dartClientInstance;
}
