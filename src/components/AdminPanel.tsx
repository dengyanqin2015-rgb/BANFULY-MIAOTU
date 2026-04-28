
import React from 'react';
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
        <div className="apple-card p-0 bg-white border-black/10 shadow-xl overflow-hidden">
          {adminTab === 'users' && (
            <div className="overflow-x-auto">
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

          {adminTab === 'recharge' && (
            <div className="overflow-x-auto">
              <div className="p-4 bg-[#F5F5F7] border-b border-black/5 flex justify-end">
                <button 
                  onClick={() => exportToExcel(rechargeLogs, '充值记录')}
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
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动金额</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动前</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">变动后</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">操作人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {rechargeLogs.map(l => (
                    <tr key={l.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                      <td className="px-6 py-4 text-[11px] font-medium text-[#86868b]">{new Date(l.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 text-[13px] font-bold text-black">{l.username}</td>
                      <td className={`px-6 py-4 text-[13px] font-black ${l.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {l.amount >= 0 ? `+${l.amount}` : l.amount}
                      </td>
                      <td className="px-6 py-4 text-[12px] font-medium text-[#86868b]">{l.previousCredits}</td>
                      <td className="px-6 py-4 text-[12px] font-bold text-black">{l.newCredits}</td>
                      <td className="px-6 py-4 text-[11px] font-bold text-[#0071e3]">{l.adminName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adminTab === 'stats' && (
            <div className="overflow-x-auto">
              <div className="p-4 bg-[#F5F5F7] border-b border-black/5 flex justify-end">
                <button 
                  onClick={() => exportToExcel(generationLogs, '生成统计')}
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
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">操作内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {generationLogs.map(l => (
                    <tr key={l.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                      <td className="px-6 py-4 text-[11px] font-medium text-[#86868b]">{new Date(l.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 text-[13px] font-bold text-black">{l.username}</td>
                      <td className="px-6 py-4 text-[12px] font-medium text-black">执行生图任务</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
