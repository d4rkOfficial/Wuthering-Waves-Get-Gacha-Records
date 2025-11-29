# Wuthering Waves Gocha Record

## 运行环境
- 操作系统 Windows 10/11
- 运行环境 Deno 2+

## 运行方法

仅获取抽卡链接，用于向第三方工具（如鸣潮工坊）导入抽卡记录。
```bash
deno run -A get_gocha_link.ts
```

直接保存抽卡记录到本地文件。（暂定为执行路径下的gacha_records.json）
```bash
deno run -A get_and_save_gocha_record.ts
```

也可以直接下载可执行文件（.exe）

## 补充

在这个项目的基础上，可能接下来会推出抽卡记录本地管理工具，敬请期待。
