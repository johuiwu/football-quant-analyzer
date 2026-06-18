# AGENTS.md — 登录模块保护

## stableLogin.js — 只读模块

- 文件：backend/services/stableLogin.js
- 此文件包含核心登录流程，严禁任何 AI 或自动化工具修改此文件中的任何代码。
- 如需调整登录行为（如超时时间、重试次数、验证逻辑），请通过调用方参数控制，不要改动此文件内部逻辑。
- 唯一公开接口：performStableLogin(username, password)
- 返回格式：{ success: boolean, page: Page|null, error?: string }
- 此接口签名和行为已被锁定，不得修改。

## 修改日志

- 2026-06-08：初始创建，从 cornerCrawler.js 分离 ensureLogin 逻辑