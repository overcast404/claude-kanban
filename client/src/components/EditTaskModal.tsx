import { useState } from 'react';
import type { Task } from '../../../src/types';
import { updateTask } from '../api';
import { Modal } from './Modal';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditTaskModal({ task, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await updateTask(task.id, { title: title.trim(), description: description.trim() });
      onUpdated();
    } catch (e) {
      alert('保存失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="编辑任务" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">标题</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text resize-y"
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !title.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
