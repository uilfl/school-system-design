# 部署指南

## 部署架構

### 生產環境架構

```
                    ┌─────────────┐
                    │   Cloudflare│
                    │   CDN + WAF │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │Load Balancer│
                    │  (Nginx)    │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼───┐          ┌───▼───┐         ┌───▼───┐
    │ API   │          │ API   │         │ API   │
    │ Node 1│          │ Node 2│         │ Node 3│
    └───┬───┘          └───┬───┘         └───┬───┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
    ┌───────▼─────┐  ┌─────▼─────┐  ┌────▼─────┐
    │ PostgreSQL  │  │   Redis   │  │   S3/    │
    │   Primary   │  │  Cluster  │  │  Minio   │
    └───────┬─────┘  └───────────┘  └──────────┘
            │
    ┌───────▼─────┐
    │ PostgreSQL  │
    │  Replicas   │
    └─────────────┘
```

---

## 1. Docker 容器化

### Docker Compose (開發環境)

```yaml
# docker-compose.yml
version: '3.8'

services:
  # API 服務
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/school_saas
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - AWS_S3_BUCKET=${AWS_S3_BUCKET}
    volumes:
      - ./backend:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis
    command: npm run dev

  # PostgreSQL 資料庫
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=school_saas
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql

  # Redis 快取
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # Minio (本地 S3 替代)
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

  # 前端應用
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3001:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:3000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm start

  # Nginx (反向代理)
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - frontend

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 安裝依賴
COPY package*.json ./
RUN npm ci --only=production

# 複製程式碼
COPY . .

# 建置 TypeScript
RUN npm run build

# 生產環境
FROM node:18-alpine

WORKDIR /app

# 複製建置結果
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 非 root 用戶
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Nginx 服務靜態檔案
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

## 2. Kubernetes 部署

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: school-saas
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
  namespace: school-saas
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  API_PORT: "3000"
```

### Secret

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
  namespace: school-saas
type: Opaque
data:
  # Base64 編碼
  DATABASE_URL: <base64-encoded-connection-string>
  JWT_SECRET: <base64-encoded-secret>
  AWS_ACCESS_KEY: <base64-encoded-key>
  AWS_SECRET_KEY: <base64-encoded-secret>
```

### API Deployment

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: school-saas
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: school-saas/api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: api-config
              key: NODE_ENV
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: DATABASE_URL
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: JWT_SECRET
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

### Service

```yaml
# k8s/api-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: school-saas
spec:
  selector:
    app: api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: school-saas-ingress
  namespace: school-saas
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.edu-saas.com
    secretName: api-tls-secret
  rules:
  - host: api.edu-saas.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 80
```

### HPA (自動擴展)

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: school-saas
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## 3. CI/CD 流程

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Run linter
        run: |
          cd backend
          npm run lint

      - name: Run tests
        run: |
          cd backend
          npm test

      - name: Run coverage
        run: |
          cd backend
          npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push API image
        uses: docker/build-push-action@v4
        with:
          context: ./backend
          push: true
          tags: |
            school-saas/api:latest
            school-saas/api:${{ github.sha }}

      - name: Build and push Frontend image
        uses: docker/build-push-action@v4
        with:
          context: ./frontend
          push: true
          tags: |
            school-saas/frontend:latest
            school-saas/frontend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name school-saas-cluster --region us-west-2

      - name: Deploy to Kubernetes
        run: |
          kubectl apply -f k8s/
          kubectl set image deployment/api api=school-saas/api:${{ github.sha }} -n school-saas
          kubectl rollout status deployment/api -n school-saas

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 4. 資料庫遷移

### Prisma Migration

```bash
# 建立新遷移
npx prisma migrate dev --name add_attendance_table

# 部署到生產環境
npx prisma migrate deploy

# 重置資料庫（開發用）
npx prisma migrate reset
```

### 遷移腳本

```typescript
// scripts/migrate.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting migration...');

  try {
    // 1. 備份資料庫
    await backupDatabase();

    // 2. 執行 migration
    await executeMigrations();

    // 3. 驗證資料完整性
    await validateData();

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    // 回滾
    await rollback();
    process.exit(1);
  }
}

migrate();
```

---

## 5. 監控與日誌

### Prometheus Metrics

```typescript
// monitoring/metrics.ts
import { register, Counter, Histogram } from 'prom-client';

// HTTP 請求計數
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// 請求延遲
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 健康檢查

```typescript
// routes/health.ts
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK'
  };

  try {
    // 檢查資料庫連線
    await prisma.$queryRaw`SELECT 1`;

    // 檢查 Redis
    await redis.ping();

    res.status(200).json(health);
  } catch (error) {
    health.status = 'ERROR';
    res.status(503).json(health);
  }
});

app.get('/ready', async (req, res) => {
  // 檢查服務是否準備好接收流量
  const ready = {
    database: false,
    cache: false,
    storage: false
  };

  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => ready.database = true),
      redis.ping().then(() => ready.cache = true),
      checkS3Connection().then(() => ready.storage = true)
    ]);

    if (Object.values(ready).every(v => v)) {
      res.status(200).json(ready);
    } else {
      res.status(503).json(ready);
    }
  } catch (error) {
    res.status(503).json(ready);
  }
});
```

---

## 6. 備份策略

### 資料庫備份

```bash
#!/bin/bash
# scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="school_saas"

# 建立備份目錄
mkdir -p $BACKUP_DIR

# 全量備份
pg_dump -h localhost -U postgres -d $DB_NAME \
  -F c -f $BACKUP_DIR/backup_${DATE}.dump

# 上傳到 S3
aws s3 cp $BACKUP_DIR/backup_${DATE}.dump \
  s3://school-saas-backups/postgres/

# 保留最近 30 天的備份
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

echo "Backup completed: backup_${DATE}.dump"
```

### Cron 排程

```bash
# crontab -e

# 每天凌晨 2 點全量備份
0 2 * * * /scripts/backup-db.sh

# 每小時增量備份 WAL
0 * * * * /scripts/backup-wal.sh
```

---

## 7. 環境變數管理

### .env.example

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/school_saas
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-refresh-token-secret
REFRESH_TOKEN_EXPIRES_IN=7d

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=school-saas-files
AWS_S3_REGION=us-west-2

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

## 8. 部署清單

### 上線前檢查

- [ ] 所有測試通過
- [ ] 資料庫遷移腳本準備完成
- [ ] 環境變數設定完成
- [ ] SSL 憑證配置完成
- [ ] 備份與還原流程測試
- [ ] 監控與告警設定完成
- [ ] 負載測試通過
- [ ] 安全掃描無高風險問題
- [ ] 文檔更新完成
- [ ] 回滾計畫準備完成

### 部署步驟

1. 通知團隊即將部署
2. 建立資料庫備份
3. 執行資料庫遷移
4. 部署新版本容器
5. 執行煙霧測試
6. 監控錯誤率與效能
7. 如有問題立即回滾
8. 部署完成通知
