# Osborn Alpha 正式飞书连接器

`npm run feishu:formal` 用 Node 22 启动正式连接器。它监听飞书群、调用本机模型，并将 PM 确认后的建议或模拟成交交给正式站现有的 `/api/integrations/feishu/simulation` 接口。

在已绑定的群内，成员可以直接 @机器人聊天，并回复机器人给自己的消息继续对话。单独 @机器人也会收到问候。对话使用本机模型，只参考同一成员最近几轮。绑定分析师明确提交建议时才生成待确认摘要，授权 PM 直接回复该摘要「同意」后才写入正式系统。

PM 查询分析师名单后，可以接着问「第二位说准的比例是多少？」和「他的建议最后模拟成交了几笔？」。本机模型根据同一成员最近 30 分钟的会话选择名单、建议、评分与命中率、模拟成交或 PM 待办查询。连接器从群绑定和已送达的报表核对查询对象、账户和权限。指代不清时会追问。群 Webhook 发出的报表可以通过再次 @助手继续问。

正式连接器收到分析师发给助手、需要模型理解的消息，会先发送收件回执，随后发缺项追问或待确认摘要。PM 在当前摘要下回复「同意」后，确认与登记回执分别发送。收件、确认和正式同步有独立的处理队列。遇到同一摘要上先发的撤回或修改，连接器会先核对当时有效的版本。

在本机连接器的 `feishu-app.env` 设置 `FEISHU_LLM_KEEP_WARM=true`，可让运行中的服务为本机 Ollama 模型续期，减少空闲后的首问等待。连接器停止后，模型按有限租期释放内存。重复问题只可能复用查询类型和对象的判断，每次查业务结果都会重新校验权限并取数。

正式连接器支持用阿里云百炼作为本机模型的备用接口。以下配置放在同一份私有 `feishu-app.env` 中，`FEISHU_LLM_FALLBACK_API_KEY` 填与该地域匹配的百炼密钥。北京地域的一个配置如下。[百炼地域与接入地址](https://help.aliyun.com/zh/model-studio/base-url)

```dotenv
FEISHU_LLM_FALLBACK_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
FEISHU_LLM_FALLBACK_MODEL=qwen-plus
FEISHU_LLM_FALLBACK_API_KEY=
FEISHU_LLM_FALLBACK_AFTER_MS=3000
FEISHU_LLM_FALLBACK_TIMEOUT_MS=10000
```

重启本机连接器后生效。本地服务无法连接时立即切换。按以上配置，可转云端的单次模型调用在 3 秒内未收到完整本地结果时，会取消本地请求并转给百炼。迟到的结果会被丢弃。云端最多等待 10 秒，两次合计仍受 `FEISHU_LLM_TIMEOUT_MS` 限制。云端接收本轮问题或建议正文以及必要的结构化提示，可能产生百炼用量。聊天历史、报表正文和既有提案明细保存在本机。正式报表取数、身份核对、PM 确认和登记仍由连接器执行。GEPA 评测只使用本地模型。

审批人和提案作者可以直接回复已发出的摘要提问，例如「这个是每股成交价吗？」。机器人按该条摘要的标的、动作、模拟成交参数和记录状态回答。提问和继续追问不会触发登记。

私有运行目录默认为 `build/feishu`。启动命令从该目录的 `feishu-app.env` 加载飞书、模型和正式接入凭据。群、分析师、审批人和正式模拟账号放在 `feishu-bindings.json`。`FEISHU_DATA_DIR` 可指定绑定和 SQLite 所在目录。迁移时先停止原接收进程，再通过 SQLite 备份复制 `feishu-workflow.sqlite`，保留原提案及送达记录。每个飞书应用只运行一个接收进程。

分析师可直接说「模拟买入小米 200 股，成交价每股 38.50 港元」。只写拟买卖的总金额时，连接器会追问股数和每股模拟成交价。回复「仅登记建议」可跳过成交。PM 确认摘要后，已有正式接口会在一个事务里登记建议、采纳决定、成交和持仓，并返回正式回执。卖出时以正式模拟组合的可卖股数为准。

修改识别或群聊流程后重启本机连接器即可。正式接口的发布和数据库迁移按仓库的 [Vercel 部署说明](../../docs/VERCEL_DATAGATEWAY_DEPLOYMENT.md) 管理。

## 在群里查正式建议、评分和模拟成交

在绑定群里 @Osborn 分析助手，例如「查一下我的建议和评分」或「哪些建议已经产生了模拟成交」。绑定分析师可查自己的记录，PM 可以点名，也可以查本群已绑定的全体正式分析师。助手追问要查谁时，回复「全组」即可继续刚才的查询。连接器按每位分析师的绑定身份分别读取正式系统，再合成一条北京时间播报。每人每项最多列最近五条，明细过长时按人汇总。群成员都能看到播报。

连接器通过正式站的 `GET /api/integrations/feishu/overview` 读取建议、已落库评分，以及「成交 → 采纳决定 → 建议」关联的模拟成交。正式站会验证连接器凭据、绑定账户和分析师。命中率仅统计已有命中判定的有效建议，平均分只统计已有分数的有效建议。5、20、60 个交易日的收益率以正式记录为准，尚缺的周期显示为「—」。这条查询流程只读，不触发审批或成交录入。

正式站部署该接口后，在本机选择报告发送方式。对于已安装的 macOS 连接器，配置命令会读取现有绑定群，保存到私有运行目录并重新加载连接器。指定 `--directory` 可配置独立运行目录。

- **自定义群机器人播报。** 在同一群添加自定义机器人，执行 `python3 integrations/feishu/configure-report-delivery.py webhook`，在隐藏输入框填写该群 Webhook，可选填签名密钥。若群机器人要求关键词，可设为「正式」，报告和查询提示都包含该词。成员仍然 @ 应用机器人，报告由自定义机器人另发一条群消息。飞书将事件订阅和群自定义 Webhook 排除在自建应用月度调用额度之外。[飞书开放平台额度说明](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/platform-notices)
- **应用机器人原消息回复。** 执行 `python3 integrations/feishu/configure-report-delivery.py app`。助手沿用现有消息回复 OpenAPI，回复计入相应的飞书调用额度。
- **关闭群报告。** 执行 `python3 integrations/feishu/configure-report-delivery.py off`。

## 本机 OStag 群务

连接器的 `OSBORN_FEISHU_LOCAL_ASSISTANT=true` 启用本机群务。设置 `OSTAG_PROJECT_DIR` 为 OStag 仓库绝对路径、`OSTAG_PYTHON` 为本机 Python 3 解释器。连接器和本机 Demo 使用同一个 `REPLAY_DATA_DIR` 与 `REPLAY_PORT`。在 Demo 服务上设置 `REPLAY_FEISHU_CONNECTOR_DIR` 指向现役连接器的绑定与 SQLite 目录。新成员的绑定和登记保存在本机 Demo，已有正式成员按原绑定登记。OStag 通过本机标准输入读取单条指令，日常对话和建议继续使用连接器的模型。

| 场景 | 群内用法 |
|---|---|
| 申请分析师 | 在已配置群 @助手发送「我想成为分析师，署名陈晨」；Demo 暂时离线时会自动重试。 |
| 开通进度 | @助手发送「查我的开通进度」。 |
| 查询提案 | 在提案摘要下回复「查状态」，或 @助手发送「查提案」加完整提案编号。PM 可查当前群，分析师可查本人提案。正式状态取自本机已有回执。 |
| PM 待办 | @助手发送「待办」；新送达的摘要如 30 分钟仍待确认，最多提醒一次。 |
| 调整建议 | 提案作者在最新的待确认摘要下回复「数量从 100 股改成 200 股」或「目标价改成 480 港元」。PM 在新摘要下确认。 |
| Demo 复盘 | 新登记的飞书 Demo 建议在 T+5 或 T+10 评分更新后，助手在原摘要下播报。 |

## 群对话自动优化

在运行正式连接器的 Mac 上，连接器会观察已绑定群内发给助手的消息和回复。从启用时起，重复追问、成员纠正、疑似误登记和模型故障会生成本机诊断记录。同一成员在同一话题与助手连续交流三轮，也会触发一次本地语义复核。实际回复和流程状态与成员原意对不上、且有证据核对时，系统才生成训练样本。模型超时和代码校验问题单独计数。

连接器在内存里短暂关联同一话题最近三轮，标记的问题片段保存在私有 SQLite 中，最多保留 200 条、14 天。采集时屏蔽已绑定的姓名、飞书标识和常见敏感信息。额外的群昵称可在安装时重复指定 `--redact-name`。用于 GEPA 的是根据问题生成的合成样例，训练和验证都使用本机模型。监测不扫描群历史。

macOS LaunchAgent 每 5 分钟巡检一次。后台评测检测到前台请求时会让出模型。群成员明确纠正助手查错的内容，且系统能独立核实正确查询时，优化器可以根据查询类别生成合成练习。评测同时核对聊天回复、所选工具、报表栏目、查询对象和耗时。每轮实验预算为 72 次样例评估，时限 30 分钟。同一错因的两次实验默认间隔 6 小时。其他已核实的问题可以在下一次空闲巡检时开始。临时故障另行退避重试。休眠期间任务暂停，唤醒并登录同一 macOS 账号后继续处理可用记录。

每轮会预先生成带独立预期的新验收题，再将候选和现行版本各回放两遍。只有针对本次问题有改善、历史案例没有退化，且满足严重错误和延迟条件时，才会更新对应的提取或聊天提示词。提取改动还要核对正式业务函数产生的缺项、PM 摘要和模拟成交参数。更新在下一次模型请求生效。正式登记与模拟成交沿用现有的群成员绑定和 PM 审批流程。

安装需要正式连接器的 LaunchAgent 和下文的本机 GEPA 虚拟环境。以下命令从仓库根目录运行。

```sh
python3 integrations/feishu/optimization/install-auto-worker.py
node integrations/feishu/optimization/auto-worker.mjs --status
```

状态中的 `watching` 表示正在等待新的问题，`deferring_to_group` 表示群内模型请求优先。各轮结论记录在 `build/feishu-optimization/auto/runs/<轮次>/decision.json`。其中 `published` 表示已生效，`rejected` 或 `no_challenger` 表示这次保留现行版本。每轮的 `baseline.json` 保存改写前的提示词。

停用监测和自动发布可执行 `python3 integrations/feishu/optimization/install-auto-worker.py --disable`。如需回退某一已发布版本，先停用自动发布，再把对应轮次的 `baseline.json` 拷贝到当前生效文件同目录的临时文件，最后用 `mv` 原子替换 `integrations/feishu/active-prompt.json`。

## 本地提示词优化

群测发现误解时，保存脱敏后的原话、当时回复的是哪条草稿、草稿已有的字段，以及预期的回复或操作。先在配对报告里核对同一条的 `raw`（模型原答）和 `result`（连接器接受的字段），再看业务报告里的 `observed`（实际追问或待确认摘要）。模型误判意图、猜错字段或输出结构不对时，把错例和意思相反的说法交给 GEPA。原答正确时，沿着适配器和业务校验查找字段丢失的位置，保留原始模型输出作为代码回归输入。

同一段对话及其改写归入同一组。已揭晓的错例用于开发或回归，最终用新的对话比较现役版本与候选。每次同时记录字段质量、正式流程结果和耗时，单独核对闲聊误送 PM、错误成交参数及重复追问。

GEPA 用同一个本机模型回放合成群对话，根据训练错例提出新版中文提示词，在验证集上选候选。提取和群聊各有一段可编辑的补充说明。正式服务在每次提取和群聊模型请求前读取本机的 `active-prompt.json`。本次实验使用 Node 22 和 Python 3.12。固定版本的 GEPA 支持 Python 3.10 至 3.14。下面的命令从仓库根目录运行，模型名使用正式连接器当前配置。优化器及其依赖只在实验时加载。[GEPA 项目](https://github.com/gepa-ai/gepa)

```sh
python3 -m venv build/feishu-optimization/venv
build/feishu-optimization/venv/bin/python -m pip install -r integrations/feishu/optimization/requirements.txt
run_dir=$(mktemp -d build/feishu-optimization/run.XXXXXX)
FEISHU_LLM_TIMEOUT_MS=35000 build/feishu-optimization/venv/bin/python integrations/feishu/optimization/optimize.py \
  --model inkling-2-mini:26b-a5b-nvfp4 --budget 120 --minibatch 4 \
  --seed integrations/feishu/optimization/seed.json --output "$run_dir/candidate.json" --pool "$run_dir/pool.json"

node integrations/feishu/optimization/evaluate.mjs \
  --split validation --repeat 1 --candidate "$run_dir/candidate.json" --report "$run_dir/validation.json" --select "$run_dir/finalist.json"
node integrations/feishu/optimization/evaluate.mjs \
  --split holdout --repeat 2 --candidate "$run_dir/finalist.json" --report "$run_dir/holdout.json"
node --import tsx integrations/feishu/optimization/workflow-check.mjs "$run_dir/holdout.json" "$run_dir/workflow.json"
```

评测覆盖意图、原文证据、成交股数、每股价和摘要问答，同时记录超时及响应耗时。同一组对话始终处于同一数据分组，盲测保留给最终候选。模型回放使用回环地址，正式业务核验使用离线证券样例。

验证集同分的候选在相同的训练用例上再比较。`pool.json` 保留入围版本和选择依据。验证集分别决定进入盲测的提取、聊天两段文本。盲测对照报告要求两类的通过数和平均分各自至少持平，实际改动的部分须有提升。候选的严重错误为零，原始模型输出也须没有新增严重误判，调用失败次数和高分位延迟在验收范围内。核对正式业务报告没有新退化后，可以将通过的 `finalist.json` 原子替换到 `integrations/feishu/active-prompt.json`。下一次模型请求使用新的补充说明。原子恢复上一版 JSON 即可回退。后续需要依据已揭晓的盲测错例继续调优时，应另建一批独立验收用例。

提取和聊天可以各自发布。如果完整候选未通过，而其中一个组件独立改善，先冻结只替换该组件的 JSON，再用另一组独立对话确认。首次单独复核聊天的命令如下。此报告里的 `meetsComparisonLimits` 表示通过事先设定的比较条件，`eligible` 还要求在该组上取得严格提升。已参加过择优的案例可作为以后版本的回归集。

```sh
node integrations/feishu/optimization/evaluate.mjs --kind chat --dataset integrations/feishu/optimization/chat-acceptance.json \
  --candidate "$run_dir/chat-only.json" --split holdout --repeat 2 --report "$run_dir/chat-confirmation.json"
```

### 单独优化分析师建议提取

下面的流程以当前生效版本为基线，固定群聊提示词。GEPA 搜索会保留所有进入开发验证的候选及其父版本。即使包含种子的总冠军还是原版，`challenger.py` 也可以从有生成记录的改写中选出一个挑战者。如果搜索只产生种子，它会报告没有可验收的改写。遇到训练小批次反复平分时，`--explore-ties` 允许平分改写进入开发验证。

```sh
opt=integrations/feishu/optimization
py=build/feishu-optimization/venv/bin/python
run_dir=$(mktemp -d build/feishu-optimization/extraction.XXXXXX)
cp integrations/feishu/active-prompt.json "$run_dir/baseline.json"
FEISHU_LLM_TIMEOUT_MS=35000 "$py" "$opt/optimize.py" \
  --model inkling-2-mini:26b-a5b-nvfp4 --dataset "$opt/extraction-cases/development.json" \
  --seed "$run_dir/baseline.json" --minibatch 3 --budget 120 \
  --output "$run_dir/champion.json" --pool "$run_dir/pool.json"
"$py" "$opt/challenger.py" --component extraction --pool "$run_dir/pool.json" \
  --baseline "$run_dir/baseline.json" --output "$run_dir/trial.json" --provenance "$run_dir/origin.json"
node "$opt/evaluate.mjs" --kind extraction --repeat 2 --split holdout \
  --dataset "$opt/extraction-cases/acceptance.json" --baseline "$run_dir/baseline.json" \
  --candidate "$run_dir/trial.json" --report "$run_dir/holdout.json"
node --import tsx "$opt/workflow-check.mjs" "$run_dir/holdout.json" "$run_dir/business.json" \
  --dataset "$opt/extraction-cases/acceptance.json" --fixtures "$opt/extraction-cases/business-fixtures.json"
node "$opt/publish.mjs" --pool "$run_dir/pool.json" --candidate "$run_dir/trial.json" \
  --baseline "$run_dir/baseline.json" --report "$run_dir/holdout.json" --business "$run_dir/business.json"
```

最后一个命令核对来源、当前版本和评测结果，默认只输出发布决定。确认合格后加 `--apply` 写入本机正式配置，下一次模型请求生效。示例用例均为合成对话。本轮验收揭晓后可用于回归，后续若据此改写，应另行封存新的验收对话及其业务预期。
