
import React from 'react';
import { AuthState } from '../types';

interface AuthProps {
  authMode: 'login' | 'register';
  setAuthMode: (mode: 'login' | 'register') => void;
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  authError: string;
  setAuthError: (val: string) => void;
  handleLogin: (e: React.FormEvent) => void;
  handleRegister: (e: React.FormEvent) => void;
}

export const Auth: React.FC<AuthProps> = ({
  authMode,
  setAuthMode,
  username,
  setUsername,
  password,
  setPassword,
  authError,
  setAuthError,
  handleLogin,
  handleRegister
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] p-8">
      <div className="apple-card w-full max-w-md p-10 bg-white border-black/10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="text-2xl font-extrabold tracking-tighter text-black mb-2">BANFULY <span className="text-[#6e6e73] font-light">ARCHITECT</span></div>
          <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest">电商视觉架构师 · 登录中心</p>
        </div>
        
        <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-6">
          <div>
            <label className="section-label text-[10px] mb-2 block opacity-60">用户名 / Username</label>
            <input 
              type="text" 
              required
              className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="section-label text-[10px] mb-2 block opacity-60">密码 / Password</label>
            <input 
              type="password" 
              required
              className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>
          
          {authError && <p className="text-red-500 text-[11px] font-bold text-center">{authError}</p>}
          
          <button type="submit" className="btn-primary w-full py-4 bg-black text-white text-[14px] font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
            {authMode === 'login' ? '立即登录' : '注册新账号'}
          </button>
        </form>
        
        <div className="mt-8 pt-8 border-t border-black/5 text-center">
          <button 
            onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
            className="text-[12px] font-bold text-[#0071e3] hover:underline"
          >
            {authMode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}
          </button>
        </div>
      </div>
    </div>
  );
};
