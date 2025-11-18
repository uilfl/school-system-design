# 系統架構設計

## 整體架構圖

```
┌────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Web App │  │Mobile App│  │  Admin   │  │3rd Party │       │
│  │          │  │   iOS/   │  │  Portal  │  │   API    │       │
│  │          │  │  Android │  │          │  │  Client  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │   API Gateway        │
                    │  • Rate Limiting     │
                    │  • Authentication    │
                    │  • Request Routing   │
                    └─────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼────────┐  ┌────────▼───────┐
│ Platform Layer │  │  Core Modules    │  │Extension Layer │
├────────────────┤  ├──────────────────┤  ├────────────────┤
│• Multi-tenant  │  │• SIS             │  │• Webhook       │
│• IAM/RBAC      │  │• Course/Schedule │  │• Plugin API    │
│• Config Center │  │• Grading         │  │• Custom Forms  │
│• Notification  │  │• Attendance      │  │• Workflow      │
│• Audit Log     │  │• Communication   │  │• Integration   │
└────────┬───────┘  └─────────┬────────┘  └────────┬───────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │   Data Access Layer  │
                    │  • Repository Pattern│
                    │  • Data Validation   │
                    │  • Caching Strategy  │
                    └─────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼────────┐  ┌────────▼───────┐
│  PostgreSQL    │  │     Redis        │  │   File Store   │
│  (Primary DB)  │  │    (Cache)       │  │   (S3/Minio)   │
└────────────────┘  └──────────────────┘  └────────────────┘
```

## 微服務架構設計

雖然 MVP 階段採用單體架構（Monolithic），但設計時考慮未來微服務化：

### Service 劃分

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway                          │
│              (Authentication & Routing)                 │
└─────────────────────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
┌───▼────────┐  ┌────────▼──────┐  ┌──────────▼─────┐
│  Platform  │  │     Core      │  │   Extension    │
│  Services  │  │   Services    │  │    Services    │
├────────────┤  ├───────────────┤  ├────────────────┤
│• Auth      │  │• Student      │  │• Workflow      │
│• Tenant    │  │• Course       │  │• Notification  │
│• User      │  │• Grade        │  │• Report        │
│• Role      │  │• Attendance   │  │• Integration   │
└────────────┘  └───────────────┘  └────────────────┘
```

## 資料隔離策略（多租戶）

### 方案選擇：Row-Level Isolation

每個表加入 `tenant_id` 欄位，透過應用層確保資料隔離。

**優點**：
- 資源利用率高
- 維護成本低
- 容易擴展

**實作機制**：
```sql
-- 每個查詢自動加入 tenant filter
SELECT * FROM students
WHERE tenant_id = :current_tenant_id
  AND grade = 10;

-- PostgreSQL Row-Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON students
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### 替代方案比較

| 方案 | 隔離程度 | 成本 | 擴展性 | 適用場景 |
|------|---------|------|--------|---------|
| **Shared Database, Shared Schema** | 低 | 低 | 高 | MVP, 中小型 SaaS |
| Database per Tenant | 高 | 高 | 中 | 大型企業客戶 |
| Schema per Tenant | 中 | 中 | 中 | 混合方案 |

## 服務通訊模式

### 同步通訊
- **REST API**: 主要對外接口
- **GraphQL**: 複雜查詢場景（選配）

### 非同步通訊
- **Message Queue**: RabbitMQ / Redis Pub/Sub
- **Event Bus**: 模組間事件傳遞

```javascript
// 事件驅動範例
EventBus.publish('student.enrolled', {
  tenantId: 'school-001',
  studentId: 'stu-12345',
  courseId: 'course-67890',
  timestamp: Date.now()
});

// 其他模組訂閱
EventBus.subscribe('student.enrolled', async (event) => {
  // 自動建立學生課表
  await createStudentSchedule(event);
  // 發送歡迎通知
  await sendWelcomeNotification(event);
});
```

## 快取策略

### 多層快取架構

```
┌─────────────────┐
│  Browser Cache  │  (Static Assets)
└────────┬────────┘
         │
┌────────▼────────┐
│   CDN Cache     │  (Public Resources)
└────────┬────────┘
         │
┌────────▼────────┐
│ Application     │
│ Cache (Redis)   │  (Hot Data: User Sessions, Course List)
└────────┬────────┘
         │
┌────────▼────────┐
│ Database        │  (Source of Truth)
│ (PostgreSQL)    │
└─────────────────┘
```

### 快取策略

| 資料類型 | 策略 | TTL |
|---------|------|-----|
| 用戶 Session | Write-through | 30 min |
| 課程列表 | Cache-aside | 1 hour |
| 學生基本資料 | Cache-aside | 5 min |
| 系統設定 | Write-through | 24 hours |

## 可擴展性設計

### 水平擴展

```
        ┌──────────────┐
        │ Load Balancer│
        └───────┬──────┘
                │
    ┌───────────┼───────────┐
    │           │           │
┌───▼───┐   ┌──▼────┐  ┌───▼───┐
│ API   │   │ API   │  │ API   │
│ Node 1│   │ Node 2│  │ Node 3│
└───┬───┘   └───┬───┘  └───┬───┘
    │           │          │
    └───────────┼──────────┘
                │
        ┌───────▼──────┐
        │   Database   │
        │   (Master)   │
        └───────┬──────┘
                │
    ┌───────────┼───────────┐
    │           │           │
┌───▼───┐   ┌──▼────┐  ┌───▼───┐
│ Read  │   │ Read  │  │ Read  │
│Replica│   │Replica│  │Replica│
└───────┘   └───────┘  └───────┘
```

### 效能目標

| 指標 | 目標 |
|-----|------|
| API 回應時間 (P95) | < 200ms |
| API 回應時間 (P99) | < 500ms |
| 系統可用性 | 99.9% |
| 並發用戶數 | 10,000+ |
| 資料庫查詢時間 | < 100ms |

## 安全架構

### 多層防護

```
┌──────────────────────────────────────┐
│  1. Network Layer                    │
│     • Firewall • DDoS Protection     │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  2. Application Layer                │
│     • WAF • Rate Limiting • CORS     │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  3. Authentication Layer             │
│     • JWT • OAuth 2.0 • MFA          │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  4. Authorization Layer              │
│     • RBAC • Resource-level ACL      │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  5. Data Layer                       │
│     • Encryption at Rest & Transit   │
│     • Row-Level Security             │
└──────────────────────────────────────┘
```

## 監控與可觀測性

### 三大支柱

1. **Metrics** (Prometheus)
   - API 請求數、回應時間
   - 資料庫連線數、查詢效能
   - 系統資源使用率

2. **Logs** (ELK Stack)
   - 應用日誌
   - 存取日誌
   - 錯誤日誌

3. **Traces** (Jaeger / OpenTelemetry)
   - 分散式追蹤
   - 請求鏈路分析

## 災難恢復

### 備份策略
- **資料庫**: 每日全量備份 + 持續增量備份
- **檔案儲存**: 異地複製（跨區域）
- **RPO** (Recovery Point Objective): < 1 hour
- **RTO** (Recovery Time Objective): < 4 hours

### 高可用性
- 主從複製 (Master-Slave Replication)
- 自動故障轉移 (Automatic Failover)
- 健康檢查與自動重啟
