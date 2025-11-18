# 平台層設計

## 平台層職責

平台層是整個系統的基礎設施，提供所有模組共用的核心能力：

1. **多租戶管理** - Tenant isolation & management
2. **身份認證** - Authentication (IAM)
3. **權限控制** - Authorization (RBAC)
4. **設定中心** - Configuration management
5. **通知系統** - Multi-channel notifications
6. **稽核日誌** - Audit logging
7. **檔案儲存** - File storage service

---

## 1. 多租戶架構 (Multi-tenancy)

### 租戶隔離策略

#### Row-Level Isolation（採用方案）

**實作方式**：
- 每個表加入 `tenant_id` 欄位
- 使用 PostgreSQL Row-Level Security (RLS)
- Middleware 自動注入租戶過濾條件

**程式碼範例**：

```typescript
// Middleware: 從 JWT 或 Header 提取 tenant_id
export const tenantContext = async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.user?.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' });
  }

  // 設定 PostgreSQL session variable
  await db.query(`SET app.current_tenant = '${tenantId}'`);

  req.tenantId = tenantId;
  next();
};

// Repository: 自動過濾 tenant
class StudentRepository {
  async findAll(tenantId: string) {
    return db.students.findMany({
      where: { tenant_id: tenantId, deleted_at: null }
    });
  }
}
```

**PostgreSQL RLS 設定**：

```sql
-- 啟用 Row-Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- 建立隔離策略
CREATE POLICY tenant_isolation_policy ON students
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- 允許系統管理員跨租戶查詢
CREATE POLICY admin_access_policy ON students
  USING (
    current_setting('app.user_role') = 'system_admin'
    OR tenant_id = current_setting('app.current_tenant')::uuid
  );
```

### 租戶管理功能

#### 租戶註冊流程

```typescript
interface TenantRegistration {
  name: string;
  subdomain: string; // unique: abc.edu-saas.com
  admin_email: string;
  admin_password: string;
  plan_type: 'basic' | 'premium' | 'enterprise';
  settings: {
    timezone: string;
    language: string;
    academic_year_start: string; // "09-01"
  };
}

async function createTenant(data: TenantRegistration) {
  // 1. 驗證 subdomain 唯一性
  const existing = await db.tenants.findOne({ subdomain: data.subdomain });
  if (existing) throw new Error('Subdomain already exists');

  // 2. 創建租戶
  const tenant = await db.tenants.create({
    name: data.name,
    subdomain: data.subdomain,
    settings: data.settings,
    plan_type: data.plan_type,
    status: 'active'
  });

  // 3. 創建管理員帳號
  const adminUser = await createUser({
    email: data.admin_email,
    password: hashPassword(data.admin_password),
    tenant_id: tenant.id
  });

  // 4. 指派系統管理員角色
  await assignRole(adminUser.id, 'tenant_admin', tenant.id);

  // 5. 初始化預設資料（年級、學期等）
  await initializeTenantDefaults(tenant.id);

  return tenant;
}
```

#### 租戶設定

```typescript
interface TenantSettings {
  general: {
    school_name: string;
    logo_url: string;
    timezone: string;
    language: string;
  };
  academic: {
    academic_year_start: string; // "YYYY-MM-DD"
    semester_count: number; // 2 or 3
    grading_system: 'percentage' | 'letter' | 'points';
  };
  notification: {
    email_enabled: boolean;
    sms_enabled: boolean;
    default_sender: string;
  };
  features: {
    attendance_enabled: boolean;
    grading_enabled: boolean;
    parent_portal_enabled: boolean;
  };
}
```

---

## 2. 身份認證 (IAM)

### JWT 認證架構

```typescript
interface JWTPayload {
  user_id: string;
  email: string;
  tenant_id: string;
  roles: string[];
  permissions: string[];
  iat: number; // issued at
  exp: number; // expiry
}

// 生成 Access Token (15 分鐘)
function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      user_id: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      roles: user.roles,
      permissions: user.permissions
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

// 生成 Refresh Token (7 天)
function generateRefreshToken(user: User): string {
  return jwt.sign(
    { user_id: user.id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
}
```

### 登入流程

```typescript
async function login(email: string, password: string, tenantId?: string) {
  // 1. 查找用戶
  const user = await db.users.findOne({ email });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  // 2. 驗證密碼
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  // 3. 多租戶選擇
  const tenants = await getUserTenants(user.id);
  if (tenantId && !tenants.find(t => t.id === tenantId)) {
    throw new ForbiddenError('Access denied to this tenant');
  }

  const selectedTenant = tenantId || tenants[0]?.id;

  // 4. 載入角色與權限
  const roles = await getUserRoles(user.id, selectedTenant);
  const permissions = await getRolePermissions(roles);

  // 5. 生成 tokens
  const accessToken = generateAccessToken({
    ...user,
    tenant_id: selectedTenant,
    roles,
    permissions
  });
  const refreshToken = generateRefreshToken(user);

  // 6. 記錄登入
  await db.users.update(user.id, { last_login_at: new Date() });

  return { accessToken, refreshToken, user, tenant: selectedTenant };
}
```

### OAuth 2.0 整合

支援第三方登入：
- Google Workspace
- Microsoft Azure AD
- LDAP (企業內部系統)

```typescript
// Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  // 1. 用 code 換取 Google token
  const googleUser = await getGoogleUserInfo(code);

  // 2. 查找或創建本地用戶
  let user = await db.users.findOne({ email: googleUser.email });
  if (!user) {
    user = await db.users.create({
      email: googleUser.email,
      first_name: googleUser.given_name,
      last_name: googleUser.family_name,
      avatar_url: googleUser.picture,
      email_verified_at: new Date()
    });
  }

  // 3. 生成 JWT
  const token = generateAccessToken(user);

  res.redirect(`/dashboard?token=${token}`);
});
```

---

## 3. 權限控制 (RBAC)

### 角色定義

#### 預設系統角色

```typescript
const DEFAULT_ROLES = {
  SYSTEM_ADMIN: {
    name: 'system_admin',
    display_name: '系統管理員',
    permissions: ['*'] // 所有權限
  },
  TENANT_ADMIN: {
    name: 'tenant_admin',
    display_name: '校務管理員',
    permissions: [
      'tenant.settings.write',
      'user.*.write',
      'student.*.write',
      'teacher.*.write',
      'course.*.write',
      'grade.*.write'
    ]
  },
  TEACHER: {
    name: 'teacher',
    display_name: '教師',
    permissions: [
      'student.read',
      'attendance.write', // 只能寫自己的課
      'grade.write',      // 只能寫自己的課
      'course.read'
    ]
  },
  STUDENT: {
    name: 'student',
    display_name: '學生',
    permissions: [
      'student.self.read',
      'grade.self.read',
      'attendance.self.read',
      'schedule.self.read'
    ]
  },
  PARENT: {
    name: 'parent',
    display_name: '家長',
    permissions: [
      'student.child.read',
      'grade.child.read',
      'attendance.child.read'
    ]
  }
};
```

### 權限檢查機制

```typescript
// Decorator: 檢查權限
function RequirePermission(permission: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args[0];
      const user = req.user;

      if (!hasPermission(user, permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`);
      }

      return originalMethod.apply(this, args);
    };
  };
}

// 使用範例
class StudentController {
  @RequirePermission('student.write')
  async createStudent(req, res) {
    // 只有有權限的用戶才能執行
    const student = await studentService.create(req.body);
    res.json(student);
  }
}

// 權限檢查函數
function hasPermission(user: User, permission: string): boolean {
  // 1. 超級管理員
  if (user.permissions.includes('*')) return true;

  // 2. 精確匹配
  if (user.permissions.includes(permission)) return true;

  // 3. 通配符匹配 (student.*.write 符合 student.create.write)
  const pattern = new RegExp(
    '^' + permission.replace('*', '.*') + '$'
  );
  return user.permissions.some(p => pattern.test(p));
}
```

### Resource-Level 權限

教師只能管理自己的課程成績：

```typescript
async function canAccessGrade(userId: string, gradeId: string): Promise<boolean> {
  const grade = await db.gradeRecords.findById(gradeId);
  const course = await db.courseOfferings.findById(grade.course_offering_id);

  // 檢查是否為該課程的授課老師
  return course.teacher_id === userId;
}

// Middleware
const checkGradeAccess = async (req, res, next) => {
  const gradeId = req.params.id;
  const canAccess = await canAccessGrade(req.user.id, gradeId);

  if (!canAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
};

// 路由
router.patch('/grades/:id', checkGradeAccess, updateGrade);
```

---

## 4. 設定中心

### 階層式設定

```
系統預設設定
    ↓
租戶全局設定
    ↓
模組設定
    ↓
用戶個人設定
```

### 設定 API

```typescript
class ConfigService {
  // 取得設定（自動合併階層）
  async get(key: string, tenantId: string, userId?: string): Promise<any> {
    const layers = [
      await this.getSystemDefault(key),
      await this.getTenantConfig(key, tenantId),
      userId ? await this.getUserConfig(key, userId) : null
    ].filter(Boolean);

    // 深度合併
    return deepMerge(...layers);
  }

  // 設定租戶設定
  async setTenantConfig(tenantId: string, key: string, value: any) {
    await db.tenants.update(tenantId, {
      settings: {
        ...existing.settings,
        [key]: value
      }
    });
  }
}
```

---

## 5. 通知系統

### 多管道通知

```typescript
interface Notification {
  tenant_id: string;
  recipient_ids: string[]; // user IDs
  channels: ('email' | 'sms' | 'push' | 'in_app')[];
  template: string;
  data: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  schedule_at?: Date;
}

class NotificationService {
  async send(notification: Notification) {
    // 1. 取得收件人資訊
    const recipients = await db.users.findMany({
      where: { id: { in: notification.recipient_ids } }
    });

    // 2. 渲染模板
    const content = await this.renderTemplate(
      notification.template,
      notification.data
    );

    // 3. 多管道發送
    const promises = notification.channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(recipients, content);
        case 'sms':
          return this.sendSMS(recipients, content);
        case 'push':
          return this.sendPush(recipients, content);
        case 'in_app':
          return this.createInAppNotification(recipients, content);
      }
    });

    await Promise.all(promises);
  }

  private async sendEmail(recipients, content) {
    // 使用 SendGrid / AWS SES
  }

  private async sendSMS(recipients, content) {
    // 使用 Twilio / 三竹簡訊
  }
}
```

### 通知訂閱機制

```typescript
// 用戶可訂閱事件
interface NotificationPreference {
  user_id: string;
  event_type: string; // 'grade.published', 'attendance.absent'
  channels: string[];
  enabled: boolean;
}

// 發送通知時檢查偏好
async function notifyGradePublished(studentId: string, gradeId: string) {
  const prefs = await getNotificationPreferences(studentId, 'grade.published');

  if (prefs.enabled) {
    await notificationService.send({
      recipient_ids: [studentId],
      channels: prefs.channels,
      template: 'grade_published',
      data: { grade_id: gradeId }
    });
  }
}
```

---

## 6. 稽核日誌

### 日誌結構

```typescript
interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string; // 'create', 'update', 'delete', 'read'
  resource_type: string; // 'student', 'grade', 'course'
  resource_id: string;
  changes: {
    before: any;
    after: any;
  };
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

// 自動記錄
async function auditLog(action: string, resource: any, changes: any, req: Request) {
  await db.auditLogs.create({
    tenant_id: req.tenantId,
    user_id: req.user.id,
    action,
    resource_type: resource.constructor.name.toLowerCase(),
    resource_id: resource.id,
    changes,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    timestamp: new Date()
  });
}
```

### Audit Middleware

```typescript
const auditMiddleware = (resourceType: string) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // 記錄操作
      auditLog(req.method, resourceType, {
        before: req.originalResource,
        after: body
      }, req);

      return originalJson(body);
    };

    next();
  };
};

// 使用
router.patch('/students/:id', auditMiddleware('student'), updateStudent);
```

---

## 7. 檔案儲存服務

### 抽象化儲存介面

```typescript
interface FileStorage {
  upload(file: File, path: string): Promise<string>; // 返回 URL
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
}

// S3 實作
class S3FileStorage implements FileStorage {
  async upload(file: File, path: string): Promise<string> {
    const key = `${tenant_id}/${path}/${file.name}`;
    await s3Client.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    });
    return `https://cdn.example.com/${key}`;
  }
}

// 本地開發用 (Minio)
class MinioFileStorage implements FileStorage {
  // 實作...
}
```
