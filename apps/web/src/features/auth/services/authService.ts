import { queryKeys } from '@/lib/query/keys';
import { httpClient } from '@/lib/http/client';
import { queryClient } from '@/lib/query/client';
import { clearSession } from '@/lib/auth';
import { ApiResponse } from '@/lib/http/types';
import { User, LoginParams } from '@/types/user';
import { API_ENDPOINTS } from '@/config/api';

export const authService = {
  getCurrentUserQuery: () => ({
    queryKey: queryKeys.auth.user(),
    queryFn: async () => {
      const response = await httpClient.get<ApiResponse<User>>(API_ENDPOINTS.USERS_ME);
      return response.data;
    },
    retry: false,
  }),

  loginMutation: {
    mutationFn: async (credentials: LoginParams) => {
      const formData = new URLSearchParams();
      formData.append('username', credentials.username);
      formData.append('password', credentials.password);
      if (credentials.captchaVerifyParam) {
        formData.append('captchaVerifyParam', credentials.captchaVerifyParam);
      }

      await httpClient.post(
        API_ENDPOINTS.JWT_LOGIN,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  },

  logoutMutation: {
    mutationFn: async () => {
      try {
        await httpClient.post(API_ENDPOINTS.JWT_LOGOUT);
      } catch {
      }
      clearSession();
      return true;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  },

  refreshTokenMutation: {
    mutationFn: async () => {
      await httpClient.post(API_ENDPOINTS.JWT_REFRESH);
      return true;
    },
  },
};
