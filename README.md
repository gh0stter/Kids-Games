# 宝贝游戏

给 4–5 岁小朋友在 iPad 上玩的网页小游戏（Angular 22 + TypeScript，PWA 可离线）。
部署在家里群晖 DS918+ 的 Web Station 上，通过 `https://home.xxx.com:1317` 访问。

## 开发

源码放在 WSL 里（`~/projects/kids-games`），用 VS Code 的 WSL 扩展打开。不需要全局安装 Angular CLI，用项目自带的 `npx ng`。

```bash
npm start          # 开发服务器 http://localhost:4200（Windows 浏览器可直接打开）
npm run deploy     # 生产构建 + 同步到 G 盘 site/
```

## 部署链路

```
WSL: npm run deploy
  → dist/kids-games/browser/
  → rsync 到 /mnt/g/Software Development/Kids Games/site/
  → Synology Drive 同步到 NAS
  → Web Station（门户 HTTPS 8800，文档根目录 Kids Games/site）
  → 路由器 1317 → 8800
```

部署位置可以用环境变量改：`DEPLOY_DIR=/mnt/x/... npm run deploy`。

## 目录

```
src/app/
  games.ts          游戏注册表：菜单和路由都从这里生成
  voice-lines.ts    游戏里会说的所有话（生成语音用）
  app.routes.ts     路由（# 路由，Web Station 不需要 SPA 回退规则）
  core/
    sound.ts        音效（Web Audio 合成，无音频文件）
    speech.ts       中文语音：播放预生成的音频，没有的话用 iPad 系统语音
    voice-files.ts  文字 → 音频文件对照表（npm run voice 生成）
    celebration.ts  彩带 + 夸奖
    random.ts       rand / randInt / pick / shuffle
    app-update.ts   新版本下载好后，回到菜单时自动刷新
  shared/
    game-shell.ts   游戏外壳：回家按钮 + 开始画面（解锁 iOS 声音）
  menu/             主菜单
  games/<name>/     各个游戏；<name>-data.ts 放数据和要说的话
public/voice/       预生成的语音 mp3
```

## 语音

语音是用微软 Edge 的神经网络语音（edge-tts，非官方接口）预先生成的 mp3，跟其他文件一起离线缓存。
平时的话用晓晓（`zh-CN-XiaoxiaoNeural`），夸奖用更活泼的晓伊（`zh-CN-XiaoyiNeural`），在 `scripts/gen-voice.mts` 里改。

```bash
npm run tools:setup   # 第一次：在 .venv 里装 edge-tts 和 fonttools（需要 python3）
npm run voice         # 生成缺少的语音、删除不用的、更新 voice-files.ts
```

新加或修改了要说的话，把它加进对应的 `*-data.ts`（或 `voice-lines.ts`），再跑 `npm run voice`。
忘了也没关系，没有音频的话会自动用系统语音。

## 字体和美术风格

动森风格：天空圆点背景、奶油色纸片（`.paper`）、彩色名牌（`.name-tag`）、圆角图标，颜色变量在 `src/styles.scss`。
字体是寒蝉圆黑体（ChillRound，OFL），只保留游戏里用到的字，生成到 `public/fonts/chill-round.woff2`（约 90 KB）：

```bash
npm run font          # 界面加了新汉字后重新跑
```

## 新增游戏

1. 建 `src/app/games/<name>/<name>.ts`（以及 `.html` / `.scss`），模板最外层包上 `<app-game-shell (start)="start()">`
2. 在 `src/app/games.ts` 的 `GAMES` 里加一项（路径、标题、图标、颜色、开场白、懒加载）
3. 游戏里要说的话放进 `<name>-data.ts`，在 `src/app/voice-lines.ts` 里加上，跑 `npm run voice`

菜单、路由、离线缓存都会自动包含新游戏。

## 离线与更新

- 使用 `@angular/service-worker`，首次打开就把所有文件缓存到 iPad，之后断网也能玩
- 发布新版本后，iPad 联网打开时在后台下载，等回到菜单时自动刷新，不会打断正在玩的游戏
- Service Worker 只在 HTTPS 下工作，`npm start` 的开发服务器里是关闭的
