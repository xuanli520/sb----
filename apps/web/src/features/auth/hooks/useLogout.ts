import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authService } from '../services/authService';

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  return useMutation({
    ...authService.logoutMutation,
    onSuccess: () => {
      // Service onSuccess handles cache clearing
      queryClient.clear();
      toast.success('已安全退出');
      router.push('/login');
    },
    onError: () => {
      // 即使出错也清除本地状态
      toast.success('已安全退出');
      router.push('/login');
    },
  });
}
