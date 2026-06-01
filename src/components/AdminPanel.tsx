
import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { User, RechargeLog, GenerationLog } from '../types';

interface AdminPanelProps {
  adminUsers: User[];
  rechargeLogs: RechargeLog[];
  generationLogs: GenerationLog[];
  adminTab: 'users' | 'recharge' | 'stats';
  setAdminTab: (tab: 'users' | 'recharge' | 'stats') => void;
  adminLoading: boolean;
  updateCredits: (userId: string, credits: number) => void;
  updateRole: (userId: string, role: 'admin' | 'user') => void;
  handleResetPassword: (userId: string, username: string) => void;
  exportToExcel: (data: Record<string, string | number | boolean | null>[], fileName: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminUsers,
  rechargeLogs,
  generationLogs,
  adminTab,
  setAdminTab,
  adminLoading,
  updateCredits,
  updateRole,
  handleResetPassword,
  exportToExcel
}) => {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [userFilter, setUserFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);

  const allUsers = useMemo(() => Array.from(new Set(adminUsers.map(u => u.username))), [adminUsers]);
  
  const filteredLogs = useMemo(() => {
    const logs = adminTab === 'recharge' ? rechargeLogs : (adminTab === 'stats' ? generationLogs : []);
    return logs.filter(l => {
      const date = new Date(l.timestamp);
      const dateMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const matchMonth = (month === 'all' || dateMonth === month);
      const matchUser = (userFilter === 'all' || l.username === userFilter);
      return matchMonth && matchUser;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [adminTab, rechargeLogs, generationLogs, month, userFilter]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page, pageSize]);

  const trendData = useMemo(() => {
    const data: Record<string, number> = {};
    filteredLogs.forEach(l => {
      const date = new Date(l.timestamp).getDate();
      data[date] = (data[date] || 0) + (adminTab === 'recharge' ? (Math.abs((l as RechargeLog).amount)) : 1);
    });
    return Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b)).map(d => ({ day: d, value: data[d] }));
  }, [filteredLogs, adminTab]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  const resetPage = () => setPage(1);

  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Admin Dashboard</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">管理后台</h1>
          <p className="text-[#86868b] text-sm mt-2">监控系统运行状态与用户数据</p>
        </div>
        <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5">
          {[
            { id: 'users', label: '用户管理', icon: 'fa-users' },
            { id: 'recharge', label: '充值记录', icon: 'fa-history' },
            { id: 'stats', label: '生成统计', icon: 'fa-chart-bar' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id as 'users' | 'recharge' | 'stats')}
              className={`px-6 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${adminTab === tab.id ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
            >
              <i className={`fas ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {adminLoading ? (
        <div className="h-[400px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0071e3]"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {(adminTab === 'recharge' || adminTab === 'stats') && (
            <div className="grid grid-cols-1 gap-6 bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                            <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={10} color="#86868b"/>
                            <YAxis axisLine={false} tickLine={false} fontSize={10} color="#86868b"/>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}/>
                            <Line type="monotone" dataKey="value" stroke="#0071e3" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex gap-4">
                  <select value={month} onChange={(e) => { setMonth(e.target.value); resetPage(); }} className="p-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-1 focus:ring-blue-400">
                    <option value="all">全月</option>
                    <option value={new Date().toISOString().slice(0, 7)}>{new Date().toISOString().slice(0, 7)}</option>
                  </select>
                  <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); resetPage(); }} className="p-2 border rounded-lg text-sm bg-gray-50 outline-none focus:ring-1 focus:ring-blue-400">
                      <option value="all">所有用户</option>
                      {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
            </div>
          )}

          <div className="apple-card p-0 bg-white border-black/10 shadow-xl overflow-hidden">
            {adminTab === 'users' && (
              <div className="overflow-x-auto">
                {/* ... (Existing Users Table content) */}
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F7] border-b border-black/5">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">ID</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">用户名</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">角色</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">剩余点数</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b] text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {adminUsers.map(u => (
                      <tr key={u.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                        <td className="px-6 py-4 text-[11px] font-mono text-[#86868b]">{u.id}</td>
                        <td className="px-6 py-4 text-[13px] font-bold text-black">{u.username}</td>
                        <td className="px-6 py-4">
                          <select 
                            value={u.role} 
                            onChange={(e) => updateRole(u.id, e.target.value as 'admin' | 'user')}
                            className="bg-[#F5F5F7] border-none rounded-lg px-3 py-1 text-[11px] font-bold outline-none cursor-pointer"
                          >
                            <option value="user">普通用户</option>
                            <option value="admin">管理员</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-24 bg-[#F5F5F7] border-none rounded-lg px-3 py-1 text-[12px] font-bold outline-none"
                              value={u.credits}
                              onChange={(e) => updateCredits(u.id, parseFloat(e.target.value))}
                            />
                            <span className="text-[10px] font-bold text-[#86868b]">Credits</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleResetPassword(u.id, u.username)}
                            className="text-[11px] font-bold text-[#0071e3] hover:underline"
                          >
                            重置密码
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(adminTab === 'recharge' || adminTab === 'stats') && (
              <div className="overflow-x-auto">
                <div className="p-4 bg-[#F5F5F7] border-b border-black/5 flex justify-between items-center">
                  <div className='flex gap-2 items-center'>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); resetPage(); }} className="text-sm p-1 border rounded">
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <span className='text-sm text-gray-500'>每页</span>
                  </div>
                  <button 
                    onClick={() => exportToExcel(filteredLogs as unknown as Record<string, string | number | boolean | null>[], adminTab === 'recharge' ? '充值记录' : '生成统计')}
                    className="px-4 py-2 bg-white border border-black/10 rounded-lg text-[11px] font-bold hover:bg-black hover:text-white transition-all flex items-center gap-2"
                  >
                    <i className="fas fa-file-excel"></i> 导出 Excel
                  </button>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F7] border-b border-black/5">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">时间</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">用户</th>
                      {adminTab === 'recharge' ? (
                          <>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动金额</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动前</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动后</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">操作人</th>
                          </>
                      ) : (
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">操作内容</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {paginatedLogs.map(l => (
                      <tr key={l.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                        <td className="px-6 py-4 text-[11px] font-medium text-[#86868b]">{new Date(l.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 text-[13px] font-bold text-black">{l.username}</td>
                        {adminTab === 'recharge' ? (
                           <>
                              <td className={`px-6 py-4 text-[13px] font-black ${(l as RechargeLog).amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {(l as RechargeLog).amount >= 0 ? `+${(l as RechargeLog).amount}` : (l as RechargeLog).amount}
                              </td>
                              <td className="px-6 py-4 text-[12px] font-medium text-[#86868b]">{(l as RechargeLog).previousCredits}</td>
                              <td className="px-6 py-4 text-[12px] font-bold text-black">{(l as RechargeLog).newCredits}</td>
                              <td className="px-6 py-4 text-[11px] font-bold text-[#0071e3]">{(l as RechargeLog).adminName}</td>
                           </>
                        ) : (
                          <td className="px-6 py-4 text-[12px] font-medium text-black">执行生图任务</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className='p-4 border-t flex justify-end gap-2'>
                    <button 
                        disabled={page === 1} 
                        onClick={() => setPage(p => p - 1)}
                        className="px-4 py-2 bg-white border border-black/10 rounded-lg text-[11px] font-bold hover:bg-black hover:text-white transition-all disabled:opacity-50"
                    >
                        上一页
                    </button>
                    <span className='text-sm flex items-center px-2'>{page} / {totalPages || 1}</span>
                    <button 
                        disabled={page >= totalPages} 
                        onClick={() => setPage(p => p + 1)}
                        className="px-4 py-2 bg-white border border-black/10 rounded-lg text-[11px] font-bold hover:bg-black hover:text-white transition-all disabled:opacity-50"
                    >
                        下一页
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
