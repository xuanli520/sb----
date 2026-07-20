export interface IndicatorScoreRange {
  score: number;
  value: string;
  range: string;
}

export interface IndicatorFormulaVariable {
  name: string;
  value: number;
}

export interface IndicatorFormula {
  variables: IndicatorFormulaVariable[];
  display?: string;
}

export interface IndicatorTrendData {
  date: string;
  value: number;
}

export interface Indicator {
  categoryId: string;
  categoryName: string;
  name: string;
  score: number;
  weight: number;
  scoreRanges: IndicatorScoreRange[];
  formula: IndicatorFormula;
  notes: string[];
  trend: IndicatorTrendData[];
}
