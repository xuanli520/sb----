import React from 'react';
import { TargetType } from '@/types';
import { List, ShoppingCart, Users, MessageSquare, BarChart3, Globe, Tag, PlayCircle, Package, UserCircle } from 'lucide-react';

interface RuleTypeTagProps {
  type: TargetType;
}

export function RuleTypeTag({ type }: RuleTypeTagProps) {
  const config: Record<string, { icon: React.ElementType; label: string; className: string }> = {
    SHOP_OVERVIEW: {
      icon: BarChart3,
      label: '店铺概览',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    TRAFFIC: {
      icon: Globe,
      label: '流量',
      className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    },
    PRODUCT: {
      icon: Package,
      label: '商品',
      className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
    LIVE: {
      icon: PlayCircle,
      label: '直播',
      className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
    CONTENT_VIDEO: {
      icon: List,
      label: '短视频',
      className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
    ORDER_FULFILLMENT: {
      icon: ShoppingCart,
      label: '订单履约',
      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    AFTERSALE_REFUND: {
      icon: Tag,
      label: '售后退款',
      className: 'bg-red-500/10 text-red-600 dark:text-red-400',
    },
    CUSTOMER: {
      icon: UserCircle,
      label: '客户',
      className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    },
    ADS: {
      icon: BarChart3,
      label: '广告',
      className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
  };

  const { icon: Icon, label, className } = config[type] || config.SHOP_OVERVIEW;

  return (
    <div className={`px-2 py-1 rounded-md inline-flex items-center gap-2 text-xs font-medium ${className}`}>
      <Icon size={14} />
      {label}
    </div>
  );
}
