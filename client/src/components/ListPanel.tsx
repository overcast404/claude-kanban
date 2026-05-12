import type { Task, TaskStatus } from '../../../src/types';
import { ProjectGroup } from './ProjectGroup';
import { EmptyState } from './EmptyState';
import { STATUS_LABEL, STATUS_ICON, ACTION_LABEL, ACTION_ICON, ACTION_STATUSES } from '../status';
import { Icon } from './Icon';

interface Props {
  activeTab: 'action' | TaskStatus;
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
  const statuses = activeTab === 'action' ? ACTION_STATUSES : [activeTab];
  const isAction = activeTab === 'action';
  const icon = isAction ? ACTION_ICON : STATUS_ICON[activeTab];
  const label = isAction ? ACTION_LABEL : STATUS_LABEL[activeTab];

  const filtered = Object.entries(tasksByProject).filter(
    ([, tasks]) => tasks.some(t => statuses.includes(t.status))
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border shrink-0">
        <h2 className="text-sm font-bold text-warm-text inline-flex items-center gap-1">
          <Icon name={icon} size={16} /> {label}
        </h2>
        {(activeTab === 'pending' || activeTab === 'running') && (
          <button
            onClick={onCreateTask}
            className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1"
          >
            <Icon name="plus" size={13} /> 任务
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <EmptyState icon={icon} message={`没有${label}的任务`} />
        ) : (
          filtered.map(([projectId, tasks]) => (
            <ProjectGroup
              key={projectId}
              projectName={projectNames[projectId] || projectId}
              tasks={tasks.filter(t => statuses.includes(t.status))}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
