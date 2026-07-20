import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authService } from '../services/authService';
import { LoginParams } from '@/types/user';

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  return useMutation({
    ...authService.loginMutation,
    onSuccess: (data) => {
      // Service onSuccess handles cache invalidation
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      toast.success('登录成功');
      router.push('/dashboard');
    },
    onError: (error: any) => {
      toast.error(error.message || '登录失败，请检查用户名和密码');
    },
  });
}
