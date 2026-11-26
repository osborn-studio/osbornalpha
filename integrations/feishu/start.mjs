import { runFeishuConnector } from './feishu-connector.mjs';
import { createFormalFeishuWorkflow } from './feishu-formal.mjs';

runFeishuConnector(createFormalFeishuWorkflow).then(code => { process.exitCode = code; }).catch(() => {
  console.error('正式系统飞书连接器启动失败，请检查正式绑定、模型配置、本机目录和实例占用。');
  process.exitCode = 1;
});
