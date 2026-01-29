import { Queue } from 'bullmq';
import { redis } from './redis';

export const INGESTION_QUEUE_NAME = 'ingestion-queue';

// 큐 생성 (Producer용)
export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100, // 성공한 작업 로그 100개 유지
    removeOnFail: 500,     // 실패한 작업 로그 500개 유지
  },
});

export type IngestionJobData = {
  taskId: string; // DB의 fetch_jobs.id
};