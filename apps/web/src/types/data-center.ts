export interface MetricData {
  title: string;
  value: number;
  change: number;
  trend: { time: string; value: number }[];
}

export interface CoreMetrics {
  comprehensiveScore: MetricData;
  productExperience: MetricData;
  logisticsExperience: MetricData;
  serviceExperience: MetricData;
  negativeReviewRisk: MetricData;
}

export interface TrendDataPoint {
  time: string;
  score: number;
}

export interface RadarDataPoint {
  subject: string;
  score: number;
  fullMark: number;
}

export interface RankDataPoint {
  name: string;
  score: number;
}

export interface DistributionDataPoint {
  name: string;
  value: number;
  count: number;
  percent: string;
}

export interface DataCenterSummary {
  monitoredShops: number;
  dataCoverage: number; // percentage (e.g., 98.6)
}

export interface DashboardChartsData {
  trend: TrendDataPoint[];
  radar: RadarDataPoint[];
  rank: RankDataPoint[];
  scoreDistribution: DistributionDataPoint[];
  problemDistribution: DistributionDataPoint[];
}

export interface DataCenterResponse {
  updateTime: string;
  metrics: CoreMetrics;
  summary: DataCenterSummary;
  charts: DashboardChartsData;
}
