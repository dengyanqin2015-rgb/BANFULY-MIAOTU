import React from 'react';
import { AuthState, RechargeLog, GenerationLog } from '../types/index';

interface UserProfileProps {
  auth: AuthState;
  profileTab: 'password' | 'recharge' | 'stats';
  setProfileTab: (tab: 'password' | 'recharge' | 'stats') => void;
  userRechargeLogs: RechargeLog[];
  userGenLogs: GenerationLog[];
  newPassword: string;
  setNewPassword: (pw: string) => void;
  handleUpdatePassword: () => void;
  profileLoading: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  auth,
  profileTab,
  setProfileTab,
  userRechargeLogs,
  userGenLogs,
  newPassword,
  setNewPassword,
  handleUpdatePassword,
  profileLoading
}) => {
  if (!auth.user) return null;

  return (
    <div className="animate-slide-up max-w-4xl mx-auto w-full">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">User Profile</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">个人信息管理</h1>
        </div>
        <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5 shadow-inner">
          <button 
            onClick={() => setProfileTab('password')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'password' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            修改密码
          </button>
          <button 
            onClick={() => setProfileTab('recharge')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'recharge' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            充值记录
          </button>
          <button 
            onClick={() => setProfileTab('stats')}
            className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'stats' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
          >
            生图记录
          </button>
        </div>
      </div>

      <div className="apple-card bg-white border-black/10 overflow-hidden shadow-2xl">
        <div className="p-10 border-b border-black/5 flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3] text-3xl font-black">
            {auth.user.username[0].toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-black text-black">{auth.user.username}</h2>
            <p className="text-[#86868b] font-bold text-sm uppercase tracking-widest mt-1">
              {auth.user.role === 'admin' ? '系统管理员' : '普通用户'} · 剩余点数: {auth.user.credits}
            </p>
          </div>
        </div>

        <div className="p-10">
          {profileTab === 'password' && (
            <div className="max-w-md">
              <label className="section-label mb-4 block text-black/40">设置新密码</label>
              <div className="flex gap-4">
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                  className="flex-1 bg-[#F5F5F7] border-none rounded-xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                />
                <button 
                  onClick={handleUpdatePassword}
                  className="btn-primary bg-black text-white px-8 py-4 text-[13px]"
                >
                  确认修改
                </button>
              </div>
            </div>
          )}

          {profileTab === 'recharge' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">充值时间</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">充值点数</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">操作人</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {userRechargeLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-sm text-[#86868b] italic">暂无充值记录</td>
                    </tr>
                  ) : (
                    userRechargeLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="py-4 text-sm font-medium text-black">{new Date(Number(log.timestamp)).toLocaleString()}</td>
                        <td className="py-4 text-sm font-black text-[#0071e3]">+{log.amount}</td>
                        <td className="py-4 text-sm text-[#86868b] font-bold">{log.adminName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {profileTab === 'stats' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">生成时间</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">消耗点数</th>
                    <th className="pb-4 text-[10px] font-black text-[#86868b] uppercase tracking-widest">模型</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {userGenLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-sm text-[#86868b] italic">暂无生图记录</td>
                    </tr>
                  ) : (
                    userGenLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="py-4 text-sm font-medium text-black">{new Date(Number(log.timestamp)).toLocaleString()}</td>
                        <td className="py-4 text-sm font-black text-red-500">-{log.cost}</td>
                        <td className="py-4 text-[10px] font-black uppercase tracking-widest text-[#86868b]">{log.model}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {profileLoading && (
          <div className="p-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
          </div>
        )}
      </div>
    </div>
  );
};
