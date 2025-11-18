# API 設計規範

## API 設計原則

### RESTful 設計準則

1. **資源導向** - URL 代表資源，使用名詞而非動詞
2. **HTTP 方法語義** - GET（讀取）、POST（創建）、PUT/PATCH（更新）、DELETE（刪除）
3. **狀態碼規範** - 正確使用 HTTP 狀態碼
4. **版本控制** - API 版本化管理
5. **HATEOAS** - 返回相關資源連結（選配）

## API 版本控制

### URL 路徑版本

```
https://api.edu-saas.com/v1/students
https://api.edu-saas.com/v2/students
```

### Header 版本（備選）

```
GET /students
Accept: application/vnd.edu-saas.v1+json
```

## 通用 API 結構

### 請求格式

#### Headers
```http
Authorization: Bearer <JWT_TOKEN>
X-Tenant-ID: school-uuid-here
Content-Type: application/json
Accept-Language: zh-TW
```

#### 分頁參數
```
GET /api/v1/students?page=1&limit=20&sort=created_at:desc
```

### 回應格式

#### 成功回應
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "John Doe",
    ...
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req-12345"
  }
}
```

#### 分頁回應
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### 錯誤回應
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email format is invalid"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req-12345"
  }
}
```

## 錯誤碼規範

| HTTP 狀態碼 | 錯誤代碼 | 說明 |
|------------|---------|------|
| 400 | VALIDATION_ERROR | 請求參數驗證失敗 |
| 401 | UNAUTHORIZED | 未認證或 Token 無效 |
| 403 | FORBIDDEN | 無權限存取資源 |
| 404 | NOT_FOUND | 資源不存在 |
| 409 | CONFLICT | 資源衝突（如重複建立） |
| 422 | UNPROCESSABLE_ENTITY | 業務邏輯錯誤 |
| 429 | RATE_LIMIT_EXCEEDED | 請求頻率超限 |
| 500 | INTERNAL_ERROR | 伺服器內部錯誤 |
| 503 | SERVICE_UNAVAILABLE | 服務暫時不可用 |

## 核心 API 端點

### 1. 認證與授權

#### 用戶登入
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "tenant_id": "school-uuid" // 可選，多租戶選擇
}

Response 200:
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "refresh-token-here",
    "expires_in": 3600,
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "roles": ["teacher", "homeroom_teacher"]
    }
  }
}
```

#### Token 刷新
```http
POST /api/v1/auth/refresh
{
  "refresh_token": "refresh-token-here"
}
```

#### 登出
```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

### 2. 學生管理 API

#### 取得學生列表
```http
GET /api/v1/students?grade=10&class_id=uuid&status=active&page=1&limit=20

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "student-uuid",
      "student_number": "2024001",
      "first_name": "John",
      "last_name": "Doe",
      "chinese_name": "王小明",
      "email": "john@example.com",
      "grade": {
        "id": "grade-uuid",
        "name": "高一",
        "grade_level": 10
      },
      "class": {
        "id": "class-uuid",
        "name": "高一甲班"
      },
      "status": "active",
      "enrollment_date": "2024-09-01",
      "photo_url": "https://cdn.example.com/photos/student.jpg"
    }
  ],
  "pagination": {...}
}
```

#### 取得單一學生詳細資訊
```http
GET /api/v1/students/{student_id}

Response 200:
{
  "success": true,
  "data": {
    "id": "student-uuid",
    "student_number": "2024001",
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "2008-05-15",
    "gender": "male",
    "email": "john@example.com",
    "phone": "+886912345678",
    "address": "台北市...",
    "emergency_contact": {
      "name": "Jane Doe",
      "phone": "+886987654321",
      "relation": "mother"
    },
    "parents": [
      {
        "id": "parent-uuid",
        "name": "Jane Doe",
        "relationship": "mother",
        "phone": "+886987654321",
        "email": "jane@example.com"
      }
    ],
    "enrollment_date": "2024-09-01",
    "status": "active"
  }
}
```

#### 創建學生
```http
POST /api/v1/students
Content-Type: application/json

{
  "student_number": "2024001",
  "first_name": "John",
  "last_name": "Doe",
  "chinese_name": "王小明",
  "gender": "male",
  "date_of_birth": "2008-05-15",
  "email": "john@example.com",
  "phone": "+886912345678",
  "grade_id": "grade-uuid",
  "class_id": "class-uuid",
  "enrollment_date": "2024-09-01"
}

Response 201:
{
  "success": true,
  "data": {
    "id": "new-student-uuid",
    ...
  }
}
```

#### 更新學生資訊
```http
PATCH /api/v1/students/{student_id}
{
  "email": "newemail@example.com",
  "phone": "+886999888777"
}

Response 200:
{
  "success": true,
  "data": { updated student object }
}
```

#### 刪除學生（軟刪除）
```http
DELETE /api/v1/students/{student_id}

Response 204: No Content
```

### 3. 課程與課表 API

#### 取得課程列表
```http
GET /api/v1/courses?department=數學&type=required&semester_id=uuid

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "course-uuid",
      "course_code": "MATH101",
      "course_name": "高等微積分",
      "credits": 3.0,
      "course_type": "required",
      "department": "數學系",
      "description": "課程描述..."
    }
  ]
}
```

#### 取得課表
```http
GET /api/v1/schedules?class_id=uuid&week=2024-W01

// 或學生個人課表
GET /api/v1/students/{student_id}/schedules?semester_id=uuid

Response 200:
{
  "success": true,
  "data": {
    "semester": {
      "id": "semester-uuid",
      "name": "第一學期"
    },
    "schedules": [
      {
        "day_of_week": 1, // Monday
        "periods": [
          {
            "period_number": 1,
            "start_time": "08:00",
            "end_time": "08:50",
            "course": {
              "id": "course-uuid",
              "course_name": "數學",
              "course_code": "MATH101"
            },
            "teacher": {
              "id": "teacher-uuid",
              "name": "李老師"
            },
            "classroom": "A101"
          }
        ]
      }
    ]
  }
}
```

### 4. 出缺勤 API

#### 提交點名記錄
```http
POST /api/v1/attendance
{
  "course_offering_id": "offering-uuid",
  "attendance_date": "2024-01-15",
  "period_number": 1,
  "records": [
    {
      "student_id": "student-uuid-1",
      "status": "present"
    },
    {
      "student_id": "student-uuid-2",
      "status": "absent",
      "notes": "病假"
    }
  ]
}

Response 201:
{
  "success": true,
  "data": {
    "created_count": 2,
    "records": [...]
  }
}
```

#### 查詢學生出缺勤記錄
```http
GET /api/v1/students/{student_id}/attendance?start_date=2024-01-01&end_date=2024-01-31

Response 200:
{
  "success": true,
  "data": {
    "student": {...},
    "period": {
      "start_date": "2024-01-01",
      "end_date": "2024-01-31"
    },
    "summary": {
      "present": 45,
      "absent": 2,
      "late": 1,
      "excused": 1,
      "total_days": 20
    },
    "records": [
      {
        "date": "2024-01-15",
        "period_number": 1,
        "course": "數學",
        "status": "present"
      }
    ]
  }
}
```

### 5. 成績 API

#### 輸入成績
```http
POST /api/v1/grades
{
  "course_offering_id": "offering-uuid",
  "assessment_type": "midterm",
  "assessment_name": "期中考",
  "max_score": 100,
  "grades": [
    {
      "student_id": "student-uuid-1",
      "score": 85
    },
    {
      "student_id": "student-uuid-2",
      "score": 92
    }
  ]
}

Response 201:
{
  "success": true,
  "data": {
    "created_count": 2
  }
}
```

#### 查詢學生成績
```http
GET /api/v1/students/{student_id}/grades?semester_id=uuid

Response 200:
{
  "success": true,
  "data": {
    "student": {...},
    "semester": {...},
    "courses": [
      {
        "course": {
          "course_name": "數學",
          "credits": 3.0
        },
        "assessments": [
          {
            "assessment_type": "midterm",
            "score": 85,
            "max_score": 100,
            "percentage": 85.0
          },
          {
            "assessment_type": "final",
            "score": 90,
            "max_score": 100,
            "percentage": 90.0
          }
        ],
        "final_score": 87.5,
        "grade_letter": "A",
        "passed": true
      }
    ],
    "gpa": 3.8
  }
}
```

## Webhook API

### 註冊 Webhook
```http
POST /api/v1/webhooks
{
  "url": "https://external-system.com/webhook",
  "events": ["student.created", "grade.published", "attendance.marked"],
  "secret": "webhook-secret-for-signature"
}
```

### Webhook Payload 範例
```json
{
  "event": "student.created",
  "tenant_id": "school-uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "student": {
      "id": "student-uuid",
      "student_number": "2024001",
      "name": "John Doe"
    }
  },
  "signature": "sha256-signature-here"
}
```

## Rate Limiting

### 限流策略

| 用戶類型 | 限制 |
|---------|------|
| 免費用戶 | 100 requests/hour |
| 付費用戶 | 1000 requests/hour |
| 企業用戶 | 10000 requests/hour |

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1609459200
```

## API 文檔生成

使用 **OpenAPI (Swagger) 3.0** 規範：

```yaml
openapi: 3.0.0
info:
  title: School SaaS API
  version: 1.0.0
  description: 學校管理系統 API

servers:
  - url: https://api.edu-saas.com/v1
    description: Production server
  - url: https://sandbox-api.edu-saas.com/v1
    description: Sandbox server

paths:
  /students:
    get:
      summary: Get list of students
      tags: [Students]
      parameters:
        - name: page
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StudentList'
```

## 測試 API

### Postman Collection

提供完整的 Postman Collection：
- 環境變數設定（dev, staging, production）
- 預設請求範例
- 自動化測試腳本

### cURL 範例

```bash
# 登入
curl -X POST https://api.edu-saas.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@school.com",
    "password": "password123"
  }'

# 取得學生列表（需要 token）
curl -X GET "https://api.edu-saas.com/v1/students?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-ID: school-uuid"
```

## 效能優化建議

1. **欄位選擇**
   ```
   GET /api/v1/students?fields=id,name,email
   ```

2. **資料預載**
   ```
   GET /api/v1/students?include=class,grade,parents
   ```

3. **ETags 快取**
   ```http
   ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
   If-None-Match: "33a64df551425fcc55e4d42a148795d9f25f89d4"
   ```

4. **壓縮**
   ```http
   Accept-Encoding: gzip, deflate, br
   ```
