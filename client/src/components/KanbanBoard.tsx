import type { Task } from '../../../src/types';
import { BOARD_COLUMNS } from '../status';
import { KanbanColumn } from './KanbanColumn';
import { Icon } from './Icon';

interface Props {
  tasksByProject: Record<string, Task[]>;
  projectNames: Record<string, string>;
  selectedTaskId: string | null;
  taskActivities: Record<string, string>;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function KanbanBoard({
  tasksByProject, projectNames, selectedTaskId,
  taskActivities, onSelectTask, onCreateTask,
}: Props) {
  // Flatten all tasks
  const allTasks = Object.values(tasksByProject).flat();

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-warm-border shrink-0">
        <h2 className="text-sm font-bold text-warm-text inline-flex items-center gap-1">
          <Icon name="clipboard" size={16} /> 看板
        </h2>
        <button
          onClick={onCreateTask}
          className="text-[11px] bg-warm-brown text-white px-3 py-1.5 rounded-lg font-bold hover:bg-warm-brown-hover transition-colors inline-flex items-center gap-1"
        >
          <Icon name="plus" size={13} /> 任务
        </button>
      </div>

      {/* Three columns */}
      <div className="flex-1 flex overflow-hidden">
        {BOARD_COLUMNS.map(col => {
          const columnTasks = allTasks.filter(t =>
            (col.statuses as readonly string[]).includes(t.status)
          );
          return (
            <KanbanColumn
              key={col.key}
              icon={col.icon}
              label={col.label}
              count={columnTasks.length}
              accentBorder={col.accentBorder}
              accentBg={col.accentBg}
              tasks={columnTasks}
              projectNames={projectNames}
              selectedTaskId={selectedTaskId}
              taskActivities={taskActivities}
              onSelectTask={onSelectTask}
            />
          );
        })}
      </div>
    </div>
  );
}
