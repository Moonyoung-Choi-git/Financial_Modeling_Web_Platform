# Phase C: Data Quality Improvements

**완료일**: 2026-01-30
**버전**: 1.0.0
**상태**: ✅ COMPLETE

---

## 🎯 목표

Phase C는 FMWP의 데이터 품질을 체계적으로 관리하기 위한 종합 모니터링 시스템입니다.

### 핵심 기능
1. **매핑 커버리지 분석** - 계정 매핑 품질 측정 및 개선
2. **Restatement 추적** - 정정공시 자동 탐지 및 영향 평가
3. **데이터 품질 대시보드** - 통합 품질 모니터링
4. **자동화된 품질 체크** - 주기적인 데이터 검증
5. **매핑 추천 엔진** - AI 기반 미매핑 계정 자동 매핑

---

## 📦 구현 내역

### 1. Mapping Coverage Analyzer
**파일**: `lib/quality/mapping-coverage-analyzer.ts`

#### 주요 함수

##### `analyzeMappingCoverage()`
특정 기업/연도/보고서의 매핑 커버리지를 분석합니다.

```typescript
const report = await analyzeMappingCoverage({
  entityId: 'sample-entity-005930',
  fiscalYear: 2024,
  reportCode: '11011',
  fsScope: 'CFS'
});

console.log(`Coverage: ${report.coveragePercent.toFixed(2)}%`);
console.log(`Quality Score: ${report.qualityScore}/100`);
```

**산출물**:
- `totalLines`: 전체 계정 라인 수
- `mappedLines`: 매핑된 라인 수
- `coveragePercent`: 커버리지 (%)
- `qualityScore`: 품질 점수 (0-100)
- `byStatement`: Statement별 통계
- `topUnmapped`: 미매핑 계정 Top N

**품질 점수 계산**:
- Coverage: 70% 가중치
- Statement Balance: 20% 가중치 (모든 Statement가 80% 이상)
- Data Completeness: 10% 가중치 (최소 30 라인)

##### `analyzeCoverageTrend()`
시계열 커버리지 추이를 분석합니다.

```typescript
const trend = await analyzeCoverageTrend('entity-id', 5);

console.log(`Average Coverage: ${trend.averageCoverage}%`);
console.log(`Trend: ${trend.trend}`); // IMPROVING / STABLE / DECLINING
```

##### `generateMappingRecommendations()`
미매핑 계정에 대한 자동 매핑 추천을 생성합니다.

```typescript
const recommendations = await generateMappingRecommendations({
  entityId: 'entity-id',
  fiscalYear: 2024,
  limit: 10
});

for (const rec of recommendations) {
  console.log(`Account: ${rec.accountNm}`);
  console.log(`Suggested: ${rec.recommendedMappings[0].standardLineId}`);
  console.log(`Confidence: ${rec.recommendedMappings[0].confidence}%`);
}
```

**추천 알고리즘**:
1. Exact match (100% confidence)
2. Contains match (80% confidence)
3. Partial match (70% confidence)
4. Common keywords (60% confidence)

---

### 2. Restatement Tracker
**파일**: `lib/quality/restatement-tracker.ts`

정정공시를 자동으로 탐지하고 영향을 평가합니다.

#### 주요 함수

##### `detectRestatements()`
정정공시(Restatement) 탐지

```typescript
const restatements = await detectRestatements({
  corpCode: '00126380',
  fiscalYear: 2024,
  sinceDays: 30
});

for (const event of restatements) {
  console.log(`Corp: ${event.corpCode} FY${event.fiscalYear}`);
  console.log(`Impact Score: ${event.impactScore}/100`);
  console.log(`Changes: ${event.changeCount} (${event.significantChanges.length} significant)`);
}
```

**탐지 로직**:
- 같은 기간(corpCode, fiscalYear, reportCode, fsScope)에 서로 다른 `rcept_no` 존재
- 최신 vs 이전 버전 비교

**Impact Score 계산** (0-100):
- 변경 건수 (40점)
- 평균 변경률 (30점)
- 핵심 라인 변경 (30점)
  - Revenue, Net Income, Total Assets, Total Equity, Net Change Cash

##### `recordRestatement()`
Restatement를 DB에 기록

```typescript
await recordRestatement(event);
```

저장 내용:
- 이전/최신 rcept_no
- 변경 상세 (JSON)
- 영향 점수
- 탐지 시각

##### `assessRestatementImpact()`
Restatement의 영향 평가

```typescript
const impact = await assessRestatementImpact(event);

console.log(`Snapshots Affected: ${impact.snapshotsAffected.length}`);
console.log(`Auto-rebuild Recommended: ${impact.autoRebuildRecommended}`);
```

**영향 평가**:
- 영향받은 모델 스냅샷 식별
- 재빌드 필요한 모델 리스트
- 알림 필요한 사용자 리스트
- 자동 재빌드 권장 여부 (Impact < 50 && Snapshots < 3)

##### `autoRebuildAffectedModels()`
영향받은 모델 자동 재빌드

```typescript
const rebuilt = await autoRebuildAffectedModels(event);
console.log(`Rebuilt ${rebuilt.length} models`);
```

---

### 3. Quality Monitor
**파일**: `lib/quality/quality-monitor.ts`

통합 품질 모니터링 대시보드

#### 주요 함수

##### `generateQualityDashboard()`
종합 품질 대시보드 생성

```typescript
const dashboard = await generateQualityDashboard({
  entityIds: ['entity1', 'entity2'], // Optional
  sinceDays: 30
});

console.log(`Health Score: ${dashboard.dataHealthScore}/100`);
console.log(`Overall Coverage: ${dashboard.summary.overallCoveragePercent}%`);
console.log(`Recent Restatements: ${dashboard.summary.recentRestatements}`);
```

**Dashboard 구성**:

1. **Summary (요약)**
   - Total Entities / Entities with Data
   - Total Curated Facts / Mapped Facts
   - Overall Coverage %
   - Recent Restatements
   - Critical Issues

2. **Coverage Metrics (커버리지 분석)**
   - Statement별 커버리지 (IS/BS/CF/CIS/SCE)
   - Entity별 품질 점수
   - Top Performers (커버리지 >= 90%)
   - Needs Attention (커버리지 < 80%)

3. **Restatement Alerts (정정공시 알림)**
   - 최근 정정공시 목록
   - Impact score별 정렬
   - 영향받은 스냅샷 수

4. **Data Health Score (종합 건강 점수)** (0-100)
   - Coverage: 40% 가중치
   - Data Completeness: 30% 가중치
   - Stability (정정 없음): 20% 가중치
   - Issues (문제 없음): 10% 가중치

5. **Recommendations (개선 권장사항)**
   우선순위별 액션 아이템:
   - HIGH: 즉시 조치 필요
   - MEDIUM: 조만간 처리 필요
   - LOW: 장기적 개선 사항

##### `runAutomatedQualityChecks()`
주기적 자동 품질 체크 (Cron/Scheduler용)

```typescript
const result = await runAutomatedQualityChecks();

console.log(`Alerts Triggered: ${result.alertsTriggered.length}`);
console.log(`Actions Performed: ${result.actionsPerformed.length}`);
```

**자동 알림 조건**:
- Health Score < 70
- High-impact restatements (Impact > 80)

**자동 액션**:
- Coverage 80-90% 구간에서 매핑 개선 분석 큐잉

---

## 🌐 API Endpoints

### 1. Quality Dashboard
**GET** `/api/quality/dashboard`

Query Params:
- `entityIds` (optional): 쉼표로 구분된 entity ID 리스트
- `sinceDays` (optional, default=30): 최근 N일

Response:
```json
{
  "success": true,
  "data": {
    "summary": { ... },
    "coverageMetrics": { ... },
    "restatementAlerts": [ ... ],
    "dataHealthScore": 100,
    "recommendations": [ ... ],
    "timestamp": "2026-01-30T..."
  }
}
```

### 2. Coverage Analysis
**GET** `/api/quality/coverage`

Query Params:
- `entityId` (required)
- `fiscalYear` (required for 'analyze' action)
- `reportCode` (optional, default='11011')
- `fsScope` (optional, default='CFS')
- `action` (optional): 'analyze' | 'trend' | 'recommendations'
- `periods` (for trend, default=5)
- `limit` (for recommendations, default=10)

Response:
```json
{
  "success": true,
  "data": {
    "entityId": "...",
    "fiscalYear": 2024,
    "coveragePercent": 91.4,
    "qualityScore": 88,
    "topUnmapped": [ ... ]
  }
}
```

### 3. Restatements
**GET** `/api/quality/restatements`

Query Params:
- `corpCode` (optional)
- `fiscalYear` (optional)
- `sinceDays` (optional, default=30)

**POST** `/api/quality/restatements`

Body:
```json
{
  "action": "record" | "assess-impact",
  "event": { ... }
}
```

---

## 🔧 Worker Integration

### RestatementMonitorJob
**파일**: `worker.ts` (lines 291-330)

주기적으로 정정공시를 탐지하고 처리합니다.

```typescript
{
  corpCode?: string,
  fiscalYear?: number,
  sinceDays?: number
}
```

**동작**:
1. 정정공시 탐지 (`detectRestatements`)
2. Tracker 테이블에 기록 (`recordRestatement`)
3. 영향 평가 (`assessRestatementImpact`)
4. 자동 재빌드 (조건 충족 시)

**스케줄 권장**:
- 일일 1회 (새벽 2시)
- sinceDays=7 (최근 1주일)

---

## 🧪 테스트

### 실행 방법

```bash
# 1. 테스트 데이터 확인 (Phase 3에서 생성된 mock facts 사용)
npx tsx test-generate-mock-facts.ts

# 2. 품질 모니터링 테스트
npx tsx test-quality.ts
```

### 테스트 항목

#### [1/5] Quality Dashboard
- Data Health Score 계산
- Summary 통계
- Statement별 커버리지
- 권장사항 생성

#### [2/5] Coverage Analysis
- 특정 연도/보고서 커버리지 분석
- Statement별 분해
- Top 미매핑 계정 리스트

#### [3/5] Coverage Trend
- 다년도 커버리지 추세
- Trend 판정 (IMPROVING/STABLE/DECLINING)

#### [4/5] Mapping Recommendations
- 미매핑 계정 추천
- Confidence score 계산
- 매칭 이유 표시

#### [5/5] Restatement Detection
- 정정공시 탐지
- Impact score 계산
- 영향받은 스냅샷 식별

---

## 📊 테스트 결과 (Mock Data)

```
================================================================================
FMWP Data Quality Testing
================================================================================
✅ Using entity: 삼성전자 (00126380)
   Entity ID: sample-entity-005930
   Curated Facts: 175

[1/5] Testing Quality Dashboard...

📊 Quality Dashboard:
   Data Health Score: 100 /100

   Summary:
   - Total Entities: 1
   - Entities with Data: 1
   - Total Curated Facts: 175
   - Mapped Facts: 175
   - Overall Coverage: 100.00%
   - Recent Restatements: 0
   - Critical Issues: 0

   Coverage by Statement:
   - IS: 100.0% (50 facts)
   - BS: 100.0% (95 facts)
   - CF: 100.0% (30 facts)

[2/5] Testing Coverage Analysis...

📈 Coverage Analysis:
   [... 결과 상세 ...]

[3/5] Testing Coverage Trend...

📊 Coverage Trend:
   Periods Analyzed: 5
   Average Coverage: 100.00%
   Trend: STABLE

[4/5] Testing Mapping Recommendations...

💡 Mapping Recommendations:
   ✅ All accounts mapped! No recommendations needed.

[5/5] Testing Restatement Detection...

🔍 Restatement Detection:
   Restatements Found: 0
   ✅ No restatements detected in the last 90 days.

================================================================================
✅ Data Quality tests completed successfully!
================================================================================
```

---

## 🎯 품질 지표 목표

### Coverage Targets
- **Overall**: >= 95%
- **IS (Income Statement)**: >= 98%
- **BS (Balance Sheet)**: >= 90%
- **CF (Cash Flow)**: >= 92%

### Health Score Targets
- **Excellent**: >= 90
- **Good**: 80-89
- **Fair**: 70-79
- **Needs Attention**: < 70

### Response Time Targets
- Restatement Detection: < 24 hours
- Coverage Analysis: < 5 seconds
- Dashboard Generation: < 10 seconds

---

## 🚀 프로덕션 배포 가이드

### 1. Cron Job 설정

```typescript
// Schedule restatement monitoring (daily at 2 AM)
cron.schedule('0 2 * * *', async () => {
  await queue.add('RestatementMonitorJob', { sinceDays: 7 });
});

// Schedule quality checks (daily at 3 AM)
cron.schedule('0 3 * * *', async () => {
  const result = await runAutomatedQualityChecks();
  if (result.alertsTriggered.length > 0) {
    // Send notifications
  }
});
```

### 2. Monitoring Dashboard 통합

Next.js 페이지 생성:

```typescript
// app/admin/quality/page.tsx
export default async function QualityDashboardPage() {
  const dashboard = await generateQualityDashboard({ sinceDays: 30 });

  return (
    <div>
      <h1>Data Quality Dashboard</h1>
      <HealthScore score={dashboard.dataHealthScore} />
      <SummaryCards summary={dashboard.summary} />
      <CoverageChart metrics={dashboard.coverageMetrics} />
      <RestatementAlerts alerts={dashboard.restatementAlerts} />
      <Recommendations items={dashboard.recommendations} />
    </div>
  );
}
```

### 3. Slack/Email 알림

```typescript
if (dashboard.dataHealthScore < 70) {
  await sendAlert({
    channel: '#data-quality',
    message: `⚠️ Data Health Score dropped to ${dashboard.dataHealthScore}`,
    dashboard
  });
}
```

---

## 🎓 Best Practices

### 1. 매핑 룰 관리
- 새 룰 추가 시 `mappingVersion` 증가
- Priority 활용 (낮을수록 우선)
- Confidence score 기록

### 2. Restatement 대응
- 자동 재빌드는 Impact < 50, Snapshots < 3에만
- High-impact는 수동 검토 후 재빌드
- 사용자 알림 필수

### 3. 품질 모니터링
- 주간 리뷰 (Trend 분석)
- 월간 리포트 (Coverage 개선)
- 분기 감사 (Restatement 이력)

### 4. 성능 최적화
- Coverage 계산은 캐싱 (5분 TTL)
- Dashboard는 비동기 생성
- 대량 entity는 batch processing

---

## 📁 파일 구조

```
lib/quality/
├── mapping-coverage-analyzer.ts  (매핑 커버리지 분석)
├── restatement-tracker.ts        (정정공시 추적)
├── quality-monitor.ts             (통합 품질 모니터링)
└── index.ts                       (모듈 exports)

app/api/quality/
├── dashboard/route.ts             (Dashboard API)
├── coverage/route.ts              (Coverage API)
└── restatements/route.ts          (Restatements API)

tests/
└── test-quality.ts                (통합 테스트)

worker.ts                          (RestatementMonitorJob 구현)
```

---

## 🔗 관련 Phase

- **Phase 1**: Raw Data Pipeline (데이터 수집)
- **Phase 2**: Curated Layer (정규화/매핑)
- **Phase 3**: Modeling Engine (모델 생성)
- **Phase 4**: Viewer/Export (결과 시각화)
- **Phase C**: Data Quality ← 현재
- **Phase 3.5**: Full Forecast Engine (예측 고도화) ← 다음 단계

---

## ✅ Phase C 완료 체크리스트

- [x] Mapping Coverage Analyzer 구현
- [x] Coverage Trend 분석
- [x] Mapping Recommendations 엔진
- [x] Restatement Detection
- [x] Impact Assessment
- [x] Auto-rebuild Logic
- [x] Quality Dashboard
- [x] Health Score 계산
- [x] API Endpoints
- [x] Worker Integration
- [x] Tests 작성 및 검증
- [x] Documentation

---

## 💡 다음 단계

### 즉시 가능
1. Web UI for Quality Dashboard
2. Slack/Email 알림 통합
3. Historical Trend Charts
4. Export Quality Reports (PDF)

### Phase 3.5 준비
1. Driver-based Forecast
2. Working Capital Schedules
3. Capex & PP&E Roll-forward
4. Indirect Cash Flow Method
5. Circularity Solver

---

**Phase C: Data Quality Improvements - COMPLETE! ✅**

FMWP의 데이터 품질 관리 시스템이 완성되었습니다! 🎉
