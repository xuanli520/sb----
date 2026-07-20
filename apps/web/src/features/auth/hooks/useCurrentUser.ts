import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/authService';

export function useCurrentUser() {
  return useQuery({
    ...authService.getCurrentUserQuery(),
    staleTime: 5 * 60 * 1000,
  });
}
