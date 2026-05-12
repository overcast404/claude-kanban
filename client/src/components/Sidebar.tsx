import { useState, useMemo } from 'react';
import { NavItem } from './NavItem';
import { QrCodeModal } from './QrCodeModal';
import { STATUS_ICON, STATUS_LABEL, STATUS_ORDER, ACTION_LABEL, ACTION_ICON } from '../status';
import type { TaskStatus } from '../../../src/types';

export type SidebarTab = 'projects' | 'action' | TaskStatus;

interface Props {
  activeTab: SidebarTab;
  counts: Record<string, number>;
  onSelectTab: (tab: SidebarTab) => void;
}

export function Sidebar({ activeTab, counts, onSelectTab }: Props) {
  const [showQr, setShowQr] = useState(false);
  const actionCount = (counts['deciding'] || 0) + (counts['reviewing'] || 0);

  const items = useMemo(() => {
    const result: { key: string; icon: typeof ACTION_ICON; label: string; count: number; tab: SidebarTab; danger?: boolean }[] = [];
    for (const s of STATUS_ORDER) {
      if (s === 'deciding' || s === 'reviewing') continue;
      if (s === 'done') {
        result.push({ key: 'action', icon: ACTION_ICON, label: ACTION_LABEL, count: actionCount, tab: 'action', danger: true });
      }
      result.push({ key: s, icon: STATUS_ICON[s], label: STATUS_LABEL[s], count: counts[s] || 0, tab: s });
    }
    return result;
  }, [actionCount, counts]);

  return (
    <>
      <aside className="w-14 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card">
        {items.map(item => (
          <NavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            count={item.count}
            dangerBadge={item.danger}
            active={activeTab === item.tab}
            onClick={() => onSelectTab(item.tab)}
          />
        ))}
        <hr className="w-8 border-warm-border" />
        <NavItem
          icon="folder"
          label="项目"
          active={activeTab === 'projects'}
          onClick={() => onSelectTab('projects')}
        />
        <NavItem
          icon="smartphone"
          label="扫码"
          active={false}
          onClick={() => setShowQr(true)}
        />
      </aside>
      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </>
  );
}
