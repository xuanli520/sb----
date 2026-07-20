import { useMutation } from '@tanstack/react-query';
import { authService } from '../services/authService';

export function useRefreshToken() {
  return useMutation(authService.refreshTokenMutation);
}
