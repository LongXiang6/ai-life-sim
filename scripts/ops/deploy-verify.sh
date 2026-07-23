#!/usr/bin/env bash
# AI 核心模拟系统修复 - 部署与验证脚本
# 用途：在生产服务器执行部署后的验证流程

set -euo pipefail

echo "=========================================="
echo "AI 核心模拟系统修复 - 部署验证"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在服务器上
if [ "$(whoami)" != "ubuntu" ] && [ "$HOME" != "/root" ]; then
    echo -e "${YELLOW}警告: 此脚本设计用于生产服务器${NC}"
    echo "如果在本地运行，某些检查可能失败"
    echo ""
fi

# 步骤1: 检查应用是否运行
echo "步骤 1/5: 检查应用运行状态"
if command -v pm2 &> /dev/null; then
    sudo pm2 list | grep ai-life-sim || {
        echo -e "${RED}❌ PM2 未运行 ai-life-sim${NC}"
        exit 1
    }
    echo -e "${GREEN}✅ PM2 状态正常${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 未安装，跳过检查${NC}"
fi
echo ""

# 步骤2: 验证 API Keys
echo "步骤 2/5: 验证 API Keys 配置"
if [ -f "/root/ai-life-sim/scripts/ops/verify-api-keys.mjs" ]; then
    sudo node /root/ai-life-sim/scripts/ops/verify-api-keys.mjs || {
        echo -e "${YELLOW}⚠️  部分 API Key 配置有问题${NC}"
        echo "请根据上述输出修复配置，然后重启 PM2"
        echo ""
        echo "修复步骤："
        echo "  1. sudo nano /root/ai-life-sim/.env"
        echo "  2. 更新失败的 API Key 和 Base URL"
        echo "  3. sudo pm2 restart ai-life-sim"
        echo "  4. 重新运行本验证脚本"
        echo ""
        exit 1
    }
    echo -e "${GREEN}✅ 所有 API Keys 验证通过${NC}"
else
    echo -e "${YELLOW}⚠️  验证脚本不存在，跳过 API Key 检查${NC}"
fi
echo ""

# 步骤3: 检查最近的错误日志
echo "步骤 3/5: 检查最近 1 小时的错误分布"
if [ -d "/var/log/ai-life-sim" ]; then
    sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs \
        --root /var/log/ai-life-sim \
        --since-hours 1 \
        2>/dev/null | grep -E "(statusCounts|totals)" -A 10 || {
        echo -e "${YELLOW}⚠️  无法读取日志或日志为空${NC}"
    }
    echo -e "${GREEN}✅ 日志检查完成${NC}"
else
    echo -e "${YELLOW}⚠️  日志目录不存在${NC}"
fi
echo ""

# 步骤4: 检查版本信息
echo "步骤 4/5: 验证部署版本"
if [ -f "/root/ai-life-sim/package.json" ]; then
    VERSION=$(sudo cat /root/ai-life-sim/package.json | grep '"version"' | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    echo "当前版本: $VERSION"

    # 检查是否有 changelog
    CHANGELOG_FILE="/root/ai-life-sim/public/changelog-$(echo $VERSION | sed 's/\.//' | sed 's/\.//' | sed 's/\.//').txt"
    if [ -f "$CHANGELOG_FILE" ]; then
        echo -e "${GREEN}✅ Changelog 文件存在: changelog-$(echo $VERSION | sed 's/\.//' | sed 's/\.//' | sed 's/\.//').txt${NC}"
    else
        echo -e "${YELLOW}⚠️  未找到对应的 changelog 文件${NC}"
    fi
else
    echo -e "${RED}❌ package.json 不存在${NC}"
    exit 1
fi
echo ""

# 步骤5: 测试关键接口
echo "步骤 5/5: 测试关键接口"
echo "测试 /api/proxy GET (检查配置状态)..."
RESPONSE=$(curl -s http://localhost:3000/api/proxy?providerId=managed)
if echo "$RESPONSE" | grep -q "configured"; then
    echo -e "${GREEN}✅ Proxy API 响应正常${NC}"
else
    echo -e "${RED}❌ Proxy API 响应异常${NC}"
    echo "响应: $RESPONSE"
    exit 1
fi
echo ""

echo "=========================================="
echo "验证完成"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 访问 https://ai-mnrs.icu 测试实际游戏流程"
echo "2. 监控 24 小时日志，关注："
echo "   - 400 错误是否仍在重试（应为 0）"
echo "   - 整体成功率是否提升"
echo "   - managed-a6 通道是否恢复"
echo ""
echo "监控命令："
echo "  sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs --root /var/log/ai-life-sim --since-hours 24"
echo ""
