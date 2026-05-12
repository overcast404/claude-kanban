import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Task, Decision, WsMessage, TaskOutputPayload, TaskStatus } from '../../src/types';
import { listProjects, listTasks, startTask, stopTask, continueTask, deleteTask, deleteProject } from './api';
import { useWebSocket } from './useWebSocket';
import { Sidebar, type SidebarTab } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ListPanel } from './components/ListPanel';
import { DetailPanel } from './components/DetailPanel';
import { ProjectView } from './components/ProjectView';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { EditTaskModal } from './components/EditTaskModal';
import { DecisionModal } from './components/DecisionModal';
import { ReviewModal } from './components/ReviewModal';
import { LogViewer } from './components/LogViewer';

type Tab = 'projects' | 'action' | TaskStatus;

type ProjectData = Project & {
  count_pending: number; count_running: number; count_deciding: number;
  count_reviewing: number; count_done: number;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('action');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<string, { stream: string; text: string }[]>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Task | null>(null);

  // Modal state
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [decidingTask, setDecidingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);

  const [detailVisible, setDetailVisible] = useState(true);
  const [detailWidth, setDetailWidth] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);

  const loadProjects = useCallback(async () => {
    const ps = await listProjects();
    setProjects(ps as unknown as ProjectData[]);
  }, []);

  const loadTasks = useCallback(async (projectId: string) => {
    const ts = await listTasks(projectId);
    setTasks(prev => ({ ...prev, [projectId]: ts }));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    projects.forEach(p => loadTasks(p.id));
  }, [projects, loadTasks]);

  useWebSocket(useCallback((msg: WsMessage) => {
    if (msg.type === 'task_updated' || msg.type === 'task_created') {
      const task = msg.payload as Task;
      setTasks(prev => {
        const existing = prev[task.project_id] || [];
        const idx = existing.findIndex(t => t.id === task.id);
        const updated = idx >= 0
          ? existing.map((t, i) => i === idx ? task : t)
          : [task, ...existing];
        return { ...prev, [task.project_id]: updated };
      });
      loadProjects();
    } else if (msg.type === 'task_deleted') {
      const { id, project_id } = msg.payload as { id: string; project_id?: string };
      if (project_id) {
        setTasks(prev => ({
          ...prev,
          [project_id]: (prev[project_id] || []).filter(t => t.id !== id),
        }));
        if (selectedTaskId === id) setSelectedTaskId(null);
      }
      setTaskOutputs(prev => { const next = { ...prev }; delete next[id]; return next; });
      loadProjects();
    } else if (msg.type === 'project_deleted') {
      const { id } = msg.payload as { id: string };
      setProjects(prev => prev.filter(p => p.id !== id));
      setTasks(prev => { const next = { ...prev }; delete next[id]; return next; });
      loadProjects();
    } else if (msg.type === 'decision_created') {
      loadProjects();
    } else if (msg.type === 'task_output') {
      const payload = msg.payload as TaskOutputPayload;
      setTaskOutputs(prev => ({
        ...prev,
        [payload.taskId]: [...(prev[payload.taskId] || []), { stream: payload.stream, text: payload.text }],
      }));
    }
  }, [loadProjects, selectedTaskId]));

  useEffect(() => {
    if (selectedTaskId) setDetailVisible(true);
  }, [selectedTaskId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((rect.right - e.clientX) / rect.width) * 100;
      setDetailWidth(Math.min(70, Math.max(20, percent)));
    };
    const handleMouseUp = () => {
      resizingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleRefresh = (projectId?: string) => {
    if (projectId) {
      loadTasks(projectId);
    } else {
      projects.forEach(p => loadTasks(p.id));
    }
    loadProjects();
  };

  const allTasks = Object.values(tasks).flat();
  const selectedTask = allTasks.find(t => t.id === selectedTaskId) || null;

  const tasksByProject = tasks;
  const projectNames: Record<string, string> = {};
  projects.forEach(p => { projectNames[p.id] = p.name; });

  const counts: Record<string, number> = {};
  allTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });

  return (
    <div ref={containerRef} className="flex h-screen overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeTab={activeTab} onSelectTab={setActiveTab} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            counts={counts}
            onSelectTab={setActiveTab}
          />

          {activeTab === 'projects' ? (
            <ProjectView
              projects={projects}
              onCreate={() => setShowCreateProject(true)}
              onDelete={async (p) => {
                if (confirm(`确定删除项目 "${p.name}" 及其所有任务？`)) {
                  await deleteProject(p.id);
                  handleRefresh();
                }
              }}
            />
          ) : (
            <div className="flex-1 min-w-0">
              <ListPanel
                activeTab={activeTab}
                tasksByProject={tasksByProject}
                projectNames={projectNames}
                selectedTaskId={selectedTaskId}
                onSelectTask={(task) => { setSelectedTaskId(task.id); setDetailVisible(true); }}
                onCreateTask={() => setShowCreateTask(true)}
              />
            </div>
          )}
        </div>
      </div>

      {activeTab !== 'projects' && detailVisible && (
        <>
          <div
            className="w-1.5 cursor-col-resize bg-warm-border hover:bg-warm-tan shrink-0 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              resizingRef.current = true;
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'col-resize';
            }}
          />
          <div style={{ width: `${detailWidth}%` }} className="min-w-0">
            <DetailPanel
              task={selectedTask}
              projectName={selectedTask ? (projectNames[selectedTask.project_id] || '') : ''}
              logs={selectedTask ? (taskOutputs[selectedTask.id] || []) : []}
              onStart={async () => {
                if (selectedTask) {
                  await startTask(selectedTask.id);
                  handleRefresh(selectedTask.project_id);
                }
              }}
              onStop={async () => {
                if (selectedTask) {
                  await stopTask(selectedTask.id);
                  handleRefresh(selectedTask.project_id);
                }
              }}
              onContinue={async () => {
                if (selectedTask) {
                  await continueTask(selectedTask.id);
                  handleRefresh(selectedTask.project_id);
                }
              }}
              onEdit={() => selectedTask && setEditingTask(selectedTask)}
              onDelete={async () => {
                if (selectedTask && confirm(`确定删除任务 "${selectedTask.title}"？`)) {
                  await deleteTask(selectedTask.id);
                  setSelectedTaskId(null);
                  handleRefresh(selectedTask.project_id);
                }
              }}
              onDecide={() => selectedTask && setDecidingTask(selectedTask)}
              onApprove={() => selectedTask && setReviewingTask(selectedTask)}
              onReject={() => {}}
              onRejectSubmitted={() => {
                if (selectedTask) handleRefresh(selectedTask.project_id);
              }}
              onViewLogs={() => selectedTask && setViewingLogs(selectedTask)}
              onClose={() => setDetailVisible(false)}
            />
          </div>
        </>
      )}

      {showCreateTask && (
        <CreateTaskModal
          projects={projects.map(p => ({ id: p.id, name: p.name }))}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => { setShowCreateTask(false); handleRefresh(); }}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={() => { setShowCreateProject(false); handleRefresh(); }}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { setEditingTask(null); handleRefresh(editingTask.project_id); }}
        />
      )}

      {decidingTask && (
        <DecisionModal
          task={decidingTask}
          onClose={() => setDecidingTask(null)}
          onResolved={() => { setDecidingTask(null); handleRefresh(); }}
        />
      )}

      {reviewingTask && (
        <ReviewModal
          task={reviewingTask}
          onClose={() => setReviewingTask(null)}
          onResolved={() => { setReviewingTask(null); handleRefresh(); }}
        />
      )}

      {viewingLogs && (
        <LogViewer
          taskId={viewingLogs.id}
          taskTitle={viewingLogs.title}
          taskStatus={viewingLogs.status}
          liveOutputs={taskOutputs[viewingLogs.id] || []}
          onClose={() => setViewingLogs(null)}
        />
      )}
    </div>
  );
}
