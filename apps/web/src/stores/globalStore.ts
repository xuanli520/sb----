import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModalState {
  id: string | null;
  props?: Record<string, unknown>;
}

interface GlobalState {
  // UI 状态
  sidebarCollapsed: boolean;
  activeModal: ModalState | null;
  
  // 全局加载状态
  isLoading: boolean;
  loadingMessage: string | null;
  
  // 操作
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (id: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  setLoading: (loading: boolean, message?: string) => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeModal: null,
      isLoading: false,
      loadingMessage: null,
      
      toggleSidebar: () => 
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      
      setSidebarCollapsed: (collapsed) => 
        set({ sidebarCollapsed: collapsed }),
      
      openModal: (id, props) => 
        set({ activeModal: { id, props } }),
      
      closeModal: () => 
        set({ activeModal: null }),
      
      setLoading: (loading, message) => 
        set({ isLoading: loading, loadingMessage: message || null }),
    }),
    {
      name: 'global-storage',
      partialize: (state) => ({ 
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
