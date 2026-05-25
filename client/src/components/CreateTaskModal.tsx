import { useState } from 'react';
import { createTask, startTask } from '../api';
import { Modal } from './Modal';

interface Props {
  projects: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTaskModal({ projects, onClose, onCreated }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [description, setDescription] = useState('');
  const [useWorktree, setUseWorktree] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (start: boolean) => {
    if (!description.trim() || !projectId) return;
    setSubmitting(true);
    try {
      const task = await createTask(projectId, {
        title: description.trim().slice(0, 80),
        description: description.trim(),
        use_worktree: useWorktree,
      });
      if (start) await startTask(task.id);
      onCreated();
    } catch (e) {
      alert('创建失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="+ 新建任务" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">成员</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            placeholder="任务描述"
            rows={3}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">运行环境</label>
          <div className="flex rounded-md border border-warm-border overflow-hidden text-[12px] w-fit">
            <button
              onClick={() => setUseWorktree(false)}
              className={`px-3 py-1 transition-colors ${!useWorktree ? 'bg-warm-brown text-white' : 'bg-white text-warm-text-secondary hover:bg-gray-50'}`}
            >
              本地
            </button>
            <button
              onClick={() => setUseWorktree(true)}
              className={`px-3 py-1 transition-colors ${useWorktree ? 'bg-warm-brown text-white' : 'bg-white text-warm-text-secondary hover:bg-gray-50'}`}
            >
              新worktree
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
            disabled={submitting}
          >
            取消
          </button>
          <button
            onClick={() => handleCreate(false)}
            className="px-4 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold"
            disabled={submitting || !description.trim()}
          >
            创建为待启动
          </button>
          <button
            onClick={() => handleCreate(true)}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !description.trim()}
          >
            创建并启动
          </button>
        </div>
      </div>
    </Modal>
  );
}
