import type { Project } from '../../../src/types';
import { EmptyState } from './EmptyState';

interface ProjectWithTaskCounts {
  id: string;
  name: string;
  working_dir: string;
  created_at: string;
  count_pending: number;
  count_running: number;
  count_deciding: number;
  count_reviewing: number;
  count_done: number;
}

interface Props {
  projects: ProjectWithTaskCounts[];
  onCreate: () => void;
  onDelete: (project: Project) => void;
}

export function ProjectView({ projects, onCreate, onDelete }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border flex-shrink-0">
        <h2 className="text-sm font-bold text-warm-text">📁 项目</h2>
        <button
          onClick={onCreate}
          className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors"
        >
          + 新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {projects.length === 0 ? (
          <EmptyState icon="📁" message="还没有项目，点击上方按钮创建" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {projects.map(p => (
              <div
                key={p.id}
                className="bg-warm-card border border-warm-border rounded-lg p-3.5 flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-warm-text">{p.name}</div>
                  <div className="text-[10px] text-warm-text-secondary mt-0.5 truncate">{p.working_dir}</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {p.count_pending > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_pending}待启动</span>
                    )}
                    {p.count_running > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_running}进行中</span>
                    )}
                    {p.count_deciding > 0 && (
                      <span className="text-[9px] bg-warm-danger-bg text-warm-danger px-1.5 py-0.5 rounded">{p.count_deciding}待决策</span>
                    )}
                    {p.count_reviewing > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_reviewing}待验收</span>
                    )}
                    {p.count_done > 0 && (
                      <span className="text-[9px] bg-warm-border text-warm-brown px-1.5 py-0.5 rounded">{p.count_done}已完成</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(p)}
                  className="text-[10px] border border-warm-danger text-warm-danger px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-warm-danger-bg transition-all flex-shrink-0 ml-3"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
