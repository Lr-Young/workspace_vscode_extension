# Workspace Benchmark VS Code 扩展

代码仓库理解类问题的问答基准测试集

## 功能特性

### 代码库基准测试
- 自动生成关于代码库的问题
- 标记代码上下文相关性
- 生成问题答案和评分
- 支持文件、文件夹和代码位置的快速导航
- 可视化数据展示

## 安装

1. 克隆此仓库
2. 在VS Code中打开文件夹
3. 运行 `npm install` 安装依赖
4. 按F5运行扩展开发宿主环境

## 使用方法

### 基准测试
1. 打开命令面板 (Ctrl+Shift+P)
2. 运行 "Workspace Benchmark" 命令
3. 在打开的面板中:
   - 点击"Construct Benchmark"构建基准测试
   - 设置问题数量并生成问题
   - 标记相关上下文
   - 生成答案和评分

## 项目结构

```
├── .gitignore
├── .vscode-test.mjs
├── .vscode/
├── .vscodeignore
├── CHANGELOG.md
├── README.md
├── esbuild.js
├── eslint.config.mjs
├── media/
│   └── icon.svg
├── package-lock.json
├── package.json
├── src/
│   ├── benchmark/
│   │   ├── benchmarkWebviewPanel.ts
│   │   ├── languageAnalyser/
│   │   ├── llm.ts
│   │   ├── main.ts
│   │   ├── prompt.ts
│   │   └── typeDefinitions.ts
│   ├── extension.ts
│   ├── gui/
│   │   ├── benchmark.ts
│   │   ├── components.ts
│   │   └── demos/
│   ├── logger.ts
│   ├── test/
│   ├── utils.ts
│   └── webview/
│       ├── codicon.css
│       ├── codicon.ttf
│       ├── main.ts
│       └── style.css
├── tsconfig.json
└── vsc-extension-quickstart.md
```

## 关键文件说明

- `src/extension.ts`: 扩展的入口文件，注册命令和视图
- `src/benchmark/benchmarkWebviewPanel.ts`: 基准测试Webview面板实现
- `src/benchmark/main.ts`: 基准测试核心逻辑
- `src/webview/main.ts`: Webview交互逻辑
- `src/webview/style.css`: Webview样式

## 配置

扩展需要设置以下环境变量:
- `DEEPSEEK_API_KEY`: DeepSeek API密钥，用于LLM模型访问

## 依赖

主要依赖包括:
- `@vscode/webview-ui-toolkit`: VS Code Webview UI工具包
- `@langchain/community`: LangChain社区版
- `@langchain/deepseek`: DeepSeek LLM集成
- `tree-sitter`: 代码解析

## 已知问题

- 基准测试功能在大型代码库上可能运行缓慢
- 需要配置API密钥
- 目前只支持解析Python代码仓库

## 版本历史

### 0.0.1
- 初始版本
- 实现测试集生成功能

## 贡献

欢迎提交问题和拉取请求！

## 许可证

[MIT](LICENSE)
