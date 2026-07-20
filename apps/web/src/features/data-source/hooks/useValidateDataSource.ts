import { useState } from 'react';
import { dataSourceApi } from '../services/dataSourceApi';

interface ValidationResult {
  success: boolean;
  message: string;
}

export function useValidateDataSource() {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const validate = async (id: number): Promise<ValidationResult> => {
    setValidating(true);
    setValidationResult(null);
    setError(null);
    try {
      const result = await dataSourceApi.validate(id);
      const success = (result as Record<string, unknown>).valid === true;
      const message = ((result as Record<string, unknown>).message as string) || '';
      const validationResultData = { success, message };
      setValidationResult(validationResultData);
      return validationResultData;
    } catch (err) {
      setError(err as Error);
      return { success: false, message: (err as Error).message };
    } finally {
      setValidating(false);
    }
  };

  return { validate, validating, validationResult, error };
}
