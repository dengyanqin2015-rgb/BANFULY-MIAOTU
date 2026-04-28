
import React from 'react';
import { AuthState, RechargeLog, GenerationLog } from '../types';

interface ProfilePanelProps {
  auth: AuthState;
  userRechargeLogs: RechargeLog[];
  userGenLogs: GenerationLog[];
  profileLoading: boolean;
  newPassword: string;
  setNewPassword: (val: string) => void;
  handleChangePassword: (e: React.FormEvent) => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  auth,
  userRechargeLogs,
  userGenLogs,
  profileLoading,
  newPassword,
  setNewPassword,
  handleChangePassword
}) => {
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const user = auth.user;

  if (!user) return null;

  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">User Profile</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">个人中心</h1>
          <p className="text-[#86868b] text-sm mt-2">管理您的账户信息与使用记录</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User Info Card */}
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-[#F5F5F7] flex items-center justify-center text-black mb-6 border border-black/5 shadow-inner">
            <i className="fas fa-user text-4xl opacity-20"></i>
          </div>
          <h2 className="text-2xl font-black text-black mb-1">{user.username}</h2>
          <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest mb-6">
            {user.role === 'admin' ? '系统管理员' : '普通用户'}
          </p>
          
          <div className="w-full bg-[#F5F5F7] p-6 rounded-2xl border border-black/5 mb-8">
            <p className="text-[10px] font-black text-[#86868b] uppercase tracking-widest mb-2">当前剩余点数</p>
            <p className="text-4xl font-black text-[#0071e3]">{user.credits}</p>
          </div>

          <button 
            onClick={() => setIsChangingPassword(!isChangingPassword)}
            className="w-full py-3 rounded-xl border border-black/10 text-[12px] font-bold hover:bg-black hover:text-white transition-all mb-4"
          >
            修改登录密码
          </button>
          
          {isChangingPassword && (
            <form onSubmit={handleChangePassword} className="w-full space-y-4 animate-slide-up">
              <input 
                type="password" 
                required
                className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-3 text-[13px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="输入新密码"
              />
              <button type="submit" className="w-full py-3 bg-[#0071e3] text-white rounded-xl text-[12px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all">
                确认修改
              </button>
            </form>
          )}
        </div>

        {/* Logs Card */}
        <div className="lg:col-span-2 apple-card p-0 bg-white border-black/10 shadow-xl overflow-hidden flex flex-col">
          <div className="flex border-b border-black/5">
            <div className="px-8 py-4 text-[12px] font-black text-black border-b-2 border-black">使用记录</div>
          </div>
          
          <div className="flex-1 overflow-y-auto max-h-[600px]">
            {profileLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {userRechargeLogs.map(log => (
                  <div key={log.id} className="px-8 py-4 flex items-center justify-between hover:bg-[#F5F5F7]/50 transition-colors">
                    <div>
                      <p className="text-[13px] font-bold text-black">账户点数充值</p>
                      <p className="text-[11px] font-medium text-[#86868b] mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-black text-green-500">+{log.amount}</p>
                      <p className="text-[10px] font-bold text-[#86868b] mt-1">余额: {log.newCredits}</p>
                    </div>
                  </div>
                ))}
                {userGenLogs.map(log => (
                  <div key={log.id} className="px-8 py-4 flex items-center justify-between hover:bg-[#F5F5F7]/50 transition-colors">
                    <div>
                      <p className="text-[13px] font-bold text-black">执行生图任务</p>
                      <p className="text-[11px] font-medium text-[#86868b] mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-black text-red-500">-1</p>
                      <p className="text-[10px] font-bold text-[#86868b] mt-1">消耗点数</p>
                    </div>
                  </div>
                ))}
                {userRechargeLogs.length === 0 && userGenLogs.length === 0 && (
                  <div className="h-[300px] flex flex-col items-center justify-center text-[#86868b] opacity-40 italic">
                    <i className="fas fa-history text-4xl mb-4"></i>
                    <p>暂无使用记录</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
