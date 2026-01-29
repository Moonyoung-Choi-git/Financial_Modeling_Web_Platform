import { buildThreeStatementModel } from '@/lib/modeling/builder';
import FinancialStatementsView from '@/components/financial-statements-view';

interface PageProps {
  params: { ticker: string };
}

export const dynamic = 'force-dynamic';

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = params;
  
  // 현재 연도 기준 최근 3년치 데이터 모델링 요청
  // (실제 운영 시에는 DB 캐시를 먼저 조회하고 없으면 생성하는 로직 권장)
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 3, currentYear - 2, currentYear - 1];
  
  let modelData = {};
  let error = null;

  try {
    modelData = await buildThreeStatementModel({
      ticker,
      years,
      fsDivPriority: ['CFS', 'OFS'] // 연결 우선, 없으면 개별
    });
  } catch (e: any) {
    console.error('Modeling error:', e);
    error = e.message;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Financial Statements: {ticker}</h1>
        <p className="text-gray-500">
          Historical 3-Statement Model (Source: DART Open API)
        </p>
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-md">
            Error loading model: {error}
          </div>
        )}
      </div>

      {/* 데이터 뷰어 컴포넌트 */}
      <FinancialStatementsView 
        data={modelData} 
        years={years}
      />
    </div>
  );
}