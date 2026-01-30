import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Standard Taxonomy Seed (Enhanced IS + Basic 3-Statement Structure)
  const taxonomyData = [
    // Balance Sheet
    { accountCode: 'BS_1000', accountName: 'Total Assets', statementType: 'BS', isRequired: true },
    { accountCode: 'BS_1100', accountName: 'Current Assets', statementType: 'BS', parentCode: 'BS_1000', isRequired: false },
    { accountCode: 'BS_1200', accountName: 'Non-Current Assets', statementType: 'BS', parentCode: 'BS_1000', isRequired: false },
    { accountCode: 'BS_2000', accountName: 'Total Liabilities', statementType: 'BS', isRequired: true },
    { accountCode: 'BS_2100', accountName: 'Current Liabilities', statementType: 'BS', parentCode: 'BS_2000', isRequired: false },
    { accountCode: 'BS_2200', accountName: 'Non-Current Liabilities', statementType: 'BS', parentCode: 'BS_2000', isRequired: false },
    { accountCode: 'BS_3000', accountName: 'Total Equity', statementType: 'BS', isRequired: true },
    { accountCode: 'BS_3100', accountName: 'Capital Stock', statementType: 'BS', parentCode: 'BS_3000', isRequired: false },
    { accountCode: 'BS_3200', accountName: 'Retained Earnings', statementType: 'BS', parentCode: 'BS_3000', isRequired: false },
    
    // Income Statement (Detailed)
    { accountCode: 'IS_GROSS_SALES', accountName: 'Gross Sales', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_BEVERAGES', accountName: 'Beverages', statementType: 'IS', parentCode: 'IS_GROSS_SALES', isRequired: false },
    { accountCode: 'IS_JUICES', accountName: 'Juices/Sports Energy Drinks', statementType: 'IS', parentCode: 'IS_BEVERAGES', isRequired: false },
    { accountCode: 'IS_JUICES_VOLUME', accountName: 'Juices/Sports Energy Drinks Volumes (mLtrs)', statementType: 'IS', parentCode: 'IS_JUICES', isRequired: false },
    { accountCode: 'IS_JUICES_PRICE', accountName: 'Juices/Sports Energy Drinks Price per litre', statementType: 'IS', parentCode: 'IS_JUICES', isRequired: false },
    { accountCode: 'IS_WATER', accountName: 'Water', statementType: 'IS', parentCode: 'IS_BEVERAGES', isRequired: false },
    { accountCode: 'IS_WATER_VOLUME', accountName: 'Water Volumes (mLtrs)', statementType: 'IS', parentCode: 'IS_WATER', isRequired: false },
    { accountCode: 'IS_WATER_PRICE', accountName: 'Water Price per litre', statementType: 'IS', parentCode: 'IS_WATER', isRequired: false },
    { accountCode: 'IS_CARBONATES', accountName: 'Carbonates', statementType: 'IS', parentCode: 'IS_BEVERAGES', isRequired: false },
    { accountCode: 'IS_CARBONATES_VOLUME', accountName: 'Carbonates Volumes (mLtrs)', statementType: 'IS', parentCode: 'IS_CARBONATES', isRequired: false },
    { accountCode: 'IS_CARBONATES_PRICE', accountName: 'Carbonates Price per litre', statementType: 'IS', parentCode: 'IS_CARBONATES', isRequired: false },
    { accountCode: 'IS_CONFECTIONERY', accountName: 'Confectionery', statementType: 'IS', parentCode: 'IS_GROSS_SALES', isRequired: false },
    { accountCode: 'IS_CONFECTIONERY_VOLUME', accountName: 'Confectionery Volumes (mKgs)', statementType: 'IS', parentCode: 'IS_CONFECTIONERY', isRequired: false },
    { accountCode: 'IS_CONFECTIONERY_PRICE', accountName: 'Confectionery Price per KG', statementType: 'IS', parentCode: 'IS_CONFECTIONERY', isRequired: false },
    { accountCode: 'IS_CONFECTIONERY_MARKET_SIZE', accountName: 'Confectionery Market Size', statementType: 'IS', parentCode: 'IS_CONFECTIONERY', isRequired: false },
    { accountCode: 'IS_CONFECTIONERY_MARKET_SHARE', accountName: 'Confectionery Market Share', statementType: 'IS', parentCode: 'IS_CONFECTIONERY', isRequired: false },
    { accountCode: 'IS_DISCOUNTS_REBATES', accountName: 'Discounts and Rebates', statementType: 'IS', parentCode: 'IS_GROSS_SALES', isRequired: false },
    { accountCode: 'IS_1000', accountName: 'Net Sales', statementType: 'IS', isRequired: true },
    { accountCode: 'IS_1100', accountName: 'Cost of Goods Sold', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_1200', accountName: 'Gross Profit', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_SELLING_EXPENSES', accountName: 'Selling Expenses', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_GA_EXPENSES', accountName: 'General & Administrative Expenses', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_1300', accountName: 'Selling, General & Admin (Total)', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_2000', accountName: 'EBIT', statementType: 'IS', isRequired: true },
    { accountCode: 'IS_DA', accountName: 'Depreciation & Amortisation', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_CAPEX', accountName: 'Capital Expenditure', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_EBITDA', accountName: 'EBITDA', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_INTEREST_EXPENSE', accountName: 'Interest Expense', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_2100', accountName: 'EBT', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_TAXES', accountName: 'Taxes', statementType: 'IS', isRequired: false },
    { accountCode: 'IS_3000', accountName: 'Net Income', statementType: 'IS', isRequired: true },
    
    // Cash Flow
    { accountCode: 'CF_1000', accountName: 'CFO', statementType: 'CF', isRequired: true },
    { accountCode: 'CF_2000', accountName: 'CFI', statementType: 'CF', isRequired: true },
    { accountCode: 'CF_3000', accountName: 'CFF', statementType: 'CF', isRequired: true },
  ];

  for (const item of taxonomyData) {
    await prisma.standardTaxonomy.upsert({
      where: { accountCode: item.accountCode },
      update: {},
      create: item,
    });
  }

  console.log(`Seeded ${taxonomyData.length} taxonomy items.`);

  // 2. Account Mapping Rules Seed (OpenDART Regex Patterns)
  console.log('Seeding mapping rules...');
  const mappingRules = [
    // Assets
    { provider: 'OPENDART', pattern: '^자산총계$', code: 'BS_1000' },
    { provider: 'OPENDART', pattern: '^유동자산$', code: 'BS_1100' },
    { provider: 'OPENDART', pattern: '^비유동자산$', code: 'BS_1200' },
    
    // Liabilities & Equity
    { provider: 'OPENDART', pattern: '^부채총계$', code: 'BS_2000' },
    { provider: 'OPENDART', pattern: '^유동부채$', code: 'BS_2100' },
    { provider: 'OPENDART', pattern: '^비유동부채$', code: 'BS_2200' },
    { provider: 'OPENDART', pattern: '^자본총계$', code: 'BS_3000' },
    { provider: 'OPENDART', pattern: '^자본금$', code: 'BS_3100' },
    { provider: 'OPENDART', pattern: '^이익잉여금$', code: 'BS_3200' },
    { provider: 'OPENDART', pattern: '^이익잉여금\\(결손금\\)$', code: 'BS_3200' },

    // Income Statement
    { provider: 'OPENDART', pattern: '^매출액$', code: 'IS_1000' },
    { provider: 'OPENDART', pattern: '^수익\\(매출액\\)$', code: 'IS_1000' }, // 포괄손익계산서 대응
    { provider: 'OPENDART', pattern: '^영업수익$', code: 'IS_1000' },
    { provider: 'OPENDART', pattern: '^매출총액$', code: 'IS_GROSS_SALES' },
    { provider: 'OPENDART', pattern: '^총매출$', code: 'IS_GROSS_SALES' },
    { provider: 'OPENDART', pattern: '^매출할인$', code: 'IS_DISCOUNTS_REBATES' },
    { provider: 'OPENDART', pattern: '^매출에누리$', code: 'IS_DISCOUNTS_REBATES' },
    { provider: 'OPENDART', pattern: '^매출할인및에누리$', code: 'IS_DISCOUNTS_REBATES' },
    { provider: 'OPENDART', pattern: '^할인및리베이트$', code: 'IS_DISCOUNTS_REBATES' },
    { provider: 'OPENDART', pattern: '^매출원가$', code: 'IS_1100' },
    { provider: 'OPENDART', pattern: '^영업비용$', code: 'IS_1100' }, // 서비스업 등
    { provider: 'OPENDART', pattern: '^매출총이익$', code: 'IS_1200' },
    { provider: 'OPENDART', pattern: '^매출총이익\\(손실\\)$', code: 'IS_1200' },
    { provider: 'OPENDART', pattern: '^판매비$', code: 'IS_SELLING_EXPENSES' },
    { provider: 'OPENDART', pattern: '^판매비용$', code: 'IS_SELLING_EXPENSES' },
    { provider: 'OPENDART', pattern: '^관리비$', code: 'IS_GA_EXPENSES' },
    { provider: 'OPENDART', pattern: '^판매비와관리비$', code: 'IS_1300' },
    { provider: 'OPENDART', pattern: '^영업이익$', code: 'IS_2000' },
    { provider: 'OPENDART', pattern: '^영업이익\\(손실\\)$', code: 'IS_2000' },
    { provider: 'OPENDART', pattern: '^법인세비용차감전계속영업이익$', code: 'IS_2100' },
    { provider: 'OPENDART', pattern: '^법인세비용차감전순이익\\(손실\\)$', code: 'IS_2100' },
    { provider: 'OPENDART', pattern: '^당기순이익$', code: 'IS_3000' },
    { provider: 'OPENDART', pattern: '^당기순이익\\(손실\\)$', code: 'IS_3000' },
    { provider: 'OPENDART', pattern: '^연결당기순이익$', code: 'IS_3000' }, // 연결재무제표 기준
    { provider: 'OPENDART', pattern: '^이자비용$', code: 'IS_INTEREST_EXPENSE' },
    { provider: 'OPENDART', pattern: '^금융비용$', code: 'IS_INTEREST_EXPENSE' },
    { provider: 'OPENDART', pattern: '^법인세비용$', code: 'IS_TAXES' },
    { provider: 'OPENDART', pattern: '^감가상각비$', code: 'IS_DA' },
    { provider: 'OPENDART', pattern: '^무형자산상각비$', code: 'IS_DA' },
    { provider: 'OPENDART', pattern: '^감가상각비및무형자산상각비$', code: 'IS_DA' },
    { provider: 'OPENDART', pattern: '^EBITDA$', code: 'IS_EBITDA' },

    // Cash Flow
    { provider: 'OPENDART', pattern: '^영업활동으로인한현금흐름$', code: 'CF_1000' },
    { provider: 'OPENDART', pattern: '^영업활동현금흐름$', code: 'CF_1000' },
    { provider: 'OPENDART', pattern: '^투자활동으로인한현금흐름$', code: 'CF_2000' },
    { provider: 'OPENDART', pattern: '^투자활동현금흐름$', code: 'CF_2000' },
    { provider: 'OPENDART', pattern: '^재무활동으로인한현금흐름$', code: 'CF_3000' },
    { provider: 'OPENDART', pattern: '^재무활동현금흐름$', code: 'CF_3000' },
  ];

  for (const rule of mappingRules) {
    await prisma.accountMappingRule.create({
      data: {
        provider: rule.provider,
        reportedAccountNamePattern: rule.pattern,
        standardAccountCode: rule.code,
        priority: 10, // 기본 우선순위
      }
    });
  }
  
  console.log(`Seeded ${mappingRules.length} mapping rules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
