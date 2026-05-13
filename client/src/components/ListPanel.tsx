import type { Task } from '../../../src/types';
import { ProjectGroup } from './ProjectGroup';
import { EmptyState } from './EmptyState';
import { TABS, type TabKey } from '../status';
import { Icon } from './Icon';

interface Props {
  activeTab: TabKey;
  tasksByProject: Record<string, Task[]>;
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  taskActivities: Record<string, string>;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function ListPanel({
  activeTab, tasksByProject, projectNames,
  selectedTaskId, taskActivities, onSelectTask, onCreateTask,
}: Props) {
  const tab = TABS.find(t => t.key === activeTab);
  const statuses = tab?.statuses || [];
  const icon = tab?.icon || 'folder';
  const label = tab?.label || '';

  const filtered = Object.entries(tasksByProject).filter(
    ([, tasks]) => tasks.some(t => statuses.includes(t.status))
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-warm-border shrink-0">
        <h2 className="text-sm font-bold text-warm-text inline-flex items-center gap-1">
          <Icon name={icon} size={16} /> {label}
        </h2>
        {activeTab === 'in-progress' && (
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
              taskActivities={taskActivities}
              onSelectTask={onSelectTask}
            />
          ))
        )}
      </div>
    </div>
  );
}
