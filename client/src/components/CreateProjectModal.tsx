import { useState } from 'react';
import { createProject, pickDirectory } from '../api';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const result = await pickDirectory();
      if (result.path) setWorkingDir(result.path);
    } catch (e) {
      alert('选择目录失败: ' + (e as Error).message);
    } finally {
      setBrowsing(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !workingDir.trim()) return;
    setSubmitting(true);
    try {
      await createProject({ name: name.trim(), working_dir: workingDir.trim() });
      onCreated();
    } catch (e) {
      alert('创建失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="+ 新建项目" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">项目名称</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
            placeholder="输入项目名称"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-warm-text-secondary mb-1">工作目录</label>
          <div className="flex gap-2">
            <input
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
              className="flex-1 p-2 border border-warm-border rounded-lg text-sm bg-warm-card text-warm-text"
              placeholder="选择或输入路径"
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-2 border border-warm-tan text-warm-brown rounded-lg text-xs font-semibold hover:bg-warm-card"
              disabled={browsing}
            >
              浏览...
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-warm-border text-warm-text-secondary rounded-lg text-xs font-semibold"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-warm-brown text-white rounded-lg text-xs font-bold"
            disabled={submitting || !name.trim() || !workingDir.trim()}
          >
            创建
          </button>
        </div>
      </div>
    </Modal>
  );
}
