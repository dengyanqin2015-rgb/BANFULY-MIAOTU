import React from 'react';
import { User, RechargeLog, GenerationLog, MODEL_COSTS } from '../types/index';
import * as XLSX from 'xlsx';

interface AdminPanelProps {
  adminTab: 'users' | 'recharge' | 'stats';
  setAdminTab: (tab: 'users' | 'recharge' | 'stats') => void;
  users: User[];
  rechargeLogs: RechargeLog[];
  genLogs: GenerationLog[];
  rechargeAmount: string;
  setRechargeAmount: (amount: string) => void;
  handleRecharge: (userId: string) => void;
  handleDeleteUser: (userId: string) => void;
  adminLoading: boolean;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminTab,
  setAdminTab,
  users,
  rechargeLogs,
  genLogs,
  rechargeAmount,
  setRechargeAmount,
  handleRecharge,
  handleDeleteUser,
  adminLoading
}) => {
  const exportToExcel = (data: Record<string, any>[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const totalCost = genLogs.reduce((acc, log) => acc + log.cost, 0);
  const totalRecharge = rechargeLogs.reduce((acc, log) => acc + log.amount, 0);

  return (
    <div className="animate-slide-up max-w-6xl mx-auto w-full">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Admin Panel</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">系统管理后台</h1>
        </div>
        <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5 shadow-inner">
          <button 
            onClick={() => setAdminTab('users')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'users' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            用户管理
          </button>
          <button 
            onClick={() => setAdminTab('recharge')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'recharge' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            充值流水
          </button>
          <button 
            onClick={() => setAdminTab('stats')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'stats' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            生图统计
          </button>
        </div>
      </div>

      <div className="apple-card bg-white border-black/10 overflow-hidden shadow-2xl">
        <div className="p-10">
          {adminTab === 'users' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">用户名</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">角色</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">剩余点数</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">充值操作</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="py-4 text-sm font-black text-black">{user.username}</td>
                      <td className="py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">
                        {user.role === 'admin' ? '管理员' : '普通用户'}
                      </td>
                      <td className="py-4 text-sm font-black text-[#0071e3]">{user.credits}</td>
                      <td className="py-4">
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="点数"
                            value={rechargeAmount}
                            onChange={(e) => setRechargeAmount(e.target.value)}
                            className="w-20 bg-[#F5F5F7] border-none rounded-lg px-3 py-2 text-xs font-bold"
                          />
                          <button 
                            onClick={() => handleRecharge(user.id)}
                            className="bg-black text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-all"
                          >
                            充值
                          </button>
                        </div>
                      </td>
                      <td className="py-4">
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {adminTab === 'recharge' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-black text-black">
                  总充值点数: <span className="text-[#0071e3]">{totalRecharge}</span>
                </div>
                <button 
                  onClick={() => exportToExcel(rechargeLogs, '充值记录')}
                  className="bg-[#F5F5F7] text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#E8E8ED] transition-all"
                >
                  导出 Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">时间</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">用户</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">金额</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">操作人</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {rechargeLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="py-4 text-sm font-medium text-black">{new Date(Number(log.timestamp)).toLocaleString()}</td>
                        <td className="py-4 text-sm font-bold text-black">{log.userName}</td>
                        <td className="py-4 text-sm font-black text-[#0071e3]">+{log.amount}</td>
                        <td className="py-4 text-sm text-[#86868b] font-bold">{log.adminName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'stats' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div className="text-sm font-black text-black">
                  总消耗点数: <span className="text-red-500">{totalCost}</span>
                </div>
                <button 
                  onClick={() => exportToExcel(genLogs, '生图记录')}
                  className="bg-[#F5F5F7] text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#E8E8ED] transition-all"
                >
                  导出 Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">时间</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">用户</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">消耗</th>
                      <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">模型</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {genLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="py-4 text-sm font-medium text-black">{new Date(Number(log.timestamp)).toLocaleString()}</td>
                        <td className="py-4 text-sm font-bold text-black">{log.userName}</td>
                        <td className="py-4 text-sm font-black text-red-500">-{log.cost}</td>
                        <td className="py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">{log.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {adminLoading && (
          <div className="p-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
          </div>
        )}
      </div>
    </div>
  );
};
