#!/bin/bash
# 把编译结果同步到 G 盘的 site/ 文件夹。
# Synology Drive 会把它同步到 NAS，Web Station 直接从那里读取。
# 换位置时：DEPLOY_DIR=/mnt/x/... npm run deploy
set -e
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/g/Software Development/Kids Games/site}"

# Windows 盘不支持 Linux 权限，用 -rt 而不是 -a
rsync -rt --delete --info=stats1 dist/kids-games/browser/ "$DEPLOY_DIR/"
echo "已部署到 $DEPLOY_DIR"
