import { runFeishuConnector } from '../../integrations/feishu/feishu-connector.mjs';
import { createLocalFeishuWorkflow } from './feishu-local.mjs';

runFeishuConnector(createLocalFeishuWorkflow).then(code => { process.exitCode = code; }).catch(() => {
  console.error('Demo 飞书连接器初始化失败，请检查本机目录、配置和实例占用。');
  process.exitCode = 1;
});
