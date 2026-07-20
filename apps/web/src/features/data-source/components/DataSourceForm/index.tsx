import React from 'react';
import { useForm } from 'react-hook-form';
import { DataSourceCreate, DataSource, DataSourceStatus, DataSourceType } from '../../services/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Button } from '@/app/components/ui/button';
import { JsonConfigEditor } from './ConfigFields/JsonConfigEditor';

interface DataSourceFormProps {
  initialData?: DataSource;
  onSubmit: (data: DataSourceCreate) => Promise<void>;
  loading?: boolean;
  onCancel?: () => void;
}

interface DataSourceFormValues {
  name: string;
  type: DataSourceType;
  description: string;
  status: DataSourceStatus;
  configJson: string;
}

const dataSourceTypeOptions: Array<{ value: DataSourceType; label: string }> = [
  { value: 'DOUYIN_API', label: '抖音 API' },
  { value: 'DOUYIN_SHOP', label: '抖音小店' },
  { value: 'DOUYIN_APP', label: '抖音 App' },
  { value: 'SELF_HOSTED', label: '自托管' },
  { value: 'FILE_UPLOAD', label: '文件上传' },
  { value: 'FILE_IMPORT', label: '文件导入' },
];

const dataSourceStatusOptions: Array<{ value: DataSourceStatus; label: string }> = [
  { value: 'ACTIVE', label: '启用' },
  { value: 'INACTIVE', label: '停用' },
  { value: 'ERROR', label: '错误' },
];

function stringifyConfig(config: unknown) {
  try {
    return JSON.stringify(config ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export function DataSourceForm({ initialData, onSubmit, loading, onCancel }: DataSourceFormProps) {
  const form = useForm<DataSourceFormValues>({
    defaultValues: initialData
      ? {
          name: initialData.name,
          type: initialData.type,
          description: initialData.description || '',
          status: initialData.status,
          configJson: stringifyConfig(initialData.config),
        }
      : {
          name: '',
          type: 'DOUYIN_SHOP',
          description: '',
          status: 'ACTIVE',
          configJson: '{}',
        },
  });

  const parseConfig = (configJson: string) => {
    const jsonText = configJson.trim();
    if (!jsonText) {
      return {};
    }
    return JSON.parse(jsonText) as Record<string, unknown>;
  };

  const handleFormat = () => {
    const current = form.getValues('configJson');
    try {
      const parsed = parseConfig(current);
      form.clearErrors('configJson');
      form.setValue('configJson', stringifyConfig(parsed), {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch {
      form.setError('configJson', {
        type: 'validate',
        message: 'JSON 格式错误',
      });
    }
  };

  const handleReset = () => {
    form.clearErrors('configJson');
    form.setValue('configJson', '{}', {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleSubmit = async (values: DataSourceFormValues) => {
    let config: Record<string, unknown>;
    try {
      config = parseConfig(values.configJson);
    } catch {
      form.setError('configJson', {
        type: 'validate',
        message: 'JSON 格式错误',
      });
      return;
    }

    form.clearErrors('configJson');
    await onSubmit({
      name: values.name,
      type: values.type,
      description: values.description || undefined,
      status: values.status,
      config,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: '名称必填' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>名称</FormLabel>
              <FormControl>
                <Input placeholder="请输入数据源名称" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            rules={{ required: '类型必填' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>类型</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!initialData}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {dataSourceTypeOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>状态</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {dataSourceStatusOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>描述</FormLabel>
              <FormControl>
                <Input placeholder="可选描述" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="configJson"
          rules={{ required: '配置 JSON 必填' }}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>配置 JSON</FormLabel>
              <FormControl>
                <JsonConfigEditor
                  value={field.value}
                  onChange={field.onChange}
                  onFormat={handleFormat}
                  onReset={handleReset}
                  error={fieldState.error?.message}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
