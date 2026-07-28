import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface RequestLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  user?: { id?: string; username?: string; role?: string };
  ip?: string;
  requestHeaders?: Record<string, unknown>;
  requestBody?: unknown;
  responseBody?: unknown;
}

const pretty = (value: unknown) => JSON.stringify(value ?? null, null, 2);

export const RequestLogPanel: React.FC = () => {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [selected, setSelected] = useState<RequestLogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [path, setPath] = useState('');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '800' });
      if (status) params.set('status', status);
      if (path.trim()) params.set('path', path.trim());
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/request-logs?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '读取请求日志失败');
      const nextLogs: RequestLogEntry[] = Array.isArray(payload.logs) ? payload.logs : [];
      setLogs(nextLogs);
      setError('');
      setSelected(current => current ? nextLogs.find(item => item.id === current.id) || current : null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path, search, status]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { void fetchLogs(); }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  const summary = useMemo(() => ({
    total: logs.length,
    errors: logs.filter(log => log.statusCode >= 400).length,
    slow: logs.filter(log => log.durationMs >= 10000).length
  }), [logs]);

  return (
    <div className="p-6 space-y-5 bg-[#F5F5F7]/40 min-h-[620px]">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['当前记录', summary.total, 'text-black'],
          ['失败请求', summary.errors, 'text-red-500'],
          ['超过10秒', summary.slow, 'text-amber-500']
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-white rounded-2xl border border-black/5 p-4">
            <div className="text-[10px] font-black text-[#86868b] uppercase">{label}</div>
            <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-2xl border border-black/5">
        <select value={status} onChange={event => setStatus(event.target.value)} className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs font-bold outline-none">
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="error">失败</option>
        </select>
        <input value={path} onChange={event => setPath(event.target.value)} placeholder="筛选接口，例如 openai/images" className="min-w-56 flex-1 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs outline-none" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索请求编号、错误或用户" className="min-w-56 flex-1 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs outline-none" />
        <label className="flex items-center gap-2 text-xs font-bold text-[#86868b]">
          <input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />
          5秒刷新
        </label>
        <button onClick={() => void fetchLogs()} className="bg-black text-white rounded-lg px-4 py-2 text-xs font-black">
          {loading ? '刷新中' : '立即刷新'}
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-600 rounded-xl p-3 text-xs font-bold">日志读取失败：{error}</div>}
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)] gap-4 items-start">
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#F5F5F7] z-10">
                <tr className="text-[10px] text-[#86868b]">
                  <th className="px-4 py-3">时间</th><th className="px-4 py-3">接口</th><th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">耗时</th><th className="px-4 py-3">用户</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {logs.map(log => (
                  <tr key={log.id} onClick={() => setSelected(log)} className={`cursor-pointer text-xs hover:bg-blue-50/50 ${selected?.id === log.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-[#86868b]">{new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <div className="font-black">{log.method}</div><div className="font-mono text-[10px] break-all text-[#86868b]">{log.path}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full font-black ${log.statusCode >= 400 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{log.statusCode}</span></td>
                    <td className={`px-4 py-3 font-bold ${log.durationMs >= 10000 ? 'text-amber-600' : ''}`}>{log.durationMs} ms</td>
                    <td className="px-4 py-3">{log.user?.username || '未识别'}</td>
                  </tr>
                ))}
                {!logs.length && !loading && <tr><td colSpan={5} className="p-12 text-center text-sm text-[#86868b]">暂无匹配日志</td></tr>}
                {!logs.length && loading && <tr><td colSpan={5} className="p-12 text-center text-sm text-[#86868b]">正在读取日志…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#111] text-white rounded-2xl overflow-hidden sticky top-4">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div><div className="text-xs font-black">真实请求详情</div><div className="font-mono text-[9px] text-white/40 mt-1">{selected?.id || '点击左侧记录'}</div></div>
            {selected && <span className={`text-xs font-black ${selected.statusCode >= 400 ? 'text-red-400' : 'text-green-400'}`}>{selected.statusCode}</span>}
          </div>
          <div className="max-h-[560px] overflow-auto p-4 space-y-4 text-[11px]">
            {selected ? (
              <>
                <section><div className="text-blue-400 font-black mb-2">基本信息</div><pre className="whitespace-pre-wrap break-all text-white/75">{pretty({
                  time: selected.timestamp, method: selected.method, path: selected.path, status: selected.statusCode,
                  durationMs: selected.durationMs, user: selected.user, ip: selected.ip
                })}</pre></section>
                <section><div className="text-blue-400 font-black mb-2">请求数据（已脱敏）</div><pre className="whitespace-pre-wrap break-all text-white/75">{pretty(selected.requestBody)}</pre></section>
                <section><div className="text-blue-400 font-black mb-2">返回数据（已脱敏）</div><pre className="whitespace-pre-wrap break-all text-white/75">{pretty(selected.responseBody)}</pre></section>
                <section><div className="text-blue-400 font-black mb-2">请求头（已脱敏）</div><pre className="whitespace-pre-wrap break-all text-white/75">{pretty(selected.requestHeaders)}</pre></section>
              </>
            ) : <div className="text-white/40 py-20 text-center">选择一条记录查看请求与回传数据</div>}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[#86868b]">安全说明：API Key、密码、Token、Cookie 与图片 Base64 会自动脱敏；错误码、审核阶段、请求编号和文本回传会保留。</p>
    </div>
  );
};
