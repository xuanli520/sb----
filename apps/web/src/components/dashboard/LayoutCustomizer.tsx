import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog"; // Assuming shadcn structure
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import { Settings2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';

interface LayoutItem {
  i: string;
  title: string;
  visible: boolean;
}

interface LayoutCustomizerProps {
  items: LayoutItem[];
  onToggle: (id: string, visible: boolean) => void;
}

const LayoutCustomizer: React.FC<LayoutCustomizerProps> = ({ items, onToggle }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 size={14} />
          自定义布局
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] dark:bg-slate-900/95 dark:backdrop-blur-xl dark:border-cyan-500/20">
        <DialogHeader>
          <DialogTitle className="dark:text-white">自定义概览模块</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="text-sm text-muted-foreground mb-2">
            控制仪表盘中显示的卡片。关闭的卡片将被隐藏，但布局位置会保留。
          </div>
          {items.map((item) => (
            <div key={item.i} className="flex items-center justify-between space-x-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <Label htmlFor={`switch-${item.i}`} className="flex-1 cursor-pointer dark:text-slate-200">
                {item.title}
              </Label>
              <Switch
                id={`switch-${item.i}`}
                checked={item.visible}
                onCheckedChange={(checked) => onToggle(item.i, checked)}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LayoutCustomizer;
