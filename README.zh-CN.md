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
  <tr>
    <td><img src="docs/screenshots/rescue-tornado.png" alt="拼拼救援队"></td>
    <td><img src="docs/screenshots/rescue-build.png" alt="拼拼救援队：拼装"></td>
  </tr>
  <tr>
    <td colspan="2"><b>🛟 拼拼救援队</b><br>用磁力零件拼一台车、船或飞机，顶住海啸、台风、龙卷风、地震或漩涡，去救困住的好朋友。详见下面。</td>
  </tr>
</table>

## 🌊 海啸来啦（3D 沙盒）

这个游戏来自孩子在现实中的玩法：用磁力片搭很高的楼（对台北 101 特别执着），再卷起地毯当"海啸"压过来，楼够高就能挡住。

**搭建**

| 工具         | 做什么                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| 🏢 盖楼      | 点一下地块加一层，按住连续盖。楼顶会显示层数并读出来；50 层有庆祝，101 层变成台北 101 并放烟花。 |
| 🧱 建墙      | 用手指划过地块，每划一遍加一层。墙会和相邻的墙、楼连起来，可以围成一圈。                         |
| 🛣️ 修路      | 用手指画路，转弯和路口的中线都能接上，过河时自动变成桥。                                         |
| 🌉 建桥      | 从一处画到另一处：楼到楼是空中走廊，楼到地面是坡道，地面到地面是高架桥。车可以停在桥上。         |
| 🟡 阻尼球    | 给楼装上调谐质量阻尼器，就是真实的台北 101 里那颗金色大球。                                      |
| 🚒🚛🚜🚌🧍⛵ | 消防车、运输车、挖掘机、双层巴士、小人、小船。                                                   |
| 🧹 / 🗑️      | 一样一样拆掉；或者连按两次垃圾桶，全部清空并换一座新的随机岛。                                   |

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

## 🛟 拼拼救援队（拼载具，扛灾害）

这个游戏照着孩子手上的一套磁力变形工程车做：车头、中间段、车尾都能拆开，前后随便接。
游戏里，黄熊队长（照着孩子最喜欢的黄色小熊玩偶）用这些零件拼一台救援载具，穿过陆地或海洋，顶住灾害，把考拉、小黄鸡和白熊救回来。

和海啸来啦一样，每种灾害对应一个真实的道理。而且没有万能的载具：越重越不怕风，但也越难飞、越难浮。

**拼装**

- 6×4 的格子，18 种零件：5 种车头、9 种中间段、4 种车尾。每块都自带底部：轮子、压路滚筒、船底或者直升机的滑橇。
- 点一下放一块，手指划过去一次铺一排。必须有车头和车尾，所有块要连在一起；车头前面、车尾后面不能再接东西。
- 已经放好的自卸斗再点一下，装上石头，变重。
- 右边的转台上可以转着看拼好的车，还会读出它叫什么：小汽车、吊车、船、水陆两用车、飞天车……
- 车库记住最近出发过的 6 台车，点一下就能开出来。

**出发**

| 灾害                | 要想到的道理                                   | 可以怎么拼                               |
| ------------------- | ---------------------------------------------- | ---------------------------------------- |
| 🌊 海啸             | 浮起来，就能骑着浪过去                         | 船底；或者用螺旋桨飞过去                 |
| ⛈️ 台风             | 越重、站得越宽越不会翻；举高的吊臂和飞机最怕风 | 宽底盘加压路滚筒、搅拌罐；宽的船         |
| 🌪️ 龙卷风           | 抓住地面                                       | 挖掘铲斗插进地里、吊钩勾住地面；或者够重 |
| 🫨 地震             | 车身长才跨得过裂缝；矮、宽、有阻尼球就不怕摇   | 长车；宽底盘；阻尼球                     |
| 🌀 漩涡（自由模式） | 长长的船横在漩涡上，卷不进去                   | 多接几块船身；或者飞过去                 |

还有几条一路上都管用的：地上要有轮子；水上要有船底，而且浮力要够，太重会沉；螺旋桨的升力要大过重量才飞得起来；朋友在树上或屋顶上，要吊车才够得着。

灾害来的时候，屏幕上方有一条拔河条：左边是灾害的力气，右边是黄熊队长，绳结往谁那边跑谁就赢。

**10 个关卡 + 自由模式**：从「开车去草地对面接考拉」开始，一直到「大地震里用吊车从屋顶上救白熊」。自由模式随机抽地形、灾害和朋友。

**失败了也好玩**：车被吹翻、被卷上天（撑着小伞慢慢落下来）、沉下去（黄熊坐上救生圈），都是好笑的，不吓人。同一个原因连着失败，提示一次比一次多：

1. 第一次只说发生了什么：「车被风吹倒了！」
2. 第二次问一个生活里的问题：「风能吹动小树叶，能吹动大石头吗？」
3. 第三次直接给提示：结果卡上出现 💡 和建议的零件，零件盘里这几个零件跳动发光。

成功后会得到一张原理贴纸（一共 10 张：轮子、船底、升力、重、矮、抓地、长、宽、平衡、阻尼球），救回来的朋友出现在地图的好朋友墙上。

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/rescue-map.png" alt="关卡地图"></td>
    <td width="50%"><img src="docs/screenshots/rescue-typhoon.png" alt="台风"></td>
  </tr>
  <tr>
    <td>关卡地图、好朋友墙和贴纸本。</td>
    <td>台风里吊考拉：吊车两边垫了压路滚筒，又宽又重，吹不倒。</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/rescue-quake.png" alt="地震"></td>
    <td><img src="docs/screenshots/rescue-tsunami.png" alt="海啸"></td>
  </tr>
  <tr>
    <td>大地震里从屋顶上救白熊：阻尼球把摇晃吃掉，吊臂伸长够到屋顶。</td>
    <td>两排宽的船骑上海啸的浪头。</td>
  </tr>
</table>

零件数值在 `src/app/games/rescue/parts.ts`，算结果的规则在 `sim.ts`。改完跑 `npm run test:rescue`，它会检查每一关都还有解、典型的错法都会失败。完整的设计见 [docs/rescue-design.md](docs/rescue-design.md)。

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
- **three.js**：
  - 海啸来啦：正交等距镜头；磁力片用 InstancedMesh 批量绘制；卷起的海浪是自己写的网格；倒塌和漂浮用简单的抛物线和浮力模拟。
  - 拼拼救援队：跟着载具走的透视镜头；零件和玩偶全部用几何体程序化生成，零件盘里的小图是启动时用 three.js 现画的；海浪网格和海啸来啦共用。
- **PWA**（`@angular/service-worker`）：所有文件都会预先缓存，包括语音和字体，第一次打开后就能离线玩。
- **语音**：
  - 大约 490 句，用 [edge-tts](https://github.com/rany2/edge-tts) 调用微软的神经网络语音，预先生成 MP3。平时的话用晓晓，夸奖用更活泼的晓伊，拼拼救援队里黄熊队长的话用童声云夏。
  - 通过 Web Audio 播放，所以 iOS 不会拦下延迟播放的语音。
  - 某句话没有对应音频时，自动改用系统语音。
- **音效**：全部用 Web Audio 合成，没有音频文件。
- **字体**：寒蝉圆黑体（ChillRound），只保留应用里用到的约 1000 个字（约 160 KB），并按 OFL 的要求改了名。

## 开发

需要 Node.js 22 以上。只有重新生成语音或字体时才需要 Python 3。

```bash
npm install
npm start                 # 开发服务器 http://localhost:4200
npm run build             # 生产构建，输出到 dist/kids-games/browser
npm run test:rescue       # 拼拼救援队的规则测试
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
  games/rescue/       parts.ts（零件数值）、vehicle.ts（拼装规则）、sim.ts（算结果）、
                      journey.ts（出发后的场面和灾害）、preview.ts（转台）、models.ts（零件和玩偶模型）
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
- **字体**：ChillType 的[寒蝉圆黑体（ChillRound）](https://github.com/Warren2060/ChillRound)，SIL Open Font License 1.1（[licenses/ChillRound-OFL.txt](licenses/ChillRound-OFL.txt)）。仓库里的是修改过的子集，按 OFL 保留字体名的条款改名为 _KidsGamesRound_。
- **语音**：用非官方的 edge-tts 客户端调用微软在线神经网络语音生成。如果要用在别的地方，请先确认微软的使用条款。
- **框架**：[three.js](https://threejs.org/)（MIT）、[Angular](https://angular.dev/)（MIT）。
- **美术**：参考了《动物森友会》（界面）和《Bastion》（地块从天上落下拼成小岛），没有使用这两款游戏的任何素材。
