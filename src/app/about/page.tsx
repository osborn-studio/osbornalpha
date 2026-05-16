import Link from 'next/link';
import { Disclaimer } from '@/components/Disclaimer';

export default function AboutPage() {
  return (
    <>
      <div className="card-base">
        <h1 className="mb-2 text-2xl font-bold">
          Stock<span className="text-accent">Monitor</span>
        </h1>
        <p className="mb-4 text-sm text-text-dim">个人股票池每日 AI 监控工具 · A 股 / 港股 / 美股</p>
        <p className="leading-relaxed">
          每天定时把你自己关注的股票交给 LLM，模拟多位投资大师的视角进行辩论，
          生成一份 5 分钟可读完的决策辅助简报，推送到 Telegram、邮箱和 Web。
        </p>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">✨ 核心特性</div>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed">
          <li>🌅 每日定时（08:30 CST 早盘前 + 22:00 CST 美盘前）</li>
          <li>🎯 智能信号：财报临近 / 异常成交量 / 评级变动 / 新闻情绪 / 13F 持仓变动</li>
          <li>🧠 多视角合成：9 位投资大师视角并发辩论</li>
          <li>📊 炒股软件级 Web UI：K 线 / 财报 / 新闻 / AI 观点 一站式</li>
          <li>📬 多渠道交付：Telegram + 邮件 + 静态 Web</li>
          <li>📈 打脸记录：30 天信号回测，公开命中率</li>
          <li>🛡️ 合规底线：永远 cite 来源，永远带免责声明</li>
        </ul>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">🧠 9 位 AI 投资委员</div>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {[
            ['巴菲特', '价值投资 / 护城河'],
            ['芒格', '多元思维 / 反向思考'],
            ['德鲁肯米勒', '宏观对冲 / 顺势'],
            ['霍华德·马克斯', '周期 / 钟摆思维'],
            ['彼得·林奇', '成长股 / Tenbagger'],
            ['迈克尔·伯里', '逆向 / 危机洞察'],
            ['张坤', '优质成长 / 消费医药'],
            ['李录', '价值投资 / 中国视角'],
            ['段永平', '平常心 / 本分哲学'],
          ].map(([n, d]) => (
            <div key={n} className="rounded-md bg-bg-card p-3">
              <strong>{n}</strong>
              <br />
              <span className="text-[11px] text-text-dim">{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">⚙️ 技术栈</div>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">Web 前端</td><td>Next.js 15 · React 18 · Tailwind · TradingView Lightweight Charts</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">后端 / DB</td><td>Supabase (Postgres + Auth + RLS)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">部署</td><td>Vercel (auto-deploy from GitHub)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">LLM</td><td>Claude (Opus / Sonnet / Haiku)</td></tr>
            <tr className="border-b border-border"><td className="py-2 text-text-dim">数据（计划）</td><td>Akshare · Alpha Vantage · EDGAR · FRED · Tushare</td></tr>
            <tr><td className="py-2 text-text-dim">调度</td><td>launchd (macOS) + Supabase Cron (future)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">📐 设计原则</div>
        <table className="w-full border-collapse text-sm">
          <thead className="text-text-dim">
            <tr><th className="py-2 text-left">是什么</th><th className="py-2 text-left">不是什么</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-border"><td className="py-2">✅ 决策辅助工具</td><td className="py-2">❌ 不连券商不执行交易</td></tr>
            <tr className="border-t border-border"><td className="py-2">✅ 信息整合 + 多视角</td><td className="py-2">❌ 不是涨跌预测算命器</td></tr>
            <tr className="border-t border-border"><td className="py-2">✅ 个人私用</td><td className="py-2">❌ 不向不特定公众分发</td></tr>
            <tr className="border-t border-border"><td className="py-2">✅ 完整 cite 来源</td><td className="py-2">❌ 不构成投资建议</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">🔗 链接</div>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><a href="https://github.com/gilosbornhello/stock-monitor" target="_blank">GitHub 仓库</a></li>
          <li><Link href="/legacy-demo">v0.1 静态版本（归档）</Link></li>
        </ul>
      </div>

      <Disclaimer />
    </>
  );
}
