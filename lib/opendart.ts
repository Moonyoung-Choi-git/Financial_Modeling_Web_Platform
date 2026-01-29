import { checkRateLimit } from './rate-limit';

const OPENDART_BASE_URL = 'https://opendart.fss.or.kr/api';

export async function fetchOpenDart(endpoint: string, params: Record<string, any>) {
  // Rate Limit 정책: 분당 100회 (OpenDART 기본 제한 고려하여 보수적 설정)
  // 필요 시 provider_rate_limits 테이블에서 조회하도록 고도화 가능
  await checkRateLimit('OPENDART', 100, 60);

  const apiKey = process.env.OPENDART_API_KEY;
  if (!apiKey) {
    throw new Error('OPENDART_API_KEY is not configured in .env');
  }

  // URL 구성
  const url = new URL(`${OPENDART_BASE_URL}/${endpoint}.json`);
  url.searchParams.append('crtfc_key', apiKey);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  // API 호출
  const response = await fetch(url.toString());

  if (response.status === 429) {
    throw new Error('OpenDART Rate Limit Exceeded (HTTP 429)');
  }

  if (!response.ok) {
    throw new Error(`OpenDART API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // OpenDART 비즈니스 로직 에러 처리 (status '000'이 아니면 에러)
  if (data.status && data.status !== '000') {
    throw new Error(`OpenDART Business Error: ${data.message} (Code: ${data.status})`);
  }

  return {
    payload: data,
    etag: response.headers.get('etag') || undefined,
  };
}