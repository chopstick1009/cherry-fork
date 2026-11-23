# Workspace Notes

**强制要求：每次开始本仓库的新任务，必须先完整读取本文件，再调查或修改代码。每一次踩坑都必须记录在本文件中，不以是否新颖、是否已知、是否最终解决为条件。** 踩坑包括非预期的命令/构建/测试/运行失败、返工、以及需要临时绕行才能继续的情况。发现时就补记；若同一问题再次发生，在原条目下追加本次日期、现象和处理结果，不得因为已有说明而省略。只记录已核实事实，不把猜测写成根因。发现可复用的架构模式也记在本文件，但详细规范优先链接正式架构文档，避免复制第二套规范。

## 已知问题与处理办法

### 2026-11-23：当前 PowerShell 环境找不到 `gpg` 和 `gh`

- **现象**：提交/推送前检查工具时，PowerShell 提示 `gpg` 和 GitHub CLI `gh` 不是可识别的命令。
- **已确认影响**：不能直接使用 GPG 完成仓库要求的签名提交；也不能通过 `gh auth status` 检查 GitHub CLI 登录状态。
- **后续处理**：先检查已有 SSH 密钥和 Git 的 SSH 远端认证/签名能力。验证替代方案前，不要把“无签名提交”当作正常绕行，也不要声称 `gh` 登录状态已验证。

### 2026-11-23：Windows SSH 私钥 ACL 过宽导致 GitHub 拒绝密钥

- **现象**：`ssh -T git@github.com` 报 `UNPROTECTED PRIVATE KEY FILE`，指出 `C:/Users/26935/.ssh/id_orangePur` 的权限对 `Everyone` 过宽，随后 GitHub 返回 `Permission denied (publickey)`。
- **已确认影响**：当前 SSH 远端认证尚未通过；不能假设 Git push 已认证。`git verify-commit` 也因缺少 `gpg.ssh.allowedSignersFile` 配置无法验证已有 SSH 签名。
- **已验证处理**：对密钥运行 `icacls <private-key> /inheritance:r`，保留 `SYSTEM`、`Administrators` 和当前用户权限；确认 ACL 不再含 `Everyone` 后，`ssh -T git@github.com` 成功认证为 `chopstick1009`。不得把私钥内容输出到终端或提交。
- **本次复发记录**：仅用 `icacls /remove Everyone` 移除了显式 ACE，但 `Everyone` ACE 由父目录继承，SSH 仍拒绝密钥。先移除 ACL 继承再核验最终 ACL 才解决。

### Windows 便携包构建遇到 NSIS `elevate.exe` 跨盘复制失败

- **现象**：`pnpm build:win:dev` 完成应用编译和 `win-unpacked` 后，在 electron-builder 生成 `portable` 产物时报错：`UNKNOWN: unknown error, copyfile ...\nsis-3.0.4.1...\elevate.exe -> ...\resources\elevate.exe`。
- **根因**：本机 `C:\Users\...\AppData\Local\electron-builder\Cache` 的 NSIS `elevate.exe` 被 Windows EFS 加密。electron-builder 从 C 盘缓存跨盘复制到 D 盘打包目录时失败。D 盘目标目录权限和空间正常；不是源码编译错误。
- **已验证处理**：将 electron-builder 缓存指定到 D 盘未加密目录后重新运行打包，NSIS 工具在该目录重新下载，便携包构建成功：

  ```powershell
  $env:ELECTRON_BUILDER_CACHE = 'D:/cherry-fork/.context/cherry-electron-dev/electron-builder-cache-plain'
  $env:CHERRY_DEV_PORTABLE_OUTPUT_DIR = 'D:/cherry-fork/.context/cherry-electron-dev/package-build-<标签>'
  pnpm build:win:dev
  ```

- 不要尝试直接复制/解密被 EFS 保护的全局缓存文件；已验证 `Copy-Item` 和 `cipher /d` 都失败。将构建缓存切到 D 盘是已验证方案。

### 开发版便携包、唯一数据区和桌面快捷方式

- `pnpm build:win:dev` 使用 [electron-builder.dev.config.cjs](../electron-builder.dev.config.cjs) 生成 Windows x64 `portable` EXE；`CHERRY_DEV_PORTABLE_OUTPUT_DIR` 可指定包输出目录。
- [register-dev-portable-profile.cjs](../scripts/packaging/register-dev-portable-profile.cjs) 要求现有数据库存在，并在用户级 BootConfig 中将**该 EXE 的完整路径**映射到 `D:\cherry-fork\.context\cherry-electron-dev\package\data`。映射按 EXE 路径记录；更换输出 EXE 路径后必须运行该注册脚本（打包脚本会自动运行）。
- 打包前确认共享数据区存在，打包后检查 `~/.cherrystudio/boot-config.json` 中当前 EXE 的 `app.user_data_path` 映射。不要清理、重建或迁移这份数据目录来处理普通打包问题。
- 桌面开发版快捷方式应直接指向新便携 EXE，图标使用 `D:\FireFox\cherry-studio.ico`。开发版与原版快捷方式必须保持区分；不要改动 `Cherry Studio.lnk` 的原版目标。
- 新旧开发包共用同一数据区。更新快捷方式后，先退出旧开发包，再启动新包，避免旧单实例接管启动请求或两个进程并行访问同一数据库。

## 常用架构入口

这里记录导航和易混淆边界；详细规则以链接的正式文档为准。

- **跨进程结构与数据流**：[`docs/dev/references/architecture/README.md`](../docs/dev/references/architecture/README.md)。主进程、preload、renderer 的职责和数据流入口。
- **主进程模块边界**：[`docs/dev/references/architecture/main-process.md`](../docs/dev/references/architecture/main-process.md)。顶层目录为封闭分类；业务域应放在对应 feature/service，不要随意新增顶层目录。
- **Renderer 分层**：[`docs/dev/references/architecture/renderer.md`](../docs/dev/references/architecture/renderer.md)。页面负责组合，依赖应向下流动，跨域复用放共享层。
- **跨进程类型**：[`docs/dev/references/architecture/shared-layer.md`](../docs/dev/references/architecture/shared-layer.md)。`src/shared/` 放跨进程、无可变运行时状态的契约和类型。
- **用户数据系统**：[`docs/dev/references/data/README.md`](../docs/dev/references/data/README.md)。按数据用途选择 BootConfig、Cache、Preference 或 DataApi；业务数据走 DataApi/SQLite，不要把不同数据系统混为一谈。
- **长生命周期服务**：[`docs/dev/references/lifecycle/README.md`](../docs/dev/references/lifecycle/README.md)。持有长生命周期资源或持续副作用的主进程服务由生命周期容器管理；无资源的简单服务使用直接导入单例。
- **Electron 窗口**：[`docs/dev/references/window-manager/README.md`](../docs/dev/references/window-manager/README.md)。`BrowserWindow` 经 WindowManager 管理，业务代码使用 `open()` / `close()`，并按注册类型选择 default、singleton 或 pooled 模式。
- **打包 hooks**：[`scripts/packaging/README.md`](../scripts/packaging/README.md)。了解 before-pack/after-pack、原生依赖和随包二进制的准备流程后，再改 electron-builder 配置。

## 后续记录

任何一次踩坑都要留下记录：首次发生时建立条目；重复发生时在原条目下新增日期记录，写明本次现象、处理结果以及是否与既有根因一致。每条记录尽量包含可复现现象、经验证根因、有效处理方式和涉及的数据或进程风险。架构经验保留简短索引，并链接到正式文档。
