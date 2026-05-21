import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, Task, TaskStatus, Decision, WsMessage, TaskOutputPayload } from '../../src/types';
import { listProjects, listTasks, createTask, startTask, stopTask, continueTask, deleteTask, deleteProject, approveTask, submitDecision, rejectTask, fetchChatMessages, saveChatMessage } from './api';
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
import { createChunkParser, type ChunkParser } from './activity';
import { ChatPanel } from './components/ChatPanel';
import { ThreadPanel } from './components/ThreadPanel';

type Tab = 'projects' | TabKey;

type ProjectData = Project & {
  count_pending: number; count_running: number; count_deciding: number;
  count_reviewing: number; count_done: number;
};

export interface ChatMessage {
  id: string;
  taskId: string;
  projectId: string;
  projectName: string;
  type: 'user_message' | 'ai_execution' | 'ai_decision' | 'ai_review' | 'system';
  content: string;
  quoteMessageId?: string;
  decision?: Decision;
  round: number;
  timestamp: string;
}

function chatMsgId() {
  return 'cm_' + Math.random().toString(36).slice(2, 10);
}

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
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('ck_tab') as Tab) || 'action'; } catch { return 'action'; }
  });
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<string, { stream: string; text: string }[]>>({});
  const [taskActivities, setTaskActivities] = useState<Record<string, string>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const parsersRef = useRef<Record<string, ChunkParser>>({});
  const chatParsersRef = useRef<Record<string, ChunkParser>>({});
  const streamSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Save a chat message to server (fire-and-forget)
  const persistMsg = useCallback((msg: ChatMessage) => {
    saveChatMessage({
      id: msg.id,
      taskId: msg.taskId,
      projectId: msg.projectId,
      projectName: msg.projectName,
      type: msg.type,
      content: msg.content,
      quoteMessageId: msg.quoteMessageId,
      decision: msg.decision,
      round: msg.round,
      timestamp: msg.timestamp,
    }).catch(() => {});
  }, []);

  // Debounced save for streaming updates (every 3s max per task)
  const persistMsgDebounced = useCallback((msg: ChatMessage) => {
    if (streamSaveTimers.current[msg.id]) {
      clearTimeout(streamSaveTimers.current[msg.id]);
    }
    streamSaveTimers.current[msg.id] = setTimeout(() => {
      persistMsg(msg);
      delete streamSaveTimers.current[msg.id];
    }, 3000);
  }, [persistMsg]);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [quoteTarget, setQuoteTarget] = useState<ChatMessage | null>(null);
  const [threadTaskId, setThreadTaskId] = useState<string | null>(null);
  const lastTaskStatus = useRef<Record<string, TaskStatus>>({});
  const taskRounds = useRef<Record<string, number>>({});
  const taskLastUserMsg = useRef<Record<string, string>>({});

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

  // Persist active tab across refreshes
  useEffect(() => {
    try { localStorage.setItem('ck_tab', activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => {
    projects.forEach(p => loadTasks(p.id));
  }, [projects, loadTasks]);

  // Load persisted chat messages on mount
  useEffect(() => {
    fetchChatMessages().then(rows => {
      if (rows.length > 0) {
        const msgs: ChatMessage[] = rows.map(r => {
          // Fix double-encoded options string from DB
          let decision: Decision | undefined;
          if (r.decision) {
            const raw = r.decision as Record<string, unknown>;
            decision = {
              ...raw,
              options: typeof raw.options === 'string' ? JSON.parse(raw.options as string) : raw.options,
            } as Decision;
          }
          return {
            id: r.id,
            taskId: r.taskId,
            projectId: r.projectId,
            projectName: r.projectName,
            type: r.type as ChatMessage['type'],
            content: r.content,
            quoteMessageId: r.quoteMessageId,
            decision,
            round: r.round,
            timestamp: r.timestamp,
          };
        });
        // Restore taskLastUserMsg from loaded messages
        for (const m of msgs) {
          if (m.type === 'user_message' && m.taskId) {
            taskLastUserMsg.current[m.taskId] = m.id;
          }
        }
        setChatMessages(msgs);
      }
    }).catch(() => {}); // server may not be ready yet
  }, []);

  // Sync chat messages to server for persistence
  const prevMsgSnap = useRef<{ ids: Set<string>; contents: Map<string, string>; types: Map<string, string>; decisions: Map<string, string> }>({ ids: new Set(), contents: new Map(), types: new Map(), decisions: new Map() });
  useEffect(() => {
    const prev = prevMsgSnap.current;
    for (const msg of chatMessages) {
      const decJson = msg.decision ? JSON.stringify(msg.decision) : '';
      if (!prev.ids.has(msg.id)) {
        // New message — save immediately
        persistMsg(msg);
      } else if (prev.contents.get(msg.id) !== msg.content || prev.types.get(msg.id) !== msg.type || prev.decisions.get(msg.id) !== decJson) {
        // Modified (content, type, or decision change) — debounced save
        persistMsgDebounced(msg);
      }
    }
    // Update snapshot
    prevMsgSnap.current = {
      ids: new Set(chatMessages.map(m => m.id)),
      contents: new Map(chatMessages.map(m => [m.id, m.content])),
      types: new Map(chatMessages.map(m => [m.id, m.type])),
      decisions: new Map(chatMessages.map(m => [m.id, m.decision ? JSON.stringify(m.decision) : ''])),
    };
  }, [chatMessages, persistMsg, persistMsgDebounced]);

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

    // === Chat: WS message to chat bubble mapping ===
    if (msg.type === 'task_updated') {
      const task = msg.payload as Task;
      const prevStatus = lastTaskStatus.current[task.id];
      lastTaskStatus.current[task.id] = task.status;

      const proj = projectsRef.current.find(p => p.id === task.project_id);
      const pName = proj?.name || task.project_id;

      if (task.status === 'running' && (!prevStatus || prevStatus === 'pending')) {
        // First execution — create ai_execution bubble
        taskRounds.current[task.id] = 0;
        setChatMessages(prev => [...prev, {
          id: chatMsgId(),
          taskId: task.id,
          projectId: task.project_id,
          projectName: pName,
          type: 'ai_execution',
          content: '',
          quoteMessageId: taskLastUserMsg.current[task.id],
          round: 0,
          timestamp: new Date().toISOString(),
        }]);
      } else if (task.status === 'running' && prevStatus && prevStatus !== 'pending' && prevStatus !== 'running') {
        // Resumed after deciding or rejected — new AI execution bubble with incremented round
        const round = (taskRounds.current[task.id] || 0) + 1;
        taskRounds.current[task.id] = round;
        setChatMessages(prev => [...prev, {
          id: chatMsgId(),
          taskId: task.id,
          projectId: task.project_id,
          projectName: pName,
          type: 'ai_execution',
          content: '',
          quoteMessageId: taskLastUserMsg.current[task.id],
          round,
          timestamp: new Date().toISOString(),
        }]);
      }

      if (task.status === 'deciding') {
        // Create new ai_decision bubble, remove latest ai_execution
        setChatMessages(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].taskId === task.id && prev[i].type === 'ai_decision' && !prev[i].decision) {
              return prev; // unresolved bubble already waiting
            }
          }
          // Remove latest ai_execution for this task
          let filtered = prev;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].taskId === task.id && prev[i].type === 'ai_execution') {
              filtered = prev.filter((_, idx) => idx !== i);
              break;
            }
          }
          return [...filtered, {
            id: chatMsgId(),
            taskId: task.id,
            projectId: task.project_id,
            projectName: pName,
            type: 'ai_decision',
            content: '',
            quoteMessageId: taskLastUserMsg.current[task.id],
            round: taskRounds.current[task.id] || 0,
            timestamp: new Date().toISOString(),
          }];
        });
      }

      if (task.status === 'reviewing') {
        // Create new ai_review bubble, remove latest ai_execution
        setChatMessages(prev => {
          let filtered = prev;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].taskId === task.id && prev[i].type === 'ai_execution') {
              filtered = prev.filter((_, idx) => idx !== i);
              break;
            }
          }
          return [...filtered, {
            id: chatMsgId(),
            taskId: task.id,
            projectId: task.project_id,
            projectName: pName,
            type: 'ai_review',
            content: task.summary || '任务已完成',
            quoteMessageId: taskLastUserMsg.current[task.id],
            round: taskRounds.current[task.id] || 0,
            timestamp: new Date().toISOString(),
          }];
        });
      }

      if (task.status === 'done') {
        setChatMessages(prev => [...prev, {
          id: chatMsgId(),
          taskId: task.id,
          projectId: task.project_id,
          projectName: pName,
          type: 'system',
          content: `✅ ${pName} 任务完成`,
          round: taskRounds.current[task.id] || 0,
          timestamp: new Date().toISOString(),
        }]);
      }
    }

    if (msg.type === 'task_created') {
      const task = msg.payload as Task;
      lastTaskStatus.current[task.id] = 'pending';
    }

    if (msg.type === 'decision_created') {
      const { task, decision: rawDecision } = msg.payload as { task: Task; decision: Decision };
      // Parse options if stored as JSON string (DB TEXT column issue)
      const decision = {
        ...rawDecision,
        options: typeof rawDecision.options === 'string'
          ? JSON.parse(rawDecision.options as string)
          : rawDecision.options,
      };
      lastTaskStatus.current[task.id] = 'deciding';
      const proj = projectsRef.current.find(p => p.id === task.project_id);
      const pName = proj?.name || task.project_id;
      setChatMessages(prev => {
        // Remove latest ai_execution for this task
        let filtered = prev;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].taskId === task.id && prev[i].type === 'ai_execution') {
            filtered = prev.filter((_, idx) => idx !== i);
            break;
          }
        }
        // Find the latest unresolved ai_decision and populate it
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (filtered[i].taskId === task.id && filtered[i].type === 'ai_decision') {
            if (!filtered[i].decision) {
              const updated = [...filtered];
              updated[i] = { ...updated[i], content: decision.question, decision };
              return updated;
            }
            break;
          }
        }
        return [...filtered, {
          id: chatMsgId(),
          taskId: task.id,
          projectId: task.project_id,
          projectName: pName,
          type: 'ai_decision',
          content: decision.question,
          decision,
          quoteMessageId: taskLastUserMsg.current[task.id],
          round: taskRounds.current[task.id] || 0,
          timestamp: new Date().toISOString(),
        }];
      });
    }

    if (msg.type === 'task_output') {
      const payload = msg.payload as TaskOutputPayload;
      // Parse output for chat: show concise activity like "Read: src/foo.ts"
      if (payload.stream === 'stdout') {
        if (!chatParsersRef.current[payload.taskId]) {
          chatParsersRef.current[payload.taskId] = createChunkParser();
        }
        const activity = chatParsersRef.current[payload.taskId].feed(payload.text);
        if (activity) {
          setChatMessages(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].taskId === payload.taskId && updated[i].type === 'ai_execution') {
                if (activity !== updated[i].content) {
                  updated[i] = { ...updated[i], content: activity };
                }
                break;
              }
            }
            return updated;
          });
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

  // === Chat: user action handlers ===
  const handleChatSend = useCallback(async (text: string, quoteMessageId?: string) => {
    // If replying to an AI bubble (review or decision), continue the existing task
    if (quoteMessageId) {
      const quotedMsg = chatMessages.find(m => m.id === quoteMessageId);
      if (quotedMsg && (quotedMsg.type === 'ai_review' || quotedMsg.type === 'ai_decision')) {
        const replyMsg: ChatMessage = {
          id: chatMsgId(),
          taskId: quotedMsg.taskId,
          projectId: quotedMsg.projectId,
          projectName: quotedMsg.projectName,
          type: 'user_message',
          content: '↩ ' + quotedMsg.content.slice(0, 50) + '\n' + text,
          quoteMessageId,
          round: quotedMsg.round,
          timestamp: new Date().toISOString(),
        };
        setChatMessages(prev => [...prev, replyMsg]);
        taskLastUserMsg.current[quotedMsg.taskId] = replyMsg.id;
        lastTaskStatus.current[quotedMsg.taskId] = 'running'; // prevent WS duplicate

        // Optimistically create new AI execution bubble for resumed work
        const exeRound = (taskRounds.current[quotedMsg.taskId] || 0) + 1;
        taskRounds.current[quotedMsg.taskId] = exeRound;
        const exeBubble: ChatMessage = {
          id: chatMsgId(),
          taskId: quotedMsg.taskId,
          projectId: quotedMsg.projectId,
          projectName: quotedMsg.projectName,
          type: 'ai_execution',
          content: '',
          quoteMessageId: replyMsg.id,
          round: exeRound,
          timestamp: new Date().toISOString(),
        };
        setChatMessages(prev => [...prev, exeBubble]);

        try {
          await rejectTask(quotedMsg.taskId, text);
          handleRefresh(quotedMsg.projectId);
        } catch (err) {
          console.error('Reply failed:', err);
          setChatMessages(prev => prev.filter(m => m.id !== replyMsg.id && m.id !== exeBubble.id));
        }
        setQuoteTarget(null);
        return;
      }
    }

    // Otherwise create a new task via @mention
    const atMatch = text.match(/^@(\S+)\s+(.+)/);
    if (!atMatch) return;
    const [, projectName, description] = atMatch;
    const project = projects.find(p => p.name === projectName);
    if (!project) return;

    const userMsg: ChatMessage = {
      id: chatMsgId(),
      taskId: '',  // temporary, will update after creation
      projectId: project.id,
      projectName: project.name,
      type: 'user_message',
      content: text,
      quoteMessageId,
      round: 0,
      timestamp: new Date().toISOString(),
    };

    try {
      const task = await createTask(project.id, { title: description.slice(0, 80), description });
      userMsg.taskId = task.id;
      setChatMessages(prev => [...prev, userMsg]);
      lastTaskStatus.current[task.id] = 'pending';
      taskLastUserMsg.current[task.id] = userMsg.id;
      await startTask(task.id);
      loadProjects();
      loadTasks(project.id);
    } catch (err) {
      console.error('Chat send failed:', err);
      setChatMessages(prev => prev.filter(m => m.id !== userMsg.id));
    }
  }, [projects, loadProjects, loadTasks, chatMessages, handleRefresh]);

  const handleChatDecision = useCallback(async (msg: ChatMessage, answer: string) => {
    if (!answer) return;

    const quoteContent = msg.content.slice(0, 100);
    const replyMsg: ChatMessage = {
      id: chatMsgId(),
      taskId: msg.taskId,
      projectId: msg.projectId,
      projectName: msg.projectName,
      type: 'user_message',
      content: '↩ ' + quoteContent + '\n' + answer,
      quoteMessageId: msg.id,
      round: msg.round,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, replyMsg]);
    taskLastUserMsg.current[msg.taskId] = replyMsg.id;
    lastTaskStatus.current[msg.taskId] = 'running'; // prevent WS duplicate

    // Mark decision bubble as resolved (read-only with answer shown)
    setChatMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].id === msg.id && updated[i].type === 'ai_decision') {
          updated[i] = { ...updated[i], decision: { ...updated[i].decision!, answer } };
          break;
        }
      }
      return updated;
    });

    // Optimistically create a new AI execution bubble for the resumed work
    const exeRound = (taskRounds.current[msg.taskId] || 0) + 1;
    taskRounds.current[msg.taskId] = exeRound;
    const exeBubble: ChatMessage = {
      id: chatMsgId(),
      taskId: msg.taskId,
      projectId: msg.projectId,
      projectName: msg.projectName,
      type: 'ai_execution',
      content: '',
      quoteMessageId: replyMsg.id,
      round: exeRound,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, exeBubble]);

    try {
      await submitDecision(msg.taskId, answer);
      handleRefresh(msg.projectId);
    } catch (err) {
      console.error('Decision submit failed:', err);
      setChatMessages(prev => prev.filter(m => m.id !== replyMsg.id || m.id !== exeBubble.id));
    }
  }, [handleRefresh]);

  const handleChatApprove = useCallback(async (msg: ChatMessage) => {
    const systemMsg: ChatMessage = {
      id: chatMsgId(),
      taskId: msg.taskId,
      projectId: msg.projectId,
      projectName: msg.projectName,
      type: 'system',
      content: `✅ ${msg.projectName} 任务已批准完成`,
      round: msg.round,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, systemMsg]);

    try {
      await approveTask(msg.taskId);
      handleRefresh(msg.projectId);
    } catch (err) {
      console.error('Approve failed:', err);
      setChatMessages(prev => prev.filter(m => m.id !== systemMsg.id));
    }
  }, [handleRefresh]);

  const handleChatReject = useCallback(async (msg: ChatMessage) => {
    const feedback = prompt('输入驳回原因（可选，留空直接驳回）:') || '';

    const rejectMsg: ChatMessage = {
      id: chatMsgId(),
      taskId: msg.taskId,
      projectId: msg.projectId,
      projectName: msg.projectName,
      type: 'user_message',
      content: feedback ? `↩ 驳回：${feedback}` : '↩ 驳回，请重新修改',
      quoteMessageId: msg.id,
      round: msg.round,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, rejectMsg]);
    taskLastUserMsg.current[msg.taskId] = rejectMsg.id;

    try {
      await rejectTask(msg.taskId, feedback);
      handleRefresh(msg.projectId);
    } catch (err) {
      console.error('Reject failed:', err);
      setChatMessages(prev => prev.filter(m => m.id !== rejectMsg.id));
    }
  }, [handleRefresh]);

  const handleQuoteReply = useCallback((msg: ChatMessage) => {
    setQuoteTarget(msg);
  }, []);

  const handleCancelQuote = useCallback(() => {
    setQuoteTarget(null);
  }, []);

  const handleChatProjectClick = useCallback((_projectName: string) => {
    // User clicked a project in sidebar — ChatInput handles @mention independently
  }, []);

  const handleThreadOpen = useCallback((taskId: string) => {
    setThreadTaskId(taskId);
  }, []);

  const handleThreadClose = useCallback(() => {
    setThreadTaskId(null);
  }, []);

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
      onClose={() => setDetailVisible(false)}
    />
  );

  const handleSelectTab = (tab: 'projects') => {
    setActiveTab(tab);
  };

  const threadTitle = threadTaskId
    ? (() => { const m = chatMessages.find(x => x.taskId === threadTaskId); return m ? `${m.projectName} · ${m.content.slice(0, 30)}` : ''; })()
    : '';

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
          ) : activeTab === 'chat' ? (
            <>
              <ChatPanel
                projects={projects}
                messages={chatMessages}
                quoteTarget={quoteTarget}
                onCancelQuote={handleCancelQuote}
                onSend={handleChatSend}
                onDecisionClick={handleChatDecision}
                onApprove={handleChatApprove}
                onReject={handleChatReject}
                onQuoteReply={handleQuoteReply}
                onThreadOpen={handleThreadOpen}
                onProjectClick={handleChatProjectClick}
              />
              {threadTaskId && <ThreadPanel taskId={threadTaskId} taskTitle={threadTitle} messages={chatMessages} onClose={handleThreadClose} />}
            </>
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

      {activeTab !== 'projects' && activeTab !== 'chat' && detailVisible && (
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

    </div>
  );
}
