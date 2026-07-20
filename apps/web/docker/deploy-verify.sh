#!/bin/bash
set -e

CONTAINER_NAME="douyin-frontend"
HEALTH_ENDPOINT="http://localhost:3000/api/healthz"

echo "=== Douyin Frontend 部署验证 ==="

echo -n "检查容器状态... "
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "运行中"
else
    echo "未运行"
    exit 1
fi

echo -n "检查健康检查... "
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME} 2>/dev/null || echo "unknown")
if [ "$HEALTH" = "healthy" ]; then
    echo "健康"
else
    echo "$HEALTH"
fi

echo -n "检查 /api/healthz... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_ENDPOINT}" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "HTTP $HTTP_CODE"
else
    echo "HTTP $HTTP_CODE"
    exit 1
fi

echo ""
echo "=== 容器资源使用 ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" ${CONTAINER_NAME}

echo ""
echo "=== 验证完成 ==="
