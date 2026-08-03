import React, { useEffect, useState } from 'react';
import { CopyPlus, Save, Trash2 } from 'lucide-react';
import type { ImageAnalysisTemplate } from '../lib/gemini';

export const ImageAnalysisTemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<ImageAnalysisTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch('/api/image-analysis-templates', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '读取模板失败');
        setTemplates(result);
      })
      .catch(error => setMessage(error.message));
  }, []);

  const update = (id: string, changes: Partial<ImageAnalysisTemplate>) =>
    setTemplates(items => items.map(item => item.id === id ? { ...item, ...changes } : item));

  const addTemplate = () => setTemplates(items => [...items, {
    id: `template-${Date.now()}`,
    name: '新解析模板',
    description: '',
    prompt: '请将图片准确转换为一段可直接用于文生图复刻的中文提示词，只输出最终提示词。',
    isDefault: items.length === 0
  }]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/image-analysis-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ templates })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '保存失败');
      setTemplates(result);
      setMessage('模板已保存并立即生效');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-black">图片反推关键词模板</h2>
          <p className="mt-1 text-xs text-[#86868b]">默认模板同时用于卡片“一键解析”和 AI 助理的视觉分析，保存后下一次分析立即生效。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={addTemplate} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold"><CopyPlus size={15} />新增模板</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"><Save size={15} />{saving ? '保存中…' : '保存全部'}</button>
        </div>
      </div>
      {message && <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">{message}</div>}
      <div className="grid gap-4">
        {templates.map(template => (
          <div key={template.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <input value={template.name} onChange={e => update(template.id, { name: e.target.value })} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold" />
              <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                <input type="radio" checked={template.isDefault} onChange={() => setTemplates(items => items.map(item => ({ ...item, isDefault: item.id === template.id })))} />设为默认
              </label>
              <button disabled={templates.length === 1} onClick={() => setTemplates(items => items.filter(item => item.id !== template.id))} className="p-2 text-red-500 disabled:opacity-30"><Trash2 size={16} /></button>
            </div>
            <input value={template.description || ''} onChange={e => update(template.id, { description: e.target.value })} placeholder="模板用途说明" className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" />
            <textarea value={template.prompt} onChange={e => update(template.id, { prompt: e.target.value })} rows={5} className="mt-3 w-full resize-y rounded-xl border border-gray-200 px-3 py-3 text-xs leading-relaxed" />
          </div>
        ))}
      </div>
    </div>
  );
};
