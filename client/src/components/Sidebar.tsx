import { useState } from 'react';
import { NavItem } from './NavItem';
import { QrCodeModal } from './QrCodeModal';
import { STATUS_ICON, STATUS_LABEL, STATUS_ORDER } from '../status';
import type { TaskStatus } from '../../../src/types';

interface Props {
  activeTab: 'projects' | TaskStatus;
  counts: Record<string, number>;
  onSelectTab: (tab: 'projects' | TaskStatus) => void;
}

export function Sidebar({ activeTab, counts, onSelectTab }: Props) {
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <aside className="w-14 flex-shrink-0 flex flex-col items-center gap-1 py-3 border-r border-warm-border bg-warm-card">
        {STATUS_ORDER.map(status => (
          <NavItem
            key={status}
            icon={STATUS_ICON[status]}
            label={STATUS_LABEL[status]}
            count={counts[status]}
            dangerBadge={status === 'deciding'}
            active={activeTab === status}
            onClick={() => onSelectTab(status)}
          />
        ))}
        <div className="mt-auto">
          <NavItem
            icon="📁"
            label="项目"
            active={activeTab === 'projects'}
            onClick={() => onSelectTab('projects')}
          />
          <NavItem
            icon="📱"
            label="扫码"
            active={false}
            onClick={() => setShowQr(true)}
          />
        </div>
      </aside>
      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </>
  );
}
