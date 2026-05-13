import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Task, Decision, WsMessage, TaskOutputPayload } from '../../src/types';
import { listProjects, listTasks, startTask, stopTask, continueTask, deleteTask, deleteProject, approveTask } from './api';
import { useWebSocket } from './useWebSocket';
import { TABS, type TabKey } from './status';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { TopBar } from './components/TopBar';
import { ListPanel } from './components/ListPanel';
import { DetailPanel } from './components/DetailPanel';
import { ProjectView } from './components/ProjectView';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { EditTaskModal } from './components/EditTaskModal';
import { ReviewModal } from './components/ReviewModal';
import { LogViewer } from './components/LogViewer';
import { createChunkParser, type ChunkParser } from './activity';

type Tab = 'projects' | TabKey;

type ProjectData = Project & {
  count_pending: number; count_running: number; count_deciding: number;
  count_reviewing: number; count_done: number;
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeTab, setActiveTab] = useState<Tab>('action');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<string, { stream: string; text: string }[]>>({});
  const [taskActivities, setTaskActivities] = useState<Record<string, string>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Task | null>(null);
  const parsersRef = useRef<Record<string, ChunkParser>>({});

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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
      setTaskActivities(prev => { const next = { ...prev }; delete next[id]; return next; });
      delete parsersRef.current[id];
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
      if (payload.stream === 'stdout') {
        if (!parsersRef.current[payload.taskId]) {
          parsersRef.current[payload.taskId] = createChunkParser();
        }
        const activity = parsersRef.current[payload.taskId].feed(payload.text);
        if (activity) {
          setTaskActivities(prev => ({ ...prev, [payload.taskId]: activity }));
        }
      }
    }
  }, [loadProjects, selectedTaskId]));

  useEffect(() => {
    if (selectedTaskId) setDetailVisible(true);
  }, [selectedTaskId]);

  // Desktop drag resize — skip on mobile
  useEffect(() => {
    if (isMobile) return;
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
  }, [isMobile]);

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

  // Aggregate counts by tab instead of by status
  const counts: Record<string, number> = {};
  allTasks.forEach(t => {
    const tab = TABS.find(tab => (tab.statuses as readonly string[]).includes(t.status));
    if (tab) {
      counts[tab.key] = (counts[tab.key] || 0) + 1;
    }
  });

  const detailPanel = (
    <DetailPanel
      task={selectedTask}
      projectName={selectedTask ? (projectNames[selectedTask.project_id] || '') : ''}
      logs={selectedTask ? (taskOutputs[selectedTask.id] || []) : []}
      isMobile={isMobile}
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
      onDecisionResolved={() => {
        if (selectedTask) handleRefresh(selectedTask.project_id);
      }}
      onApprove={async () => {
        if (selectedTask) {
          await approveTask(selectedTask.id);
          handleRefresh(selectedTask.project_id);
        }
      }}
      onReject={() => {}}
      onRejectSubmitted={() => {
        if (selectedTask) handleRefresh(selectedTask.project_id);
      }}
      onViewLogs={() => selectedTask && setViewingLogs(selectedTask)}
      onClose={() => setDetailVisible(false)}
    />
  );

  const handleSelectTab = (tab: 'projects') => {
    setActiveTab(tab);
  };

  return (
    <div ref={containerRef} className="flex h-screen overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activeTab={activeTab} onSelectTab={handleSelectTab} />
        <div className="flex flex-1 overflow-hidden" style={isMobile ? { paddingBottom: '3.5rem' } : undefined}>
          <Sidebar
            activeTab={activeTab as TabKey}
            counts={counts}
            onSelectTab={setActiveTab as (tab: TabKey) => void}
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
                activeTab={activeTab as TabKey}
                tasksByProject={tasksByProject}
                projectNames={projectNames}
                selectedTaskId={selectedTaskId}
                taskActivities={taskActivities}
                onSelectTask={(task) => { setSelectedTaskId(task.id); setDetailVisible(true); }}
                onCreateTask={() => setShowCreateTask(true)}
              />
            </div>
          )}
        </div>
      </div>

      {activeTab !== 'projects' && detailVisible && (
        isMobile ? (
          detailPanel
        ) : (
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
              {detailPanel}
            </div>
          </>
        )
      )}

      <BottomNav
        activeTab={activeTab as TabKey}
        counts={counts}
        onSelectTab={setActiveTab as (tab: TabKey) => void}
      />

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
