# School SaaS System - 學校管理 SaaS 平台

一個可延伸、模組化的學校管理 SaaS 平台，支援從小學到大學的各類教育機構。

## 🌟 系統特色

- **多租戶架構** - 一套系統服務多所學校，資料完全隔離
- **模組化設計** - 學校可依需求啟用/停用功能模組
- **權限精細化** - 基於角色的存取控制（RBAC）
- **可延伸性** - 開放 API 與 Webhook 支援第三方整合
- **跨平台支援** - Web、Mobile App、API 多管道存取

## 📚 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                       擴充 / 整合層                          │
│  • Open API & Webhook  • Plugin System  • Custom Workflow   │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                      學校營運核心模組                         │
│  • 學籍管理(SIS)    • 課程&課表    • 成績評量               │
│  • 出缺勤管理       • 家校溝通     • 財務管理               │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                        共用平台層                            │
│  • 多租戶架構  • IAM/RBAC  • 設定中心  • 通知中心  • 稽核   │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 快速開始

### 前置需求

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+ (可使用 Docker)
- Redis 7+ (可使用 Docker)

### 安裝步驟

1. **Clone 專案**
   ```bash
   git clone https://github.com/your-org/school-system-design.git
   cd school-system-design
   ```

2. **啟動開發環境（使用 Docker）**
   ```bash
   # 啟動所有服務（PostgreSQL, Redis, Minio, API）
   docker-compose up -d

   # 查看日誌
   docker-compose logs -f api
   ```

3. **本地開發設置**
   ```bash
   # 進入後端目錄
   cd backend

   # 安裝依賴
   npm install

   # 複製環境變數
   cp .env.example .env

   # 執行資料庫遷移
   npx prisma migrate dev

   # 產生 Prisma Client
   npx prisma generate

   # 啟動開發伺服器
   npm run dev
   ```

4. **存取應用程式**
   - API: http://localhost:3000
   - API 文檔: http://localhost:3000/api/v1/docs (即將推出)
   - Minio 控制台: http://localhost:9001 (minioadmin/minioadmin)
   - Prisma Studio: `npx prisma studio`

## 📖 文檔

完整文檔位於 `docs/` 目錄：

- [系統概述](./docs/00-overview.md)
- [架構設計](./docs/01-architecture.md)
- [資料庫設計](./docs/02-database-design.md)
- [API 設計](./docs/03-api-design.md)
- [平台層設計](./docs/04-platform-layer.md)
- [核心模組設計](./docs/05-core-modules.md)
- [安全與權限](./docs/06-security.md)
- [部署指南](./docs/07-deployment.md)
- [開發指南](./docs/08-development-guide.md)

## 🛠 技術棧

### 後端
- **語言**: Node.js + TypeScript
- **框架**: Express.js
- **資料庫**: PostgreSQL 15
- **快取**: Redis 7
- **ORM**: Prisma
- **認證**: JWT + OAuth 2.0

### 前端（即將推出）
- **框架**: React + TypeScript
- **狀態管理**: Redux Toolkit / Zustand
- **UI 框架**: Material-UI / Ant Design

### 基礎設施
- **容器化**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **儲存**: MinIO / AWS S3

## 📦 專案結構

```
school-system-design/
├── backend/                    # 後端 API
│   ├── src/
│   │   ├── modules/            # 功能模組
│   │   │   ├── platform/       # 平台層（auth, tenant, user, role）
│   │   │   ├── sis/            # 學籍管理
│   │   │   ├── course/         # 課程管理
│   │   │   ├── attendance/     # 出缺勤
│   │   │   └── grade/          # 成績
│   │   ├── common/             # 共用程式碼
│   │   ├── config/             # 設定
│   │   ├── database/           # 資料庫
│   │   └── server.ts           # 入口
│   ├── tests/                  # 測試
│   ├── prisma/                 # Prisma schema & migrations
│   └── Dockerfile
├── frontend/                   # 前端應用（即將推出）
├── docs/                       # 文檔
├── k8s/                        # Kubernetes 配置
├── scripts/                    # 腳本
├── docker-compose.yml
└── README.md
```

## 🧪 測試

```bash
# 進入後端目錄
cd backend

# 執行單元測試
npm test

# 執行測試並產生覆蓋率報告
npm run test:coverage

# 執行 linter
npm run lint

# 修正 linter 問題
npm run lint:fix
```

## 🔐 安全性

- JWT 認證與授權
- 密碼 bcrypt 加密
- SQL Injection 防護（參數化查詢）
- XSS 防護（輸入清理）
- CSRF 防護
- Rate Limiting
- 資料加密（傳輸與儲存）
- Row-Level Security (PostgreSQL)

## 🌐 API 範例

### 登入
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

### 取得學生列表
```bash
curl -X GET "http://localhost:3000/api/v1/students?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-ID: YOUR_TENANT_ID"
```

### 建立學生
```bash
curl -X POST http://localhost:3000/api/v1/students \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-ID: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "enrollmentDate": "2024-09-01"
  }'
```

## 🚢 部署

### Docker Compose（開發/測試）
```bash
docker-compose up -d
```

### Kubernetes（生產環境）
```bash
# 套用 Kubernetes 配置
kubectl apply -f k8s/

# 檢查部署狀態
kubectl get pods -n school-saas
kubectl get services -n school-saas
```

詳細部署指南請參考 [部署文檔](./docs/07-deployment.md)。

## 📋 待辦事項

### Phase 1 - MVP (已完成)
- [x] 平台層基礎架構
  - [x] 多租戶架構
  - [x] JWT 認證系統
  - [x] RBAC 權限系統
- [x] 核心模組
  - [x] 學籍管理系統 (SIS)
  - [ ] 課程與課表管理（基礎版）
  - [ ] 出缺勤管理（基礎版）
- [x] 基礎設施
  - [x] Docker 開發環境
  - [x] CI/CD Pipeline
  - [x] 資料庫設計

### Phase 2 - 增強功能
- [ ] 完整的課程選課系統
- [ ] 成績評量系統
- [ ] 家校溝通模組
- [ ] 報表分析系統
- [ ] 前端管理介面

### Phase 3 - 進階功能
- [ ] 財務管理模組
- [ ] 自訂表單與工作流
- [ ] Webhook 整合
- [ ] Mobile App
- [ ] 多語言支援

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

1. Fork 專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](LICENSE) 文件

## 👥 團隊

本專案由開源社群維護，歡迎加入我們！

## 📞 聯絡方式

- 問題回報：[GitHub Issues](https://github.com/your-org/school-system-design/issues)
- 功能建議：[GitHub Discussions](https://github.com/your-org/school-system-design/discussions)

---

**Note**: This is an educational project aimed at helping students understand school management system design and implementation.
