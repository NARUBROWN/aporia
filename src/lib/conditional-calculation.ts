export type FormulaCase<T> = {
  value: string;
  formula: T[];
};

export function selectFormulaForValue<T>(
  fallbackFormula: T[],
  cases: FormulaCase<T>[] | undefined,
  value: string,
) {
  return cases?.find((item) => item.value === value)?.formula ?? fallbackFormula;
}
