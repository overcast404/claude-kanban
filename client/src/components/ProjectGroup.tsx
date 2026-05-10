import type { Task } from '../../../src/types';
import { TaskCard } from './TaskCard';

interface Props {
  projectName: string;
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (task: Task) => void;
}

export function ProjectGroup({ projectName, tasks, selectedTaskId, onSelectTask }: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-bold text-warm-brown uppercase tracking-wide mb-2">
        📁 {projectName}
      </h3>
      <div className="flex flex-col gap-1.5">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            projectName={projectName}
            selected={selectedTaskId === task.id}
            onClick={() => onSelectTask(task)}
          />
        ))}
      </div>
    </div>
  );
}
