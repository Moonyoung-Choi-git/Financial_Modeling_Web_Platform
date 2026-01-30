/**
 * DART API Type Definitions
 * Based on FMWP Spec Section 2: DART Data Collection Requirements
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface DartApiResponse<T = any> {
  status: string; // "000" = success, "010" = invalid key, "013" = no data, "020" = rate limit, etc
  message: string;
  [key: string]: any;
}

export interface DartListResponse extends DartApiResponse {
  list: DartFilingItem[];
}

export interface DartFilingItem {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
  corp_cls?: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string; // YYYYMMDD
  rm?: string;
  corp_eng_name?: string;
  pblntf_ty?: string; // A001, A002, etc
  pblntf_detail_ty?: string;
}

// fnlttSinglAcnt (주요계정) Response
export interface DartFnlttKeyResponse extends DartApiResponse {
  list: DartFnlttKeyItem[];
}

export interface DartFnlttKeyItem {
  rcept_no: string;
  reprt_code: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string; // BS, IS
  sj_nm: string;
  account_nm: string;
  thstrm_nm?: string;
  thstrm_amount?: string;
  frmtrm_nm?: string;
  frmtrm_amount?: string;
  bfefrmtrm_nm?: string;
  bfefrmtrm_amount?: string;
  ord?: string;
}

// fnlttSinglAcntAll (전체 재무제표) Response
export interface DartFnlttAllResponse extends DartApiResponse {
  list: DartFnlttAllItem[];
}

export interface DartFnlttAllItem {
  rcept_no: string;
  reprt_code: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string; // BS, IS, CIS, CF, SCE
  sj_nm: string;
  account_id?: string;
  account_nm: string;
  account_detail?: string;
  thstrm_nm?: string;
  thstrm_amount?: string;
  thstrm_add_amount?: string; // 누적 (분기)
  frmtrm_nm?: string;
  frmtrm_amount?: string;
  frmtrm_add_amount?: string;
  frmtrm_q_nm?: string;
  frmtrm_q_amount?: string;
  bfefrmtrm_nm?: string;
  bfefrmtrm_amount?: string;
  ord?: string;
  currency?: string;
}

// ============================================================================
// Request Parameter Types
// ============================================================================

export interface DartListParams {
  corp_code?: string;
  bgn_de: string; // YYYYMMDD
  end_de: string; // YYYYMMDD
  last_reprt_at?: 'Y' | 'N'; // 최종보고서만 조회 여부
  pblntf_ty?: string; // A001, A002, etc
  pblntf_detail_ty?: string;
  page_no?: number;
  page_count?: number;
}

export interface DartFnlttKeyParams {
  corp_code: string;
  bsns_year: string; // YYYY
  reprt_code: string; // 11011, 11012, 11013, 11014
}

export interface DartFnlttAllParams {
  corp_code: string;
  bsns_year: string;
  reprt_code: string;
  fs_div: 'CFS' | 'OFS'; // 연결 / 개별
}

export interface DartXbrlParams {
  rcept_no: string;
  reprt_code: string;
}

// ============================================================================
// DART Status Codes (명세서 Section 2.5)
// ============================================================================

export enum DartStatusCode {
  SUCCESS = '000',
  INVALID_KEY = '010',
  RESTRICTED_IP = '012',
  NO_DATA = '013',
  RATE_LIMIT = '020',
  MAINTENANCE = '800',
  GENERAL_ERROR = '900',
  OTHER_ERROR = '901',
}

// ============================================================================
// API Call Metadata (명세서 Section 2.5 - API Call Ledger)
// ============================================================================

export interface ApiCallMetadata {
  endpoint: string;
  paramsCanonical: string; // 정렬된 key=value 형태
  requestedAt: Date;
  completedAt?: Date;
  latencyMs?: number;
  httpStatus?: number;
  dartStatus?: string;
  dartMessage?: string;
  responseFormat: 'json' | 'xml' | 'zip';
  payloadHash?: string;
  payloadSize?: number;
  retryCount: number;
  jobId?: string;
  workerId?: string;
}

// ============================================================================
// Corp Master (corpCode.xml)
// ============================================================================

export interface CorpCodeItem {
  corp_code: string;
  corp_name: string;
  stock_code?: string;
  corp_cls?: string;
  modify_date: string; // YYYYMMDD
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface DartClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableLogging?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export class DartApiError extends Error {
  constructor(
    public statusCode: string,
    message: string,
    public httpStatus?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'DartApiError';
  }
}

export class DartRateLimitError extends DartApiError {
  constructor(message: string = 'DART API rate limit exceeded') {
    super(DartStatusCode.RATE_LIMIT, message, 429, true);
    this.name = 'DartRateLimitError';
  }
}

export class DartMaintenanceError extends DartApiError {
  constructor(message: string = 'DART API is under maintenance') {
    super(DartStatusCode.MAINTENANCE, message, 503, true);
    this.name = 'DartMaintenanceError';
  }
}

export class DartNoDataError extends DartApiError {
  constructor(message: string = 'No data available') {
    super(DartStatusCode.NO_DATA, message, 200, false);
    this.name = 'DartNoDataError';
  }
}
