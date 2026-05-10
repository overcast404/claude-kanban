import type { Task, TaskStatus } from '../../../src/types';
import { ProjectGroup } from './ProjectGroup';
import { EmptyState } from './EmptyState';
import { STATUS_LABEL, STATUS_ICON } from '../status';

interface Props {
  activeTab: TaskStatus;
  tasksByProject: Record<string, Task[]>;
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function ListPanel({
  activeTab, tasksByProject, projectNames,
  selectedTaskId, onSelectTask, onCreateTask,
}: Props) {
  const filtered = Object.entries(tasksByProject).filter(
    ([, tasks]) => tasks.some(t => t.status === activeTab)
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border flex-shrink-0">
        <h2 className="text-sm font-bold text-warm-text">
          {STATUS_ICON[activeTab]} {STATUS_LABEL[activeTab]}
        </h2>
        {(activeTab === 'pending' || activeTab === 'running') && (
          <button
            onClick={onCreateTask}
            className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors"
          >
            + 任务
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState icon={STATUS_ICON[activeTab]} message={`没有${STATUS_LABEL[activeTab]}的任务`} />
        ) : (
          filtered.map(([projectId, tasks]) => (
            <ProjectGroup
              key={projectId}
              projectName={projectNames[projectId] || projectId}
              tasks={tasks.filter(t => t.status === activeTab)}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
