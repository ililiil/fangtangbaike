# Docker 部署指南

本文档说明如何使用 Docker 部署方塘百科项目。

## 快速开始

### 1. 基础部署（开发/测试环境）

使用 docker-compose 快速启动服务：

```bash
# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，填入你的火山引擎API密钥
# VOLC_AK=your_access_key_here
# VOLC_SK=your_secret_key_here

# 构建并启动容器
docker-compose up -d

# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

访问地址：`http://localhost:3001`

### 2. 生产环境部署（推荐）

使用生产环境配置，包含 Nginx 反向代理：

```bash
# 使用生产环境配置启动
docker-compose -f docker-compose.prod.yml up -d

# 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看特定服务日志
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f nginx
```

访问地址：`http://localhost`

## 架构说明

### 开发/测试环境
```
用户 → Node.js App (端口3001)
```

### 生产环境
```
用户 → Nginx (端口80/443) → Node.js App (内部端口3001)
```

Nginx 提供：
- 静态文件服务（前端页面）
- 反向代理（API请求）
- Gzip压缩
- 安全头
- 静态资源缓存

## 环境变量

在 `.env` 文件中配置以下变量：

| 变量名 | 说明 | 是否必填 | 默认值 |
|--------|------|----------|--------|
| VOLC_AK | 火山引擎Access Key | 否 | 使用代码中的默认值 |
| VOLC_SK | 火山引擎Secret Key | 否 | 使用代码中的默认值 |

**强烈建议在生产环境中设置这两个变量**，不要使用默认值。

## 常用命令

### 构建镜像
```bash
# 开发环境镜像
docker build -t fangxiaotang-chat .

# 生产环境镜像
docker build -t fangxiaotang-chat:prod -f Dockerfile .
```

### 启动/停止服务
```bash
# 启动
docker-compose up -d
docker-compose -f docker-compose.prod.yml up -d

# 停止
docker-compose down
docker-compose -f docker-compose.prod.yml down

# 停止并删除数据卷
docker-compose down -v
```

### 进入容器调试
```bash
# 进入Node.js容器
docker exec -it fangxiaotang-app sh

# 进入Nginx容器
docker exec -it fangxiaotang-nginx sh
```

### 查看资源使用
```bash
docker stats
```

### 健康检查
```bash
# 检查Node.js服务健康状态
curl http://localhost:3001/health

# 检查Nginx服务健康状态
curl http://localhost/health
```

## 更新部署

### 重新构建并启动
```bash
# 拉取最新代码后重新部署
docker-compose build --no-cache
docker-compose up -d

# 生产环境
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### 滚动更新（生产环境）
```bash
# 只更新Node.js应用
docker-compose -f docker-compose.prod.yml up -d --build app

# 只更新Nginx
docker-compose -f docker-compose.prod.yml up -d --build nginx
```

## HTTPS 配置（生产环境）

### 使用 Let's Encrypt 免费证书

1. 安装 certbot：
```bash
docker pull certbot/certbot
```

2. 生成证书：
```bash
docker run --rm \
  -v $(pwd)/data/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/data/certbot/www:/var/www/certbot \
  certbot/certbot certonly -d yourdomain.com \
  --webroot -w /var/www/certbot
```

3. 修改 nginx/nginx.conf 启用 HTTPS：
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # ... 其他配置
}
```

### 使用自有证书

将证书文件挂载到容器中：

```yaml
# 在 docker-compose.prod.yml 的 nginx 服务中添加
volumes:
  - ./ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
  - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro
```

然后修改 nginx/nginx.conf 配置 SSL。

## 性能优化

### Node.js应用

1. 设置 Node.js 内存限制：
```dockerfile
# 在Dockerfile中添加
ENV NODE_OPTIONS="--max-old-space-size=512"
```

2. 启用集群模式（高并发场景）：
需要修改 server/index.js 支持集群模式。

### Nginx

当前配置已包含：
- Gzip压缩
- 静态资源缓存（1年）
- HTTP/2支持
- 连接Keep-Alive

## 监控和日志

### 日志管理

推荐使用 ELK Stack 或 Loki 进行日志收集：

```yaml
# docker-compose.prod.yml 中添加
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 容器监控

使用 Prometheus + Grafana：

```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
```

## 故障排查

### 常见问题

1. **容器启动失败**
```bash
# 查看详细日志
docker-compose logs app

# 检查端口占用
netstat -tulpn | grep 3001
```

2. **API请求失败**
```bash
# 检查容器网络
docker exec -it fangxiaotang-app ping nginx
docker exec -it fangxiaotang-nginx ping app

# 检查DNS解析
docker exec -it fangxiaotang-nginx nslookup app
```

3. **静态文件加载失败**
```bash
# 检查文件是否正确挂载
docker exec -it fangxiaotang-nginx ls -la /usr/share/nginx/html/
```

### 调试模式

启用详细日志：

```yaml
# docker-compose.prod.yml
services:
  app:
    environment:
      - NODE_ENV=development
```

## 安全建议

1. **不要在代码中存储密钥**：始终使用环境变量
2. **限制容器权限**：使用只读文件系统
3. **定期更新镜像**：使用最新的基础镜像
4. **配置防火墙**：只开放必要端口
5. **使用非root用户**：在Dockerfile中配置

```dockerfile
# 在Dockerfile末尾添加
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
```

## 扩展阅读

- [Docker 官方文档](https://docs.docker.com/)
- [Nginx 文档](https://nginx.org/en/docs/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
