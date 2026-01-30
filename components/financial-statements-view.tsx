'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils'; 
import IncomeStatementTable from '@/components/income-statement-table';

interface ViewProps {
  data: any;
  years: number[];
}

type StatementType = 'IS' | 'BS' | 'CF';

export default function FinancialStatementsView({ data, years }: ViewProps) {
  const [activeTab, setActiveTab] = useState<StatementType>('IS');

  // 현재 활성화된 탭(Statement)에 존재하는 모든 계정 코드 수집 (연도별 합집합)
  const allAccountCodes = new Set<string>();
  years.forEach(year => {
    const statement = data[year]?.[activeTab];
    if (statement) {
      Object.keys(statement).forEach(code => allAccountCodes.add(code));
    }
  });
  
  // 계정 코드 정렬 (표준 코드가 알파벳/숫자 순으로 정렬됨)
  const sortedCodes = Array.from(allAccountCodes).sort();

  return (
    <div className="w-full bg-white rounded-lg border shadow-sm">
      {/* 탭 네비게이션 */}
      <div className="flex border-b">
        {(['IS', 'BS', 'CF'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-3 text-sm font-medium transition-colors outline-none",
              activeTab === tab 
                ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50/50" 
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            {tab === 'IS' ? 'Income Statement' : 
             tab === 'BS' ? 'Balance Sheet' : 'Cash Flow'}
          </button>
        ))}
      </div>

      {activeTab === 'IS' ? (
        <IncomeStatementTable data={data} years={years} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-gray-700 uppercase">
              <tr>
                <th className="px-6 py-3 border-b">Account</th>
                {years.map(year => (
                  <th key={year} className="px-6 py-3 text-right border-b">
                    {year}
                    {/* 해당 연도의 데이터 출처(연결/개별) 표시 */}
                    <div className="text-[10px] text-gray-400 font-normal normal-case">
                      {data[year]?.meta?.fsDiv || '-'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCodes.map((code) => {
                // 계정 이름은 가장 최신 연도의 데이터를 우선 사용
                // (과거 연도에는 없고 최신 연도에만 있는 계정일 수도 있음)
                let accountName = code;
                for (let i = years.length - 1; i >= 0; i--) {
                  const item = data[years[i]]?.[activeTab]?.[code];
                  if (item?.name) {
                    accountName = item.name;
                    break;
                  }
                }

                return (
                  <tr key={code} className="border-b hover:bg-gray-50 last:border-0">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {accountName}
                      {/* 표준 코드가 아닌 경우 원본 계정명 표기 (디버깅용) */}
                      <div className="text-xs text-gray-400 font-normal truncate max-w-[200px]">
                        {code}
                      </div>
                    </td>
                    {years.map(year => {
                      const cell = data[year]?.[activeTab]?.[code];
                      return (
                        <td key={year} className="px-6 py-3 text-right font-mono text-gray-700">
                          {cell?.value !== undefined
                            ? cell.value.toLocaleString() 
                            : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              
              {sortedCodes.length === 0 && (
                <tr>
                  <td colSpan={years.length + 1} className="px-6 py-12 text-center text-gray-500">
                    No data available for this view.
                    <br />
                    <span className="text-xs text-gray-400">
                      Auto-ingestion may have failed or no data exists for these years.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
