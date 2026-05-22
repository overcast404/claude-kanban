import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export function Sidebar({ activeTab, onSelectTab }: Props) {
  return (
    <aside className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card max-md:hidden">
      {TABS.map(item => (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          count={0}
          dangerBadge={false}
          active={activeTab === item.key}
          onClick={() => onSelectTab(item.key)}
        />
      ))}
    </aside>
  );
}
