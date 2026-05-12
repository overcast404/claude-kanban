import { useState } from 'react';
import { Icon } from './Icon';
import { QrCodeModal } from './QrCodeModal';

interface Props {
  activeTab: string;
  onSelectTab: (tab: 'projects') => void;
}

export function TopBar({ activeTab, onSelectTab }: Props) {
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between h-10 px-3 border-b border-warm-border bg-warm-card shrink-0">
        <span className="text-sm font-bold text-warm-brown">Claude Kanban</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onSelectTab('projects')}
            className={`inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors ${
              activeTab === 'projects'
                ? 'text-warm-brown font-bold'
                : 'text-warm-text-secondary hover:text-warm-brown'
            }`}
          >
            <Icon name="folder" size={15} /> <span className="max-md:hidden">项目</span>
          </button>
          <button
            onClick={() => setShowQr(true)}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-xs text-warm-text-secondary hover:text-warm-brown transition-colors"
          >
            <Icon name="smartphone" size={15} /> <span className="max-md:hidden">扫码</span>
          </button>
        </div>
      </div>
      {showQr && <QrCodeModal onClose={() => setShowQr(false)} />}
    </>
  );
}
