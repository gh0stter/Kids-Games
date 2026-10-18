"""
把寒蝉圆黑体（ChillRound，OFL 授权）裁剪成只包含游戏里用到的字，生成 public/fonts/huninn.woff2。

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

if not CACHE.exists():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f'下载 {URL}')
    zip_path, _ = urllib.request.urlretrieve(URL)
    zipfile.ZipFile(zip_path).extract('ChillRoundM_v1.805/ChillRoundM.ttf', CACHE_DIR)

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
print(f'{OUT}: {len(chars)} 个字符，{OUT.stat().st_size // 1024} KB')
if missing:
    print('字体里没有这些字（会用系统字体）：' + ''.join(missing))
