import { Worker } from 'bullmq';
import { redis } from './lib/redis';
import { processIngestionTask } from './lib/ingestion';
import { refineFinancialData } from './lib/refinement';
import { buildThreeStatementModel } from './lib/modeling/builder';
import { INGESTION_QUEUE_NAME } from './lib/queue';

console.log('[Worker] Starting worker...');

const worker = new Worker(
  INGESTION_QUEUE_NAME,
  async (job) => {
    // 1. 데이터 수집 및 정제 작업 (Ingestion Task)
    if (job.name === 'ingestion' || job.data.taskId) {
      console.log(`[Worker] Processing Ingestion Job ${job.id} (Task: ${job.data.taskId})`);
      const rawArchiveId = await processIngestionTask(job.data.taskId);

      if (rawArchiveId) {
        console.log(`[Worker] Starting refinement for archive ${rawArchiveId}...`);
        const count = await refineFinancialData(rawArchiveId);
        console.log(`[Worker] Refinement completed. ${count} accounts mapped.`);
      }
    } 
    // 2. 모델링 생성 작업 (Modeling Task)
    else if (job.name === 'modeling') {
      console.log(`[Worker] Processing Modeling Job ${job.id} (Ticker: ${job.data.ticker})`);
      
      try {
        const result = await buildThreeStatementModel({
          ticker: job.data.ticker,
          years: job.data.years, // e.g., [2022, 2023, 2024]
        });
        
        // 실제 운영 시에는 결과를 DB(ModelOutput)에 저장하거나 캐시 서버에 올립니다.
        // 여기서는 로그로 결과를 확인합니다.
        const yearsBuilt = Object.keys(result);
        console.log(`[Worker] Model built for ${job.data.ticker}. Years: ${yearsBuilt.join(', ')}`);
        
        return result;
      } catch (error: any) {
        console.error(`[Worker] Modeling failed for ${job.data.ticker}:`, error);
        throw error;
      }
    }
  },
  {
    connection: redis,
    concurrency: 5, // 동시에 처리할 작업 수
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

console.log(`[Worker] Listening on queue: ${INGESTION_QUEUE_NAME}`);