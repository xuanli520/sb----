'use client';

import React, { useEffect } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useUpdateScrapingRule } from '../../hooks/useUpdateScrapingRule';
import { useScrapingRule } from '../../hooks/useScrapingRule';
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
import type { HttpError } from '@/lib/http/types';
import { RuleConfigFields } from './RuleConfigFields';
import {
  RuleConfigFormValues,
  applyScrapingRuleFormError,
  buildRuleConfigFromForm,
  buildRuleConfigFormDefaults,
} from './BaseForm';

interface EditRuleFormValues extends RuleConfigFormValues {
  name: string;
  description: string;
  is_active: boolean;
}

interface EditFormProps {
  id: number;
}

export function EditForm({ id }: EditFormProps) {
  const router = useRouter();
  const { rule, loading: loadingRule, error: loadError } = useScrapingRule(id);
  const { update, loading: saving } = useUpdateScrapingRule();

  const form = useForm<EditRuleFormValues>({
    defaultValues: {
      name: '',
      description: '',
      is_active: true,
      ...buildRuleConfigFormDefaults(),
    },
  });
  const { clearErrors, reset } = form;
  const ruleConfigForm = form as unknown as UseFormReturn<RuleConfigFormValues>;

  useEffect(() => {
    if (!rule) {
      return;
    }

    reset({
      name: rule.name,
      description: rule.description || '',
      is_active: rule.is_active,
      ...buildRuleConfigFormDefaults(rule.config),
    });
  }, [reset, rule]);

  async function onSubmit(values: EditRuleFormValues) {
    clearErrors();

    try {
      const config = buildRuleConfigFromForm(values);
      await update(id, {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        is_active: values.is_active,
        config,
      });
      router.push('/scraping-rule');
    } catch (error) {
      applyScrapingRuleFormError(form, error, 'name', '保存失败');
    }
  }

  if (loadingRule) {
    return <div>加载中...</div>;
  }

  if (loadError) {
    const status = (loadError as HttpError).status;
    if (status === 404) {
      return <div>未找到规则</div>;
    }
    return <div>加载失败：{loadError.message || '请稍后重试'}</div>;
  }

  if (!rule) {
    return <div>未找到规则</div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-4xl space-y-8">
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
          <div className="grid gap-2">
            <div className="text-sm font-medium">数据源 ID</div>
            <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              {rule.data_source_id}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">目标类型</div>
            <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
              {rule.target_type}
            </div>
          </div>
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

        <RuleConfigFields form={ruleConfigForm} dataSourceId={rule.data_source_id} />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存更改'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
