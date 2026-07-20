import type {
  DataSourceType,
  DataSourceStatus,
  TargetType,
  ScrapingRuleStatus,
  ImportStatus,
  ScrapingRuleGranularity,
  ScrapingRuleIncrementalMode,
  ScrapingRuleDataLatency,
} from '@/types';

export const dataSourceTypeMap: Record<DataSourceType, string> = {
  DOUYIN_API: '抖音 API',
  DOUYIN_SHOP: '抖音小店',
  DOUYIN_APP: '抖音应用',
  FILE_IMPORT: '文件导入',
  FILE_UPLOAD: '文件上传',
  SELF_HOSTED: '自托管',
};

export const dataSourceStatusMap: Record<DataSourceStatus, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  ERROR: '错误',
};

export const targetTypeMap: Record<TargetType, string> = {
  SHOP_OVERVIEW: '店铺概览',
  TRAFFIC: '流量分析',
  PRODUCT: '商品分析',
  LIVE: '直播分析',
  CONTENT_VIDEO: '视频内容',
  ORDER_FULFILLMENT: '订单履约',
  AFTERSALE_REFUND: '售后退款',
  CUSTOMER: '客户分析',
  ADS: '广告投放',
};

export const scrapingRuleStatusMap: Record<ScrapingRuleStatus, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
};

export const importStatusMap: Record<ImportStatus, string> = {
  PENDING: '待处理',
  PROCESSING: '处理中',
  SUCCESS: '成功',
  FAILED: '失败',
  PARTIAL: '部分成功',
  CANCELLED: '已取消',
  VALIDATION_FAILED: '校验失败',
};

export const scrapingRuleGranularityMap: Record<ScrapingRuleGranularity, string> = {
  HOUR: '小时',
  DAY: '天',
  WEEK: '周',
  MONTH: '月',
};

export const scrapingRuleIncrementalModeMap: Record<ScrapingRuleIncrementalMode, string> = {
  BY_DATE: '按日期',
  BY_CURSOR: '按游标',
};

export const scrapingRuleDataLatencyMap: Record<ScrapingRuleDataLatency, string> = {
  REALTIME: '实时',
  'T+1': 'T+1',
  'T+2': 'T+2',
  'T+3': 'T+3',
};

export function getDataSourceTypeLabel(type: DataSourceType): string {
  return dataSourceTypeMap[type] || type;
}

export function getDataSourceStatusLabel(status: DataSourceStatus): string {
  return dataSourceStatusMap[status] || status;
}

export function getTargetTypeLabel(type: TargetType): string {
  return targetTypeMap[type] || type;
}

export function getScrapingRuleStatusLabel(status: ScrapingRuleStatus): string {
  return scrapingRuleStatusMap[status] || status;
}

export function getImportStatusLabel(status: ImportStatus): string {
  return importStatusMap[status] || status;
}

export function getScrapingRuleGranularityLabel(value: ScrapingRuleGranularity): string {
  return scrapingRuleGranularityMap[value] || value;
}

export function getScrapingRuleIncrementalModeLabel(value: ScrapingRuleIncrementalMode): string {
  return scrapingRuleIncrementalModeMap[value] || value;
}

export function getScrapingRuleDataLatencyLabel(value: ScrapingRuleDataLatency): string {
  return scrapingRuleDataLatencyMap[value] || value;
}
