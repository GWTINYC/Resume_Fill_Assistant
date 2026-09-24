# PC 本地密钥连接程序

这套程序让 Chrome / Edge 扩展读写用户主目录中的独立密钥文件。文件不会随扩展卸载而删除，不设密码，不联网，也不常驻后台。

- Mac：`~/.resume-fill-assistant/api-keys.json`
- Windows：`%USERPROFILE%\.resume-fill-assistant\api-keys.json`

仅保存 Jev 和 DeepSeek 的 API key。文件为明文，权限限定当前用户（Windows 同时保留 SYSTEM）；同一系统账户运行的程序仍可能读取它。这里不备份简历、PDF/TXT 或已学习资料。

## 安装一次

1. 先更新扩展到 0.8.0 或以上，重新加载。若浏览器提示新增本地程序连接权限，按扩展管理页提示启用。
2. 在插件侧栏展开 **PC 文件保存 · 卸载后可恢复**，复制“当前扩展 ID”（32 个小写字母）。
3. 安装本地连接程序：
   - **Windows**：解压整个压缩包后双击 `install-windows.bat`。它使用系统 .NET Framework 编译器把 `Host.cs` 编译成本地程序，不需要 Python、PowerShell 脚本权限或管理员权限。若找不到编译器，需先从 Microsoft 安装 .NET Framework 4.8。
   - **Mac**：双击 `install-macos.command`；也可在终端输入 `sh `（含空格），拖入该文件后回车。需要可用的 Python 3；缺失时请从 python.org 安装，再运行本脚本。
4. 按提示粘贴扩展 ID，回车。Chrome 与 Edge 使用不同 ID 时，可输入用逗号分隔的两个 ID，也可分别运行两次安装。
5. 回到插件点击 **连接 / 迁移到 PC 文件**，确认显示“PC 文件已连接”。程序会迁移浏览器中尚未备份的密钥，或读取 PC 文件中已有的密钥。

安装后，Windows 程序放在用户目录下的 `native/host.exe`，只为当前用户注册 Chrome/Edge 的 Native Messaging；Mac 把启动器注册到当前用户的 Chrome/Edge 目录。只授权你输入的具体扩展 ID，不授权任意网页或扩展。安装器不修改已有 API key 文件。

## 以后保存与重装

在插件里保存密钥，会更新 PC 文件和浏览器副本。正常更新、卸载扩展都不会删除 PC 文件。

重装后，同一已授权的扩展 ID 会自动读回密钥。改变扩展文件夹或换浏览器可能改变 ID；重新运行安装脚本，把新 ID 加进去即可，已有密钥不会被覆盖。这里只共用同一电脑、同一系统账户的文件，不会跨电脑同步；跨电脑可自行复制该文件，再安装对应系统的连接程序。

点击插件的“清除”会同时删除当前服务在 PC 文件中的值和浏览器副本；另一服务保留。本地连接失效时，已连接过的密钥不会被虚假标记为已彻底清除。

## 出错时

- `PC_NOT_INSTALLED`：找不到连接程序，重新运行安装脚本。
- `PC_ORIGIN_DENIED`：扩展 ID 未被授权，复制当前 ID 后重跑安装脚本。
- `PC_HOST_FAILED`：程序未能启动或通信，检查安装输出；Mac 检查 Python 3，Windows 检查 .NET Framework。
- `PC_FILE_INVALID`：密钥文件不是合法 JSON、版本不匹配或字段格式不正确。先备份文件再检查，程序不会自动覆盖损坏文件。
- `PC_FILE_ACCESS` / `PC_IO_FAILED`：检查磁盘空间、用户目录权限或组织策略。无需提升到管理员或关闭安全保护。
- `PC_FILE_BUSY`：另一请求正在写入，稍后重试。

文件结构（占位值需要替换，不要原样使用）：

```json
{
  "version": 1,
  "keys": {
    "jev": "apikey_your_jev_key",
    "deepseek": "sk-your-deepseek-key"
  },
  "updatedAt": "2026-09-25T00:00:00Z"
}
```

“仅浏览器”表示文件尚未写入成功，不能当作卸载后的备份。失败时优先提供错误码和安装输出，不要发送真实密钥文件。

## 验证范围

Mac 已完成真实 Chromium Native Messaging、迁移、全新浏览器配置恢复、单服务清除、并发写入及文件损坏保护测试。Windows 程序通过 C# 5 / .NET Framework 4.8 引用程序集编译检查，尚未在 Windows 实机运行。开发者可在 Windows 安装 Python 3 后，从源码根目录运行 `python tests/native-host.test.py`；正常安装和使用不需要 Python。
