# F3 implementation log
- Task 1：迁移一（九表、视图、桶、函数、触发器、权限）+ 集成测试 13 个 + database.types F3 块 + UTF8 harness；Opus 规格✅/质量（7 项已修）；Codex review 2×P2 + challenge 3×P2/2×P3 已修，recheck 后续 2 项已修（ba92c1e、907bd56）；锁推迟到 Task 19（偏差：降低后续迁移一修改的成本）（2026-11-06）
- Task 2：types.ts 共享契约、supabaseDocumentsDb、memoryDocumentsDb（对齐迁移一复审修复）与共享契约用例；Codex 审计：待审
- Task 2 修复：Codex review/challenge 四项 P2（原子写入、资产上限 100、内存 reconcile 先验后改、时间戳归一）及十项协调修复；Codex 审计：待审
- Task 3：pgDocumentsDb（pg 实现，写入单次调用 + checkWriteRows，资产上限同步）、整套共享契约在真实 PostgreSQL 上通过、超过 1,000 行的游标分页集成测试 2 个；契约无 SQL/内存分歧；Codex 审计：待审
- Task 2 recheck：N1 内存时间戳保留微秒（db.ts canonTs/tsSortKey，pg/supabase 行规范化同步）、N2 阈值先规范化指数十进制；新增共享契约用例；Codex 审计：待审
- Task 4：ObjectStore（Supabase + 内存，内容寻址路径）、十进制字符串算术 decimal.ts、pdfjs-dist 4.10.38 精确依赖、本机 PDF 冒烟脚本（两页 PDF 本机实测 pages=2）；Codex 审计：待审
