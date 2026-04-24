# GenericAgent-WebUI

GenericAgent 的 Web UI 前端，基于 React + Vite + Bottle，风格对齐 NarraFork。

## 项目结构

```
├── launch_webui.py              # 一键启动入口
└── webui/
    ├── backend/
    │   └── server.py            # Bottle 后端 API
    └── frontend/
        ├── package.json
        ├── index.html
        ├── vite.config.ts
        ├── tsconfig.json
        └── src/
            ├── main.tsx         # React 入口
            ├── api.ts           # API 封装
            ├── App.tsx          # 主组件
            └── styles/
                └── app.css      # 样式
```

## 前置条件

- Python 3.8+
- Node.js 16+
- `pip install bottle`
- 目标 GA 项目需要有 `agentmain.py` 和 `frontends/continue_cmd.py`

## 使用方法

1. 将本仓库内容复制到你的 GenericAgent 项目根目录

2. 安装前端依赖并构建（仅首次）：

```bash
cd webui/frontend
npm install
npm run build
cd ../..
```

3. 启动：

```bash
python launch_webui.py
```

浏览器会自动打开 `http://127.0.0.1:18765`。

## 功能

- 仪表盘：运行状态、历史会话、当前模型
- 会话：实时流式对话、新建/中断/继续会话
- 设置（外观与界面）：
  - 主题切换（浅色/深色/跟随系统）
  - OLED 纯黑模式
  - 全屏模式
  - 屏幕常亮（Wake Lock API）
  - 自动换行（Markdown/代码/Diff）
  - 发送方式（Enter / Ctrl+Enter）
