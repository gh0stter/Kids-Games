# 宝贝游戏 · Kids Games 🌈

[English](README.md) | **中文**

给 4–5 岁小朋友在家里 iPad 上玩的一组网页小游戏。

- **离线可用**：做成了 PWA，第一次打开后断网也能玩。
- **动森风格**：界面柔和、可爱，参考了《动物森友会》。
- **全程语音**：游戏里所有的话都用自然的中文神经网络语音读出来，小朋友不用认字也能玩。

![主菜单](docs/screenshots/menu.png)

> 截图是在无头 Chromium 里截的，emoji 是 Google 的样式；在 iPad 上显示的是苹果的 emoji。

## 游戏

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/balloon.png" alt="气球爆爆"></td>
    <td width="50%"><img src="docs/screenshots/shapes.png" alt="形状回家"></td>
  </tr>
  <tr>
    <td><b>🎈 气球爆爆</b><br>点从草地上飘起来的气球，每爆一个读出分数，每 10 个夸一次。</td>
    <td><b>🔺 形状回家</b><br>把形状拖进对应的虚线轮廓里，拿起形状时会读出它的名字。</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/count.png" alt="数一数"></td>
    <td><img src="docs/screenshots/memory.png" alt="翻翻乐"></td>
  </tr>
  <tr>
    <td><b>🍎 数一数</b><br>"有几个草莓？"点一下数一个，跟着读，再选答案。连续答对，数字会越来越大。</td>
    <td><b>🐼 翻翻乐</b><br>翻开卡片，找一样的小动物，翻开时读出动物名字。关卡从 3 对增加到 6 对。</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/draw.png" alt="画画"></td>
    <td><img src="docs/screenshots/tsunami-town.png" alt="海啸来啦"></td>
  </tr>
  <tr>
    <td><b>🖍️ 画画</b><br>自由画画：9 种颜色、彩虹笔、橡皮擦、3 种粗细，支持多根手指一起画。</td>
    <td><b>🌊 海啸来啦</b><br>3D 沙盒：用磁力片盖一座小镇，看它能不能挡住海啸。详见下面。</td>
  </tr>
</table>

## 🌊 海啸来啦（3D 沙盒）

这个游戏来自孩子在现实中的玩法：用磁力片搭很高的楼（对台北 101 特别执着），再卷起地毯当"海啸"压过来，楼够高就能挡住。

**搭建**

| 工具 | 做什么 |
| --- | --- |
| 🏢 盖楼 | 点一下地块加一层，按住连续盖。楼顶会显示层数并读出来；50 层有庆祝，101 层变成台北 101 并放烟花。 |
| 🧱 建墙 | 用手指划过地块，每划一遍加一层。墙会和相邻的墙、楼连起来，可以围成一圈。 |
| 🛣️ 修路 | 用手指画路，转弯和路口的中线都能接上，过河时自动变成桥。 |
| 🌉 建桥 | 从一处画到另一处：楼到楼是空中走廊，楼到地面是坡道，地面到地面是高架桥。车可以停在桥上。 |
| 🟡 阻尼球 | 给楼装上调谐质量阻尼器，就是真实的台北 101 里那颗金色大球。 |
| 🚒🚛🚜🚌🧍⛵ | 消防车、运输车、挖掘机、双层巴士、小人、小船。 |
| 🧹 / 🗑️ | 一样一样拆掉；或者连按两次垃圾桶，全部清空并换一座新的随机岛。 |

单指拖动地图，双指拖动和缩放。岛是随机生成的，搭好的东西会自动保存。

**然后按 🌊**

先随机发生一个事件：陨石、地震或火山爆发，引发一道 10–100 层高的海啸。浪会一排一排卷过小岛：

- **楼比浪高**：这一排被挡住，后面的东西都安全。墙也一样，所以围一圈墙就能保护里面的东西。
- **楼比浪矮**：楼被冲散，比浪低的桥被冲垮，车和人被冲走，船会浮起来。
- **地震**：超过随机承受高度、又没装阻尼球的楼会倒。
- **101 层**：一定能挡住，因为浪最高只有 100 层。

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/tsunami-wave.png" alt="海浪"></td>
    <td width="50%"><img src="docs/screenshots/tsunami-quake.png" alt="地震"></td>
  </tr>
  <tr>
    <td>35 层高的浪：那圈墙和更高的楼挡住了它们所在的那几排。</td>
    <td>地震：没装阻尼球的楼倒了，接在楼上的空中走廊也跟着断了。</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tsunami-101.png" alt="台北 101"></td>
    <td><img src="docs/screenshots/tsunami-town.png" alt="小镇"></td>
  </tr>
  <tr>
    <td>盖到 101 层：变成台北 101，放烟花、撒彩带。</td>
    <td>空中走廊、坡道、高架桥、一圈墙围起来的院子、公路和船。</td>
  </tr>
</table>

## 给家长

在菜单右上角按住 ⚙️ 1.5 秒，再答对一道乘法题，才能进入设置，小朋友不会误打开。

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/settings.png" alt="设置"></td>
    <td width="33%"><img src="docs/screenshots/countdown.png" alt="倒计时"></td>
    <td width="33%"><img src="docs/screenshots/rest.png" alt="休息画面"></td>
  </tr>
  <tr>
    <td>每天游玩时间、加时间、检查更新、强制刷新。</td>
    <td>最后一分钟倒计时变红，并有语音提醒。</td>
    <td>时间到了，盖上休息画面，明天再玩。</td>
  </tr>
</table>

- **每天游玩时间**：可以不限制，也可以设为 15–60 分钟。只在游戏画面显示时计时，停在菜单或切到后台都不算。
- **检查更新／强制刷新**：强制刷新会注销 Service Worker、清空缓存。执行前会先确认连得上服务器，不会在断网时把应用清空。
- **更新不会打断游戏**：新版本在后台下载好后，等孩子回到菜单时才刷新。

## 技术

- **Angular 22**：独立组件和 signals，每个游戏都是懒加载的。
- **three.js**（海啸游戏）：
  - 正交等距镜头。
  - 磁力片用 InstancedMesh 批量绘制。
  - 卷起的海浪是自己写的网格。
  - 倒塌和漂浮用简单的抛物线和浮力模拟。
- **PWA**（`@angular/service-worker`）：所有文件都会预先缓存，包括语音和字体，第一次打开后就能离线玩。
- **语音**：
  - 大约 390 句，用 [edge-tts](https://github.com/rany2/edge-tts) 调用微软的神经网络语音，预先生成 MP3。平时的话用晓晓，夸奖用更活泼的晓伊。
  - 通过 Web Audio 播放，所以 iOS 不会拦下延迟播放的语音。
  - 某句话没有对应音频时，自动改用系统语音。
- **音效**：全部用 Web Audio 合成，没有音频文件。
- **字体**：寒蝉圆黑体（ChillRound），只保留应用里用到的约 800 个字（约 130 KB），并按 OFL 的要求改了名。

## 开发

需要 Node.js 22 以上。只有重新生成语音或字体时才需要 Python 3。

```bash
npm install
npm start                 # 开发服务器 http://localhost:4200
npm run build             # 生产构建，输出到 dist/kids-games/browser
```

语音和字体子集都已经提交在仓库里，只有改了文字时才需要重新生成：

```bash
npm run tools:setup       # 第一次：在 .venv 里装 edge-tts、fonttools、brotli
npm run voice             # 生成缺少的语音、删除不用的、更新 voice-files.ts
npm run font              # 界面加了新汉字后，重新裁剪字体
```

### 部署

任何支持 HTTPS 的静态网站服务都可以。路由用的是 `#/`，不需要配置 SPA 回退规则。Service Worker 需要 HTTPS（或者 `localhost`）。

我自己的部署方式：`npm run deploy` 先构建，再用 `rsync` 同步到一个文件夹；Synology Drive 把这个文件夹同步到 NAS，由 Web Station 通过 HTTPS 提供访问。用 `DEPLOY_DIR` 指定同步到哪里：

```bash
DEPLOY_DIR=/path/to/site npm run deploy
```

## 目录

```
src/app/
  games.ts            游戏注册表：菜单和路由都从这里生成
  voice-lines.ts      所有要说的话（npm run voice 读取这里）
  core/               音效、语音、庆祝、游玩时间、自动更新
  shared/             游戏外壳（回家按钮 + 开始画面）、设置、休息画面、倒计时
  menu/               主菜单
  games/<name>/       每个游戏一个目录；<name>-data.ts 放数据和要说的话
  games/tsunami/      world.ts（场景、触摸、海浪、地震）、camera-rig.ts（镜头）、
                      wave-mesh.ts（海浪网格）、island.ts（随机小岛）、models.ts（车、桥等模型）
public/voice/         预生成的语音 MP3
public/fonts/         字体子集
scripts/              gen-voice.mts、subset-font.py、deploy.sh
```

### 新增游戏

1. 建 `src/app/games/<name>/<name>.ts`（以及 `.html`、`.scss`），模板最外层包上 `<app-game-shell (start)="start()">`。
2. 在 `src/app/games.ts` 的 `GAMES` 里加一项：路径、标题、图标、颜色、开场白、懒加载。
3. 游戏里要说的话放进 `<name>-data.ts`，在 `src/app/voice-lines.ts` 里加上，再运行 `npm run voice`。

菜单、路由和离线缓存都会自动包含新游戏。

## 致谢与许可证

- **代码**：[MIT](LICENSE)。
- **字体**：ChillType 的[寒蝉圆黑体（ChillRound）](https://github.com/Warren2060/ChillRound)，SIL Open Font License 1.1（[licenses/ChillRound-OFL.txt](licenses/ChillRound-OFL.txt)）。仓库里的是修改过的子集，按 OFL 保留字体名的条款改名为 *KidsGamesRound*。
- **语音**：用非官方的 edge-tts 客户端调用微软在线神经网络语音生成。如果要用在别的地方，请先确认微软的使用条款。
- **框架**：[three.js](https://threejs.org/)（MIT）、[Angular](https://angular.dev/)（MIT）。
- **美术**：参考了《动物森友会》（界面）和《Bastion》（地块从天上落下拼成小岛），没有使用这两款游戏的任何素材。
