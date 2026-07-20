'use client';

import React from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useCreateScrapingRule } from '../../hooks/useCreateScrapingRule';
import { useDataSources } from '@/features/data-source/hooks/useDataSources';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Switch } from '@/app/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { RuleConfigFields } from './RuleConfigFields';
import {
  RuleConfigFormValues,
  applyScrapingRuleFormError,
  buildRuleConfigFromForm,
  buildRuleConfigFormDefaults,
  targetTypeOptions,
} from './BaseForm';
import { TargetType } from '@/types';

interface CreateRuleFormValues extends RuleConfigFormValues {
  name: string;
  description: string;
  target_type: TargetType;
  data_source_id: string;
  is_active: boolean;
}

export function CreateForm({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const { create, loading } = useCreateScrapingRule();
  const { data: dataSources } = useDataSources({ size: 100 });

  const form = useForm<CreateRuleFormValues>({
    defaultValues: {
      name: '',
      description: '',
      target_type: 'SHOP_OVERVIEW',
      data_source_id: '',
      is_active: true,
      ...buildRuleConfigFormDefaults(),
    },
  });
  const { clearErrors } = form;
  const ruleConfigForm = form as unknown as UseFormReturn<RuleConfigFormValues>;
  const selectedDataSourceId = useWatch({ control: form.control, name: 'data_source_id' });

  async function onSubmit(values: CreateRuleFormValues) {
    clearErrors();

    if (!values.data_source_id) {
      form.setError('data_source_id', { type: 'required', message: '请选择数据源' });
      return;
    }

    try {
      const config = buildRuleConfigFromForm(values);
      await create({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        target_type: values.target_type,
        data_source_id: Number(values.data_source_id),
        is_active: values.is_active,
        config,
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/scraping-rule');
      }
    } catch (error) {
      applyScrapingRuleFormError(form, error, 'name', '创建失败');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          rules={{
            required: '名称必填',
            validate: value => value.trim() ? true : '名称必填',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>名称</FormLabel>
              <FormControl>
                <Input placeholder="规则名称" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="target_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>目标类型</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择目标类型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {targetTypeOptions.map(option => (
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
            name="data_source_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>数据源</FormLabel>
                <Select
                  onValueChange={value => {
                    field.onChange(value);
                    form.setValue('single_shop_id', '');
                    form.setValue('shop_ids', []);
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择数据源" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {dataSources?.items?.map(ds => (
                      <SelectItem key={ds.id} value={String(ds.id)}>
                        {ds.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <FormLabel>状态</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <RuleConfigFields
          form={ruleConfigForm}
          dataSourceId={selectedDataSourceId ? Number(selectedDataSourceId) : null}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel || (() => router.back())}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? '创建中...' : '创建规则'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
