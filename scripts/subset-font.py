"""
把寒蝉圆黑体（ChillRound，SIL OFL 1.1）裁剪成只包含游戏里用到的字，生成 public/fonts/chill-round.woff2。

OFL 规定修改过的字体不能用保留字体名（Reserved Font Name）"ChillRoundM"，裁剪就算修改，
所以子集里的字体名改成 KidsGamesRound；许可证全文放在 licenses/ChillRound-OFL.txt。

    npm run font

完整字体有 6 MB，裁剪后只有几十 KB。改了界面文字（新增了没用过的汉字）后要重新跑一次，
没包含的字会用系统字体显示。
"""
import pathlib, re, string, subprocess, sys, urllib.request, zipfile

from fontTools.ttLib import TTFont

URL = 'https://github.com/Warren2060/ChillRound/releases/download/v1.805/ChillRoundM_v1.805.zip'
CACHE_DIR = pathlib.Path.home() / '.cache' / 'kids-games'
CACHE = CACHE_DIR / 'ChillRoundM_v1.805' / 'ChillRoundM.ttf'
OUT = pathlib.Path('public/fonts/chill-round.woff2')
LICENSE = CACHE_DIR / 'ChillRoundM_v1.805' / 'LICENSE.txt'
LICENSE_OUT = pathlib.Path('licenses/ChillRound-OFL.txt')
NEW_NAME = 'KidsGamesRound'

if not CACHE.exists() or not LICENSE.exists():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f'下载 {URL}')
    zip_path, _ = urllib.request.urlretrieve(URL)
    for name in ('ChillRoundM.ttf', 'LICENSE.txt'):
        zipfile.ZipFile(zip_path).extract(f'ChillRoundM_v1.805/{name}', CACHE_DIR)

# 源码里出现的所有非 ASCII 字符 + 全部可打印 ASCII
chars = set(string.printable.strip()) | {' '}
for path in pathlib.Path('src').rglob('*'):
    if path.suffix in ('.ts', '.html'):
        chars |= {c for c in path.read_text(encoding='utf-8') if ord(c) > 127}

cmap = TTFont(CACHE).getBestCmap()
missing = sorted(c for c in chars if ord(c) not in cmap and not re.match(r'[\U0001F000-\U0001FFFF☀-➿️‍]', c))
text = ''.join(sorted(chars))

OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(
    [sys.executable, '-m', 'fontTools.subset', str(CACHE), f'--text={text}', '--flavor=woff2',
     f'--output-file={OUT}', '--layout-features=*'],
    check=True,
)
# 改掉保留字体名：家族名、全名、PostScript 名等都换成 NEW_NAME
font = TTFont(OUT)
for rec in font['name'].names:
    if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22):
        text_ = rec.toUnicode()
        rec.string = NEW_NAME if rec.nameID in (1, 16, 21) else re.sub(r'ChillRound[FM]?', NEW_NAME, text_)
font.flavor = 'woff2'
font.save(OUT)

LICENSE_OUT.parent.mkdir(parents=True, exist_ok=True)
LICENSE_OUT.write_bytes(LICENSE.read_bytes())

print(f'{OUT}: {len(chars)} 个字符，{OUT.stat().st_size // 1024} KB')
if missing:
    print('字体里没有这些字（会用系统字体）：' + ''.join(missing))
