import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TaskSchedulePage from '@/app/components/TaskSchedulePage';
import { shopDashboardApi } from '@/features/shop-dashboard/services/shopDashboardApi';
import { TaskDefinition } from '@/features/shop-dashboard/services/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/features/shop-dashboard/services/shopDashboardApi', () => ({
  shopDashboardApi: {
    listTasks: vi.fn(),
    createTask: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    runTask: vi.fn(),
    cancelTask: vi.fn(),
    listTaskExecutions: vi.fn(),
    triggerShopDashboardCollection: vi.fn(),
    queryResults: vi.fn(),
  },
}));

const mockedApi = vi.mocked(shopDashboardApi);

function buildTask(id: number, overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id,
    name: 'orders-daily',
    task_type: 'ETL_ORDERS',
    status: 'ACTIVE',
    config: {},
    schedule: null,
    created_by_id: 1,
    updated_by_id: 1,
    created_at: '2026-03-09T01:00:00Z',
    updated_at: '2026-03-09T01:00:00Z',
    ...overrides,
  };
}

function mockTaskList(taskOverrides: Partial<TaskDefinition> = {}) {
  mockedApi.listTasks.mockResolvedValue({
    items: [buildTask(101, taskOverrides)],
    meta: {
      page: 1,
      size: 20,
      total: 1,
      pages: 1,
      has_next: false,
      has_prev: false,
    },
  });
}

describe('TaskSchedulePage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockTaskList();
    mockedApi.listTaskExecutions.mockResolvedValue({
      task_id: 101,
      items: [],
    });
  });

  it('加载后展示后端任务列表', async () => {
    render(<TaskSchedulePage />);

    expect(await screen.findByText('orders-daily')).toBeTruthy();
    expect(await screen.findByText('订单 ETL')).toBeTruthy();

    await waitFor(() => {
      expect(mockedApi.listTasks).toHaveBeenCalledWith({
        page: 1,
        size: 20,
        status: undefined,
        task_type: undefined,
      });
    });
  });

  it('通过操作菜单触发取消任务', async () => {
    mockedApi.cancelTask.mockResolvedValue(buildTask(101, { status: 'CANCELLED' }));

    render(<TaskSchedulePage />);

    await screen.findByText('orders-daily');
    fireEvent.pointerDown(screen.getByRole('button', { name: '打开操作菜单' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '取消任务' }));

    await waitFor(() => {
      expect(mockedApi.cancelTask).toHaveBeenCalledWith(101);
    });
  });

  it('采集任务立即执行会自动带入任务配置参数并确认触发', async () => {
    mockTaskList({
      id: 202,
      name: 'shop-dashboard-collection',
      task_type: 'SHOP_DASHBOARD_COLLECTION',
      config: {
        data_source_id: 66,
        rule_id: 77,
      },
    });

    mockedApi.runTask.mockResolvedValue({
      id: 9001,
      task_id: 202,
      queue_task_id: 'queue-202-1',
      status: 'QUEUED',
      trigger_mode: 'MANUAL',
      payload: {
        data_source_id: 66,
        rule_id: 77,
      },
      started_at: null,
      completed_at: null,
      processed_rows: 0,
      error_message: null,
      triggered_by: 1,
      created_at: '2026-03-09T02:00:00Z',
      updated_at: '2026-03-09T02:00:00Z',
    });

    render(<TaskSchedulePage />);

    await screen.findByText('shop-dashboard-collection');
    fireEvent.pointerDown(screen.getByRole('button', { name: '打开操作菜单' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '立即执行' }));

    expect(await screen.findByText('执行任务')).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('{\n  "data_source_id": 66,\n  "rule_id": 77\n}');
    });
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));

    await waitFor(() => {
      expect(mockedApi.runTask).toHaveBeenCalledWith(202, {
        payload: {
          data_source_id: 66,
          rule_id: 77,
        },
      });
    });
  });

  it('编辑提交会调用 updateTask', async () => {
    mockedApi.updateTask.mockResolvedValue(
      buildTask(101, {
        name: 'orders-updated',
        updated_at: '2026-03-09T01:10:00Z',
      }),
    );

    render(<TaskSchedulePage />);

    await screen.findByText('orders-daily');
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));

    const nameInput = await screen.findByDisplayValue('orders-daily');
    fireEvent.change(nameInput, { target: { value: 'orders-updated' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(mockedApi.updateTask).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          name: 'orders-updated',
          status: 'ACTIVE',
        }),
      );
    });
  });

  it('删除确认会调用 deleteTask', async () => {
    mockedApi.deleteTask.mockResolvedValue(undefined);

    render(<TaskSchedulePage />);

    await screen.findByText('orders-daily');
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    const dialogTitle = await screen.findByText('确认删除任务？');
    const dialog = dialogTitle.closest('[role=\"alertdialog\"]') as HTMLElement | null;
    if (!dialog) {
      throw new Error('删除确认弹窗未打开');
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /删|鍒/ }));

    await waitFor(() => {
      expect(mockedApi.deleteTask).toHaveBeenCalledWith(101);
    });
  });
});
