'use client';

import { AuthForm } from '@/components/AuthForm';
import { Disclaimer } from '@/components/Disclaimer';

export default function RegisterPage() {
  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">✨ 注册 Stock Monitor</h1>
        <p className="mb-4 text-sm text-text-dim">创建账号，数据按账户独立保存、多设备同步。</p>
        <AuthForm mode="register" />
      </div>
      <Disclaimer />
    </>
  );
}
