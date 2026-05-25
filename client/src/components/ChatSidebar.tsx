import type { Project } from '../../../src/types';
import { Icon } from './Icon';

interface ProjectWithCounts extends Project {
  count_pending: number;
  count_running: number;
  count_deciding: number;
  count_reviewing: number;
  count_stopped: number;
}

interface Props {
  projects: ProjectWithCounts[];
  onProjectClick: (projectName: string) => void;
  gitStatuses: Record<string, { changedFiles: number }>;
}

export function ChatSidebar({ projects, onProjectClick, gitStatuses }: Props) {
  return (
    <div className="w-[170px] shrink-0 bg-warm-card border-r border-warm-border flex flex-col max-md:hidden">
      <div className="px-3 py-3 font-semibold text-[12px] text-warm-brown flex items-center gap-1.5">
        <Icon name="message-circle" size={16} />
        群聊成员
      </div>
      <div className="flex-1 overflow-y-auto px-2 flex flex-col gap-1">
        {projects.map(p => {
          const activeCount = p.count_running + p.count_deciding + p.count_reviewing + p.count_stopped;
          const hasActive = activeCount > 0;
          const gitStatus = gitStatuses[p.id];
          return (
            <button
              key={p.id}
              onClick={() => onProjectClick(p.name)}
              className={`flex items-center gap-2 px-2 py-2 rounded-md text-[12px] transition-colors text-left ${
                hasActive
                  ? 'bg-warm-brown/10 text-warm-brown font-medium'
                  : 'text-warm-text-secondary hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  hasActive ? 'bg-green-400' : 'bg-gray-300'
                }`}
              />
              <span className="truncate flex-1">{p.name}</span>
              {gitStatus && gitStatus.changedFiles > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0">
                  <Icon name="git-branch" size={11} />
                  {gitStatus.changedFiles}
                </span>
              )}
              {activeCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  hasActive ? 'bg-warm-brown/20 text-warm-brown' : 'bg-gray-100 text-gray-400'
                }`}>
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="px-3 py-2 text-[10px] text-warm-text-secondary text-center border-t border-warm-border">
        💡 @成员名 即可创建新任务
      </div>
    </div>
  );
}
