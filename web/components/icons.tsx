import {
  Blocks,
  Briefcase,
  Calendar,
  ChartColumn,
  Circle,
  FileText,
  LayoutDashboard,
  Mail,
  Settings,
  SquareKanban,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Назви іконок зберігаються в БД (menu_items.icon) — тут їхня відповідність компонентам
const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  briefcase: Briefcase,
  kanban: SquareKanban,
  calendar: Calendar,
  mail: Mail,
  'user-check': UserCheck,
  'bar-chart-3': ChartColumn,
  'file-text': FileText,
  settings: Settings,
  blocks: Blocks,
};

export function MenuIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Circle;
  return <Icon className={className} aria-hidden="true" />;
}
