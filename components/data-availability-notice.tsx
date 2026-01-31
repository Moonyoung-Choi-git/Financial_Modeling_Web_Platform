'use client';

import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface DataAvailabilityNoticeProps {
  companyName: string;
  requestedYears: number[];
  availableYears: number[];
  isLoading?: boolean;
}

export default function DataAvailabilityNotice({
  companyName,
  requestedYears,
  availableYears,
  isLoading = false,
}: DataAvailabilityNoticeProps) {
  const availableSet = new Set(availableYears);
  const missingYears = requestedYears.filter((year) => !availableSet.has(year));
  const hasAllData = missingYears.length === 0;
  const hasPartialData = availableYears.length > 0 && missingYears.length > 0;
  const hasNoData = availableYears.length === 0;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 mt-0.5 animate-pulse" />
          <div>
            <h3 className="font-medium text-blue-900">Loading data...</h3>
            <p className="text-sm text-blue-700 mt-1">
              Retrieving financial data for {companyName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (hasAllData) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-900">Data available</h3>
            <p className="text-sm text-green-700 mt-1">
              Financial data for {companyName} is complete for years{' '}
              {formatYearRange(availableYears)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (hasNoData) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900">Data not available</h3>
            <p className="text-sm text-amber-700 mt-1">
              Financial data for {companyName} has not been loaded into the database yet.
            </p>
            <p className="text-sm text-amber-600 mt-2">
              Data is updated weekly. Check back later or contact an administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (hasPartialData) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900">Partial data available</h3>
            <p className="text-sm text-amber-700 mt-1">
              Financial data for {companyName} is being processed.
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-green-700">
                <span className="font-medium">Available years:</span>{' '}
                {formatYearRange(availableYears)}
              </p>
              <p className="text-amber-700">
                <span className="font-medium">Missing years:</span>{' '}
                {formatYearRange(missingYears)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Format a list of years into a readable range string
 * e.g., [2015, 2016, 2017, 2019, 2020] -> "2015-2017, 2019-2020"
 */
function formatYearRange(years: number[]): string {
  if (years.length === 0) return 'None';

  const sorted = [...years].sort((a, b) => a - b);
  const ranges: string[] = [];

  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }

  ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);

  return ranges.join(', ');
}
