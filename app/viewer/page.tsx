/**
 * Snapshots List Page
 * Lists all available model snapshots
 */

import Link from 'next/link';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function SnapshotsListPage() {
  const snapshots = await prisma.modelSnapshot.findMany({
    include: {
      entity: {
        select: {
          displayName: true,
          corpCode: true,
          stockCode: true,
        },
      },
      _count: {
        select: {
          outputLines: true,
          viewerSheets: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-5 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Model Snapshots</h1>
            <p className="mt-1 text-sm text-gray-600">
              {snapshots.length} snapshots available
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Snapshot ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Engine
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Output Lines
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Viewer Sheets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {snapshot.entity?.displayName || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {snapshot.entity?.corpCode}
                        {snapshot.entity?.stockCode && ` (${snapshot.entity.stockCode})`}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono text-gray-600">
                        {snapshot.id.slice(0, 24)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {snapshot.calcEngineVersion}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {snapshot._count.outputLines}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {snapshot._count.viewerSheets > 0 ? (
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {snapshot._count.viewerSheets} sheets
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(snapshot.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/viewer/${snapshot.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {snapshots.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-500">No snapshots found</p>
              <p className="text-sm text-gray-400 mt-1">
                Run BuildModelSnapshotJob to create a model snapshot
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
