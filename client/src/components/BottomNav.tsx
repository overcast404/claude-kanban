import { TABS, type TabKey } from '../status';
import { NavItem } from './NavItem';

interface Props {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export function BottomNav({ activeTab, onSelectTab }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-warm-card border-t border-warm-border flex items-center justify-around px-2 z-20"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
    </nav>
  );
}
