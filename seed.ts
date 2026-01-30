import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting seed process...');

  // ============================================================================
  // Section 1: Standard Chart of Accounts (명세서 부록 B)
  // ============================================================================

  console.log('[Seed] Creating Standard COA...');

  const coaData = [
    // ========== Income Statement (IS) ==========
    { id: 'IS.REVENUE', type: 'IS', nameEn: 'Revenue', nameKr: '매출액', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'IS.COGS', type: 'IS', nameEn: 'Cost of Goods Sold', nameKr: '매출원가', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'IS.GROSS_PROFIT', type: 'IS', nameEn: 'Gross Profit', nameKr: '매출총이익', sign: '+', required: true, calc: 'DERIVED' },
    { id: 'IS.SGA', type: 'IS', nameEn: 'SG&A', nameKr: '판매비와관리비', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'IS.EBITDA', type: 'IS', nameEn: 'EBITDA', nameKr: 'EBITDA', sign: '+', required: false, calc: 'DERIVED' },
    { id: 'IS.DA', type: 'IS', nameEn: 'Depreciation & Amortization', nameKr: '감가상각비', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'IS.EBIT', type: 'IS', nameEn: 'EBIT', nameKr: '영업이익', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'IS.INTEREST_EXPENSE', type: 'IS', nameEn: 'Interest Expense', nameKr: '이자비용', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'IS.INTEREST_INCOME', type: 'IS', nameEn: 'Interest Income', nameKr: '이자수익', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'IS.OTHER_INCOME', type: 'IS', nameEn: 'Other Income', nameKr: '기타수익', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'IS.OTHER_EXPENSE', type: 'IS', nameEn: 'Other Expense', nameKr: '기타비용', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'IS.EBT', type: 'IS', nameEn: 'Earnings Before Tax', nameKr: '법인세비용차감전순이익', sign: '+', required: true, calc: 'DERIVED' },
    { id: 'IS.TAXES', type: 'IS', nameEn: 'Income Tax Expense', nameKr: '법인세비용', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'IS.NET_INCOME', type: 'IS', nameEn: 'Net Income', nameKr: '당기순이익', sign: '+', required: true, calc: 'SOURCE' },

    // ========== Balance Sheet - Assets (BS) ==========
    { id: 'BS.CASH', type: 'BS', nameEn: 'Cash & Cash Equivalents', nameKr: '현금및현금성자산', sign: '+', required: true, calc: 'PLUG' },
    { id: 'BS.ST_FIN_ASSETS', type: 'BS', nameEn: 'Short-term Financial Assets', nameKr: '단기금융자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.AR', type: 'BS', nameEn: 'Accounts Receivable', nameKr: '매출채권', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.OTHER_REC', type: 'BS', nameEn: 'Other Receivables', nameKr: '기타채권', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.INVENTORY', type: 'BS', nameEn: 'Inventory', nameKr: '재고자산', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.PREPAID', type: 'BS', nameEn: 'Prepaid Expenses', nameKr: '선급비용', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.OTHER_CA', type: 'BS', nameEn: 'Other Current Assets', nameKr: '기타유동자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TOTAL_CA', type: 'BS', nameEn: 'Total Current Assets', nameKr: '유동자산', sign: '+', required: true, calc: 'DERIVED' },

    { id: 'BS.LT_FIN_ASSETS', type: 'BS', nameEn: 'Long-term Financial Assets', nameKr: '장기금융자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.INVEST_ASSOC', type: 'BS', nameEn: 'Investments in Associates', nameKr: '관계기업투자', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.INVEST_PROP', type: 'BS', nameEn: 'Investment Property', nameKr: '투자부동산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.PPE_GROSS', type: 'BS', nameEn: 'PP&E (Gross)', nameKr: '유형자산(총액)', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.ACCUMULATED_DEP', type: 'BS', nameEn: 'Accumulated Depreciation', nameKr: '감가상각누계액', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'BS.PPE_NET', type: 'BS', nameEn: 'PP&E (Net)', nameKr: '유형자산(순액)', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.ROU_ASSET', type: 'BS', nameEn: 'Right-of-Use Assets', nameKr: '사용권자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.INTANGIBLES', type: 'BS', nameEn: 'Intangible Assets', nameKr: '무형자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.DTA', type: 'BS', nameEn: 'Deferred Tax Assets', nameKr: '이연법인세자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.OTHER_NCA', type: 'BS', nameEn: 'Other Non-Current Assets', nameKr: '기타비유동자산', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TOTAL_NCA', type: 'BS', nameEn: 'Total Non-Current Assets', nameKr: '비유동자산', sign: '+', required: false, calc: 'DERIVED' },
    { id: 'BS.TOTAL_ASSETS', type: 'BS', nameEn: 'Total Assets', nameKr: '자산총계', sign: '+', required: true, calc: 'DERIVED' },

    // ========== Balance Sheet - Liabilities (BS) ==========
    { id: 'BS.AP', type: 'BS', nameEn: 'Accounts Payable', nameKr: '매입채무', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.OTHER_CL', type: 'BS', nameEn: 'Other Current Liabilities', nameKr: '기타유동부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.SHORT_DEBT', type: 'BS', nameEn: 'Short-term Debt', nameKr: '단기차입금', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.CURRENT_PORTION_LTD', type: 'BS', nameEn: 'Current Portion of LT Debt', nameKr: '유동성장기부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TOTAL_CL', type: 'BS', nameEn: 'Total Current Liabilities', nameKr: '유동부채', sign: '+', required: true, calc: 'DERIVED' },

    { id: 'BS.LONG_DEBT', type: 'BS', nameEn: 'Long-term Debt', nameKr: '장기차입금', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.BONDS', type: 'BS', nameEn: 'Bonds Payable', nameKr: '사채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.LEASE_LIAB', type: 'BS', nameEn: 'Lease Liabilities', nameKr: '리스부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.DTL', type: 'BS', nameEn: 'Deferred Tax Liabilities', nameKr: '이연법인세부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.PROVISIONS', type: 'BS', nameEn: 'Provisions', nameKr: '충당부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.OTHER_NCL', type: 'BS', nameEn: 'Other Non-Current Liabilities', nameKr: '기타비유동부채', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TOTAL_NCL', type: 'BS', nameEn: 'Total Non-Current Liabilities', nameKr: '비유동부채', sign: '+', required: false, calc: 'DERIVED' },
    { id: 'BS.TOTAL_LIABILITIES', type: 'BS', nameEn: 'Total Liabilities', nameKr: '부채총계', sign: '+', required: true, calc: 'DERIVED' },

    // ========== Balance Sheet - Equity (BS) ==========
    { id: 'BS.COMMON_STOCK', type: 'BS', nameEn: 'Common Stock', nameKr: '자본금', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.APIC', type: 'BS', nameEn: 'Additional Paid-in Capital', nameKr: '주식발행초과금', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.OTHER_EQUITY', type: 'BS', nameEn: 'Other Equity', nameKr: '기타자본', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.RETAINED_EARNINGS', type: 'BS', nameEn: 'Retained Earnings', nameKr: '이익잉여금', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'BS.OCI', type: 'BS', nameEn: 'Accumulated OCI', nameKr: '기타포괄손익누계액', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TREASURY_STOCK', type: 'BS', nameEn: 'Treasury Stock', nameKr: '자기주식', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'BS.NCI', type: 'BS', nameEn: 'Non-controlling Interests', nameKr: '비지배지분', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'BS.TOTAL_EQUITY', type: 'BS', nameEn: 'Total Equity', nameKr: '자본총계', sign: '+', required: true, calc: 'DERIVED' },

    // ========== Cash Flow - Operating (CF) ==========
    { id: 'CF.NI_START', type: 'CF', nameEn: 'Net Income', nameKr: '당기순이익', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'CF.DA', type: 'CF', nameEn: 'D&A', nameKr: '감가상각비', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'CF.DELTA_AR', type: 'CF', nameEn: '(Increase)/Decrease in AR', nameKr: '매출채권 증감', sign: '-', required: false, calc: 'DERIVED' },
    { id: 'CF.DELTA_INV', type: 'CF', nameEn: '(Increase)/Decrease in Inventory', nameKr: '재고자산 증감', sign: '-', required: false, calc: 'DERIVED' },
    { id: 'CF.DELTA_AP', type: 'CF', nameEn: 'Increase/(Decrease) in AP', nameKr: '매입채무 증감', sign: '+', required: false, calc: 'DERIVED' },
    { id: 'CF.DELTA_OTHER_WC', type: 'CF', nameEn: 'Other Working Capital Changes', nameKr: '기타운전자본 증감', sign: '+', required: false, calc: 'DERIVED' },
    { id: 'CF.OTHER_NONCASH', type: 'CF', nameEn: 'Other Non-cash Items', nameKr: '기타비현금항목', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.INTEREST_PAID', type: 'CF', nameEn: 'Interest Paid', nameKr: '이자지급', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.INTEREST_RECEIVED', type: 'CF', nameEn: 'Interest Received', nameKr: '이자수취', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.TAXES_PAID', type: 'CF', nameEn: 'Taxes Paid', nameKr: '법인세 납부', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.CFO', type: 'CF', nameEn: 'Cash Flow from Operations', nameKr: '영업활동현금흐름', sign: '+', required: true, calc: 'DERIVED' },

    // ========== Cash Flow - Investing (CF) ==========
    { id: 'CF.CAPEX', type: 'CF', nameEn: 'Capital Expenditures', nameKr: '유형자산 취득', sign: '-', required: true, calc: 'SOURCE' },
    { id: 'CF.INTANG_CAPEX', type: 'CF', nameEn: 'Intangible Asset Purchases', nameKr: '무형자산 취득', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.INVEST_PURCHASE', type: 'CF', nameEn: 'Investments Purchased', nameKr: '투자자산 취득', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.INVEST_DISPOSAL', type: 'CF', nameEn: 'Investments Sold', nameKr: '투자자산 처분', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.OTHER_INVESTING', type: 'CF', nameEn: 'Other Investing Activities', nameKr: '기타투자활동', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.CFI', type: 'CF', nameEn: 'Cash Flow from Investing', nameKr: '투자활동현금흐름', sign: '-', required: true, calc: 'DERIVED' },

    // ========== Cash Flow - Financing (CF) ==========
    { id: 'CF.DEBT_ISSUED', type: 'CF', nameEn: 'Debt Issuance', nameKr: '차입금 차입', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.DEBT_REPAY', type: 'CF', nameEn: 'Debt Repayment', nameKr: '차입금 상환', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.DIVIDENDS', type: 'CF', nameEn: 'Dividends Paid', nameKr: '배당금 지급', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.EQUITY_ISSUED', type: 'CF', nameEn: 'Equity Issuance', nameKr: '자본금 증가', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.EQUITY_REPURCHASED', type: 'CF', nameEn: 'Share Repurchases', nameKr: '자기주식 취득', sign: '-', required: false, calc: 'SOURCE' },
    { id: 'CF.OTHER_FINANCING', type: 'CF', nameEn: 'Other Financing Activities', nameKr: '기타재무활동', sign: '+', required: false, calc: 'SOURCE' },
    { id: 'CF.CFF', type: 'CF', nameEn: 'Cash Flow from Financing', nameKr: '재무활동현금흐름', sign: '+', required: true, calc: 'DERIVED' },

    // ========== Cash Flow - Summary (CF) ==========
    { id: 'CF.NET_CHANGE', type: 'CF', nameEn: 'Net Change in Cash', nameKr: '현금의순증감', sign: '+', required: true, calc: 'DERIVED' },
    { id: 'CF.BEGIN_CASH', type: 'CF', nameEn: 'Beginning Cash', nameKr: '기초현금', sign: '+', required: true, calc: 'SOURCE' },
    { id: 'CF.END_CASH', type: 'CF', nameEn: 'Ending Cash', nameKr: '기말현금', sign: '+', required: true, calc: 'DERIVED' },
  ];

  for (const item of coaData) {
    await prisma.curatedFinStandardCoa.upsert({
      where: { standardLineId: item.id },
      update: {},
      create: {
        standardLineId: item.id,
        statementType: item.type,
        displayNameEn: item.nameEn,
        displayNameKr: item.nameKr,
        signConvention: item.sign,
        isRequiredForModel: item.required,
        defaultCalcMethod: item.calc,
      },
    });
  }

  console.log(`[Seed] ✓ Created ${coaData.length} Standard COA items`);

  // ============================================================================
  // Section 2: Account Mapping Rules (DART → Standard COA)
  // ============================================================================

  console.log('[Seed] Creating Account Mapping Rules...');

  const mappingRules = [
    // ========== Income Statement Mappings ==========
    { pattern: '^매출액$', line: 'IS.REVENUE', priority: 10 },
    { pattern: '^수익\\(매출액\\)$', line: 'IS.REVENUE', priority: 10 },
    { pattern: '^영업수익$', line: 'IS.REVENUE', priority: 9 },
    { pattern: '^매출원가$', line: 'IS.COGS', priority: 10 },
    { pattern: '^매출총이익$', line: 'IS.GROSS_PROFIT', priority: 10 },
    { pattern: '^매출총이익\\(손실\\)$', line: 'IS.GROSS_PROFIT', priority: 10 },
    { pattern: '^판매비와관리비$', line: 'IS.SGA', priority: 10 },
    { pattern: '^판매비와일반관리비$', line: 'IS.SGA', priority: 10 },
    { pattern: '^영업이익$', line: 'IS.EBIT', priority: 10 },
    { pattern: '^영업이익\\(손실\\)$', line: 'IS.EBIT', priority: 10 },
    { pattern: '^감가상각비$', line: 'IS.DA', priority: 10 },
    { pattern: '^이자비용$', line: 'IS.INTEREST_EXPENSE', priority: 10 },
    { pattern: '^금융비용$', line: 'IS.INTEREST_EXPENSE', priority: 8 },
    { pattern: '^이자수익$', line: 'IS.INTEREST_INCOME', priority: 10 },
    { pattern: '^금융수익$', line: 'IS.INTEREST_INCOME', priority: 8 },
    { pattern: '^영업외\\s*수익$', line: 'IS.OTHER_INCOME', priority: 8 },
    { pattern: '^기타\\s*수익$', line: 'IS.OTHER_INCOME', priority: 8 },
    { pattern: '^영업외\\s*비용$', line: 'IS.OTHER_EXPENSE', priority: 8 },
    { pattern: '^기타\\s*비용$', line: 'IS.OTHER_EXPENSE', priority: 8 },
    { pattern: '^법인세비용$', line: 'IS.TAXES', priority: 10 },
    { pattern: '^법인세비용차감전순이익$', line: 'IS.EBT', priority: 10 },
    { pattern: '^법인세비용차감전계속영업이익$', line: 'IS.EBT', priority: 9 },
    { pattern: '^당기순이익$', line: 'IS.NET_INCOME', priority: 10 },
    { pattern: '^당기순이익\\(손실\\)$', line: 'IS.NET_INCOME', priority: 10 },

    // ========== Balance Sheet - Assets ==========
    { pattern: '^현금및현금성자산$', line: 'BS.CASH', priority: 10 },
    { pattern: '^현금및현금등가물$', line: 'BS.CASH', priority: 10 },
    { pattern: '^단기금융자산$', line: 'BS.ST_FIN_ASSETS', priority: 9 },
    { pattern: '^단기금융상품$', line: 'BS.ST_FIN_ASSETS', priority: 9 },
    { pattern: '^매출채권$', line: 'BS.AR', priority: 10 },
    { pattern: '^매출채권및기타채권$', line: 'BS.AR', priority: 9 },
    { pattern: '^기타채권$', line: 'BS.OTHER_REC', priority: 8 },
    { pattern: '^기타수취채권$', line: 'BS.OTHER_REC', priority: 8 },
    { pattern: '^기타유동채권$', line: 'BS.OTHER_REC', priority: 7 },
    { pattern: '^재고자산$', line: 'BS.INVENTORY', priority: 10 },
    { pattern: '^선급비용$', line: 'BS.PREPAID', priority: 7 },
    { pattern: '^선급금$', line: 'BS.PREPAID', priority: 7 },
    { pattern: '^기타유동자산$', line: 'BS.OTHER_CA', priority: 7 },
    { pattern: '^유동자산$', line: 'BS.TOTAL_CA', priority: 10 },
    { pattern: '^장기금융자산$', line: 'BS.LT_FIN_ASSETS', priority: 8 },
    { pattern: '^장기금융상품$', line: 'BS.LT_FIN_ASSETS', priority: 8 },
    { pattern: '^관계기업투자$', line: 'BS.INVEST_ASSOC', priority: 8 },
    { pattern: '^관계기업및공동기업투자$', line: 'BS.INVEST_ASSOC', priority: 8 },
    { pattern: '^투자부동산$', line: 'BS.INVEST_PROP', priority: 8 },
    { pattern: '^유형자산$', line: 'BS.PPE_NET', priority: 10 },
    { pattern: '^유형자산\\(순액\\)$', line: 'BS.PPE_NET', priority: 10 },
    { pattern: '^사용권자산$', line: 'BS.ROU_ASSET', priority: 8 },
    { pattern: '^무형자산$', line: 'BS.INTANGIBLES', priority: 10 },
    { pattern: '^이연법인세자산$', line: 'BS.DTA', priority: 8 },
    { pattern: '^기타비유동자산$', line: 'BS.OTHER_NCA', priority: 7 },
    { pattern: '^비유동자산$', line: 'BS.TOTAL_NCA', priority: 7 },
    { pattern: '^자산총계$', line: 'BS.TOTAL_ASSETS', priority: 10 },

    // ========== Balance Sheet - Liabilities ==========
    { pattern: '^매입채무$', line: 'BS.AP', priority: 10 },
    { pattern: '^매입채무및기타채무$', line: 'BS.AP', priority: 9 },
    { pattern: '^단기차입금$', line: 'BS.SHORT_DEBT', priority: 10 },
    { pattern: '^유동성장기부채$', line: 'BS.CURRENT_PORTION_LTD', priority: 10 },
    { pattern: '^기타유동부채$', line: 'BS.OTHER_CL', priority: 7 },
    { pattern: '^유동부채$', line: 'BS.TOTAL_CL', priority: 10 },
    { pattern: '^장기차입금$', line: 'BS.LONG_DEBT', priority: 10 },
    { pattern: '^사채$', line: 'BS.BONDS', priority: 10 },
    { pattern: '^리스부채$', line: 'BS.LEASE_LIAB', priority: 10 },
    { pattern: '^이연법인세부채$', line: 'BS.DTL', priority: 8 },
    { pattern: '^충당부채$', line: 'BS.PROVISIONS', priority: 8 },
    { pattern: '^기타비유동부채$', line: 'BS.OTHER_NCL', priority: 7 },
    { pattern: '^비유동부채$', line: 'BS.TOTAL_NCL', priority: 7 },
    { pattern: '^부채총계$', line: 'BS.TOTAL_LIABILITIES', priority: 10 },

    // ========== Balance Sheet - Equity ==========
    { pattern: '^자본금$', line: 'BS.COMMON_STOCK', priority: 10 },
    { pattern: '^주식발행초과금$', line: 'BS.APIC', priority: 10 },
    { pattern: '^기타자본$', line: 'BS.OTHER_EQUITY', priority: 7 },
    { pattern: '^자본잉여금$', line: 'BS.OTHER_EQUITY', priority: 7 },
    { pattern: '^기타자본잉여금$', line: 'BS.OTHER_EQUITY', priority: 7 },
    { pattern: '^이익잉여금$', line: 'BS.RETAINED_EARNINGS', priority: 10 },
    { pattern: '^이익잉여금\\(결손금\\)$', line: 'BS.RETAINED_EARNINGS', priority: 10 },
    { pattern: '^기타포괄손익누계액$', line: 'BS.OCI', priority: 10 },
    { pattern: '^자기주식$', line: 'BS.TREASURY_STOCK', priority: 10 },
    { pattern: '^비지배지분$', line: 'BS.NCI', priority: 7 },
    { pattern: '^자본총계$', line: 'BS.TOTAL_EQUITY', priority: 10 },

    // ========== Cash Flow Statement ==========
    { pattern: '^영업활동으로인한현금흐름$', line: 'CF.CFO', priority: 10 },
    { pattern: '^영업활동현금흐름$', line: 'CF.CFO', priority: 10 },
    { pattern: '^이자지급$', line: 'CF.INTEREST_PAID', priority: 7 },
    { pattern: '^이자지급액$', line: 'CF.INTEREST_PAID', priority: 7 },
    { pattern: '^이자지급현금$', line: 'CF.INTEREST_PAID', priority: 7 },
    { pattern: '^이자수취$', line: 'CF.INTEREST_RECEIVED', priority: 7 },
    { pattern: '^이자수취액$', line: 'CF.INTEREST_RECEIVED', priority: 7 },
    { pattern: '^이자수취현금$', line: 'CF.INTEREST_RECEIVED', priority: 7 },
    { pattern: '^법인세\\s*납부$', line: 'CF.TAXES_PAID', priority: 7 },
    { pattern: '^법인세의\\s*납부$', line: 'CF.TAXES_PAID', priority: 7 },
    { pattern: '^투자활동으로인한현금흐름$', line: 'CF.CFI', priority: 10 },
    { pattern: '^투자활동현금흐름$', line: 'CF.CFI', priority: 10 },
    { pattern: '^유형자산의\\s*취득$', line: 'CF.CAPEX', priority: 8 },
    { pattern: '^무형자산의\\s*취득$', line: 'CF.INTANG_CAPEX', priority: 8 },
    { pattern: '^투자자산의\\s*취득$', line: 'CF.INVEST_PURCHASE', priority: 7 },
    { pattern: '^투자자산의\\s*처분$', line: 'CF.INVEST_DISPOSAL', priority: 7 },
    { pattern: '^재무활동으로인한현금흐름$', line: 'CF.CFF', priority: 10 },
    { pattern: '^재무활동현금흐름$', line: 'CF.CFF', priority: 10 },
    { pattern: '^차입금의\\s*증가$', line: 'CF.DEBT_ISSUED', priority: 7 },
    { pattern: '^차입금의\\s*감소$', line: 'CF.DEBT_REPAY', priority: 7 },
    { pattern: '^배당금의\\s*지급$', line: 'CF.DIVIDENDS', priority: 7 },
    { pattern: '^유상증자$', line: 'CF.EQUITY_ISSUED', priority: 7 },
    { pattern: '^자기주식의\\s*취득$', line: 'CF.EQUITY_REPURCHASED', priority: 7 },
    { pattern: '^현금의증가$', line: 'CF.NET_CHANGE', priority: 10 },
    { pattern: '^현금및현금성자산의순증가$', line: 'CF.NET_CHANGE', priority: 10 },
    { pattern: '^기초현금$', line: 'CF.BEGIN_CASH', priority: 10 },
    { pattern: '^기말현금$', line: 'CF.END_CASH', priority: 10 },
  ];

  let mappingCount = 0;
  for (const rule of mappingRules) {
    await prisma.curatedFinAccountMapping.create({
      data: {
        accountNameKr: rule.pattern,
        standardLineId: rule.line,
        priority: rule.priority,
        confidenceScore: 1.0,
        mappingVersion: 1,
      },
    });
    mappingCount++;
  }

  console.log(`[Seed] ✓ Created ${mappingCount} Account Mapping Rules`);

  // ============================================================================
  // Section 3: Sample Entity (Optional - for testing)
  // ============================================================================

  console.log('[Seed] Creating sample project and entity...');

  const sampleProject = await prisma.modelProject.upsert({
    where: { id: 'sample-project-001' },
    update: {},
    create: {
      id: 'sample-project-001',
      name: 'FMWP Sample Project',
      baseCurrency: 'KRW',
      createdBy: 'system',
    },
  });

  const sampleEntity = await prisma.modelEntity.upsert({
    where: { id: 'sample-entity-005930' },
    update: {},
    create: {
      id: 'sample-entity-005930',
      projectId: sampleProject.id,
      corpCode: '00126380', // Samsung Electronics
      stockCode: '005930',
      displayName: '삼성전자',
      defaultFsScope: 'CONSOLIDATED',
      fiscalYearEndMonth: 12,
    },
  });

  console.log(`[Seed] ✓ Created sample project and entity (${sampleEntity.stockCode})`);

  console.log('[Seed] ✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('[Seed] ❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
