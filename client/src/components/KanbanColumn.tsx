import type { Task } from '../../../src/types';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { TaskCard } from './TaskCard';

interface Props {
  icon: IconName;
  label: string;
  count: number;
  accentBorder: string;
  accentBg: string;
  tasks: Task[];
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  taskActivities: Record<string, string>;
  onSelectTask: (task: Task) => void;
}

export function KanbanColumn({
  icon, label, count, accentBorder, accentBg,
  tasks, projectNames, selectedTaskId, taskActivities, onSelectTask,
}: Props) {
  // Group tasks by project
  const grouped: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!grouped[t.project_id]) grouped[t.project_id] = [];
    grouped[t.project_id].push(t);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-warm-border last:border-r-0">
      {/* Column header */}
      <div className={`px-3 py-2.5 text-center shrink-0 bg-warm-card ${accentBorder}`}>
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <Icon name={icon} size={14} />
          <span className="text-xs font-bold text-warm-text">{label}</span>
        </div>
        <span className={`inline-block text-[10px] text-white px-1.5 py-0.5 rounded-full font-bold ${accentBg}`}>
          {count}
        </span>
      </div>

      {/* Column body */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-[11px] text-warm-text-secondary text-center py-8">
            暂无任务
          </div>
        ) : (
          Object.entries(grouped).map(([projectId, projectTasks]) => (
            <div key={projectId} className="mb-3">
              <h3 className="text-[10px] font-bold text-warm-brown uppercase tracking-wide mb-1.5 px-1">
                <Icon name="folder" size={11} /> {projectNames[projectId] || projectId}
              </h3>
              <div className="flex flex-col gap-1">
                {projectTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projectName={projectNames[task.project_id] || task.project_id}
                    selected={selectedTaskId === task.id}
                    activity={taskActivities[task.id] || ''}
                    onClick={() => onSelectTask(task)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
