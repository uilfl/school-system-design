# 開發指南

## 開發環境設置

### 前置需求

- **Node.js**: v18+ (推薦 v18.17.0)
- **npm**: v9+
- **Docker**: v20+
- **Docker Compose**: v2+
- **Git**: v2.30+
- **PostgreSQL**: v15+ (可使用 Docker)
- **Redis**: v7+ (可使用 Docker)

### 快速開始

```bash
# 1. Clone 專案
git clone https://github.com/your-org/school-saas.git
cd school-saas

# 2. 安裝後端依賴
cd backend
npm install

# 3. 複製環境變數
cp .env.example .env

# 4. 啟動資料庫（使用 Docker）
docker-compose up -d postgres redis minio

# 5. 執行資料庫遷移
npx prisma migrate dev

# 6. 產生 Prisma Client
npx prisma generate

# 7. 載入種子資料
npm run seed

# 8. 啟動開發伺服器
npm run dev

# 9. 前端設置（另開終端）
cd ../frontend
npm install
npm start
```

---

## 專案結構

```
school-saas/
├── backend/
│   ├── src/
│   │   ├── modules/           # 功能模組
│   │   │   ├── platform/      # 平台層
│   │   │   │   ├── auth/
│   │   │   │   ├── tenant/
│   │   │   │   ├── user/
│   │   │   │   └── role/
│   │   │   ├── sis/           # 學籍管理
│   │   │   ├── course/        # 課程管理
│   │   │   ├── attendance/    # 出缺勤
│   │   │   └── grade/         # 成績
│   │   ├── common/            # 共用程式碼
│   │   │   ├── middleware/
│   │   │   ├── decorators/
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   └── utils/
│   │   ├── config/            # 設定
│   │   ├── database/          # 資料庫
│   │   │   ├── migrations/
│   │   │   ├── seeds/
│   │   │   └── schema.prisma
│   │   ├── events/            # 事件系統
│   │   └── server.ts          # 入口
│   ├── tests/                 # 測試
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/        # 元件
│   │   │   ├── common/
│   │   │   ├── layout/
│   │   │   └── features/
│   │   ├── pages/             # 頁面
│   │   ├── services/          # API 服務
│   │   ├── store/             # 狀態管理
│   │   ├── hooks/             # 自訂 Hooks
│   │   ├── utils/
│   │   ├── types/
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                      # 文檔
├── k8s/                       # Kubernetes 配置
├── scripts/                   # 腳本
├── docker-compose.yml
└── README.md
```

---

## 程式碼規範

### TypeScript 風格

```typescript
// ✅ 良好實踐

// 1. 明確的型別定義
interface Student {
  id: string;
  name: string;
  email: string;
  grade: number;
}

// 2. 使用 async/await
async function getStudent(id: string): Promise<Student> {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) {
    throw new NotFoundException('Student not found');
  }
  return student;
}

// 3. 錯誤處理
try {
  await someOperation();
} catch (error) {
  logger.error('Operation failed', { error, context: 'getStudent' });
  throw new InternalServerError('Failed to fetch student');
}

// 4. 使用常數
const MAX_STUDENTS_PER_CLASS = 40;
const DEFAULT_PAGE_SIZE = 20;

// 5. 命名規範
class StudentService { }       // PascalCase for classes
function getUserById() { }      // camelCase for functions
const API_BASE_URL = '';        // UPPER_SNAKE_CASE for constants
```

### ESLint 配置

```json
// .eslintrc.json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/explicit-function-return-type": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

### Prettier 配置

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

---

## Git 工作流程

### 分支策略

```
main (生產環境)
  ↑
staging (預發環境)
  ↑
develop (開發環境)
  ↑
feature/xxx (功能分支)
bugfix/xxx (錯誤修復)
hotfix/xxx (緊急修復)
```

### Commit 規範

使用 Conventional Commits：

```bash
# 格式
<type>(<scope>): <subject>

# 類型
feat:     新功能
fix:      錯誤修復
docs:     文檔更新
style:    程式碼格式（不影響功能）
refactor: 重構
test:     測試
chore:    建置工具或輔助工具

# 範例
feat(sis): add student import from Excel
fix(auth): resolve JWT expiration issue
docs(api): update API documentation
refactor(grade): simplify grading calculation logic
test(course): add unit tests for enrollment service
```

### Pull Request 流程

1. **建立分支**
   ```bash
   git checkout -b feature/student-import
   ```

2. **開發與提交**
   ```bash
   git add .
   git commit -m "feat(sis): add student import functionality"
   ```

3. **推送並建立 PR**
   ```bash
   git push origin feature/student-import
   ```

4. **Code Review 檢查項目**
   - [ ] 程式碼符合規範
   - [ ] 測試覆蓋率 > 80%
   - [ ] 無安全漏洞
   - [ ] 文檔已更新
   - [ ] CI 測試通過

5. **合併**
   ```bash
   # Squash merge to keep history clean
   git merge --squash feature/student-import
   ```

---

## 測試策略

### 測試金字塔

```
        ┌─────────┐
        │ E2E (5%)│      少量，測試關鍵流程
        └─────────┘
      ┌─────────────┐
      │Integration  │    中等，測試模組間互動
      │   (15%)     │
      └─────────────┘
  ┌───────────────────┐
  │   Unit Tests      │  大量，測試單一函數/類別
  │     (80%)         │
  └───────────────────┘
```

### 單元測試

```typescript
// tests/unit/services/student.service.test.ts
import { StudentService } from '@/modules/sis/student.service';
import { PrismaClient } from '@prisma/client';

describe('StudentService', () => {
  let service: StudentService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    service = new StudentService(prisma);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('createStudent', () => {
    it('should create a student with valid data', async () => {
      const studentData = {
        tenant_id: 'test-tenant',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        grade: 10
      };

      const student = await service.create(studentData);

      expect(student).toBeDefined();
      expect(student.first_name).toBe('John');
      expect(student.student_number).toMatch(/^\d{7}$/);
    });

    it('should throw error for duplicate email', async () => {
      const studentData = {
        tenant_id: 'test-tenant',
        first_name: 'John',
        last_name: 'Doe',
        email: 'existing@example.com',
        grade: 10
      };

      await expect(service.create(studentData)).rejects.toThrow(
        'Email already exists'
      );
    });
  });
});
```

### 整合測試

```typescript
// tests/integration/api/students.test.ts
import request from 'supertest';
import app from '@/server';

describe('Student API', () => {
  let authToken: string;

  beforeAll(async () => {
    // 登入取得 token
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123'
      });

    authToken = response.body.data.access_token;
  });

  describe('POST /api/v1/students', () => {
    it('should create a new student', async () => {
      const response = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          grade: 10
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Jane');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/api/v1/students')
        .send({ first_name: 'Jane' });

      expect(response.status).toBe(401);
    });
  });
});
```

### E2E 測試 (Playwright)

```typescript
// tests/e2e/student-management.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Student Management', () => {
  test.beforeEach(async ({ page }) => {
    // 登入
    await page.goto('http://localhost:3001/login');
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should create a new student', async ({ page }) => {
    // 導航到學生管理頁面
    await page.click('a[href="/students"]');
    await page.click('button:has-text("新增學生")');

    // 填寫表單
    await page.fill('input[name="first_name"]', 'Test');
    await page.fill('input[name="last_name"]', 'Student');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.selectOption('select[name="grade"]', '10');

    // 提交
    await page.click('button[type="submit"]');

    // 驗證
    await expect(page.locator('text=學生建立成功')).toBeVisible();
  });
});
```

### 測試覆蓋率

```bash
# 執行測試並產生覆蓋率報告
npm run test:coverage

# 查看報告
open coverage/lcov-report/index.html
```

目標覆蓋率：
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

---

## 資料庫管理

### Prisma 工作流程

```bash
# 1. 修改 schema
vim prisma/schema.prisma

# 2. 建立 migration
npx prisma migrate dev --name add_attendance_table

# 3. 產生 Prisma Client
npx prisma generate

# 4. 查看資料庫
npx prisma studio
```

### 種子資料

```typescript
// prisma/seeds/index.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 建立測試租戶
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test School',
      subdomain: 'test-school',
      status: 'active'
    }
  });

  // 建立管理員
  const admin = await prisma.user.create({
    data: {
      email: 'admin@test.com',
      password_hash: await bcrypt.hash('password123', 12),
      first_name: 'Admin',
      last_name: 'User'
    }
  });

  // 指派角色
  await prisma.userRole.create({
    data: {
      user_id: admin.id,
      role_id: 'tenant_admin',
      tenant_id: tenant.id
    }
  });

  console.log('Seed completed');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
```

---

## API 開發

### Controller 模式

```typescript
// src/modules/sis/student.controller.ts
import { Router } from 'express';
import { StudentService } from './student.service';
import { authenticate, authorize } from '@/common/middleware';
import { validateRequest } from '@/common/middleware/validation';
import { CreateStudentDto } from './dto/create-student.dto';

export class StudentController {
  public router = Router();
  private service = new StudentService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/', authenticate, this.getStudents);
    this.router.post(
      '/',
      authenticate,
      authorize('student.write'),
      validateRequest(CreateStudentDto),
      this.createStudent
    );
    this.router.get('/:id', authenticate, this.getStudent);
    this.router.patch('/:id', authenticate, authorize('student.write'), this.updateStudent);
    this.router.delete('/:id', authenticate, authorize('student.delete'), this.deleteStudent);
  }

  private getStudents = async (req, res, next) => {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;
      const result = await this.service.findAll(req.tenantId, { page, limit, filters });
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  };

  private createStudent = async (req, res, next) => {
    try {
      const student = await this.service.create(req.tenantId, req.body);
      res.status(201).json({ success: true, data: student });
    } catch (error) {
      next(error);
    }
  };

  // ... 其他方法
}
```

---

## 除錯技巧

### 使用 VS Code Debugger

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 日誌最佳實踐

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'school-saas-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// 開發環境加入 console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// 使用
logger.info('Student created', { studentId, tenantId });
logger.error('Failed to create student', { error, studentData });
```

---

## 常見問題

### Q: 如何重置本地資料庫？

```bash
npx prisma migrate reset
npm run seed
```

### Q: 如何清除 Redis 快取？

```bash
docker-compose exec redis redis-cli FLUSHALL
```

### Q: 如何產生 API 文檔？

```bash
npm run docs:generate
```

---

## 資源連結

- [TypeScript 官方文檔](https://www.typescriptlang.org/docs/)
- [Prisma 文檔](https://www.prisma.io/docs)
- [Express.js 指南](https://expressjs.com/)
- [React 官方文檔](https://react.dev/)
- [PostgreSQL 文檔](https://www.postgresql.org/docs/)
