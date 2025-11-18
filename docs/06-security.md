# 安全與權限設計

## 安全架構多層防護

```
┌────────────────────────────────────────┐
│  Layer 1: Network Security             │
│  • Firewall • DDoS Protection • CDN    │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  Layer 2: Application Security         │
│  • WAF • Rate Limiting • Input Valid   │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  Layer 3: Authentication               │
│  • JWT • OAuth 2.0 • MFA               │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  Layer 4: Authorization                │
│  • RBAC • Tenant Isolation • ACL       │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  Layer 5: Data Security                │
│  • Encryption • RLS • Data Masking     │
└────────────────────────────────────────┘
```

## 1. 身份認證 (Authentication)

### JWT 安全實踐

```typescript
// JWT 設定
const JWT_CONFIG = {
  accessToken: {
    secret: process.env.JWT_SECRET, // 至少 256 bits
    expiresIn: '15m' // 短時效降低風險
  },
  refreshToken: {
    secret: process.env.REFRESH_TOKEN_SECRET, // 不同於 access token
    expiresIn: '7d'
  }
};

// Token 生成
function generateTokens(user: User) {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      roles: user.roles,
      type: 'access'
    },
    JWT_CONFIG.accessToken.secret,
    {
      expiresIn: JWT_CONFIG.accessToken.expiresIn,
      issuer: 'edu-saas-platform',
      audience: 'edu-saas-api'
    }
  );

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      type: 'refresh'
    },
    JWT_CONFIG.refreshToken.secret,
    { expiresIn: JWT_CONFIG.refreshToken.expiresIn }
  );

  return { accessToken, refreshToken };
}

// Token 驗證
async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const payload = jwt.verify(token, JWT_CONFIG.accessToken.secret, {
      issuer: 'edu-saas-platform',
      audience: 'edu-saas-api'
    });

    // 檢查 token 是否被撤銷（黑名單機制）
    const isRevoked = await redis.get(`revoked:${token}`);
    if (isRevoked) {
      throw new Error('Token has been revoked');
    }

    return payload as JWTPayload;
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
}

// Token 撤銷（登出）
async function revokeToken(token: string): Promise<void> {
  const decoded = jwt.decode(token) as any;
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  if (ttl > 0) {
    await redis.setex(`revoked:${token}`, ttl, '1');
  }
}
```

### 多因素認證 (MFA)

```typescript
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

class MFAService {
  // 啟用 MFA
  async enableMFA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const secret = speakeasy.generateSecret({
      name: `EduSaaS (${user.email})`,
      issuer: 'EduSaaS Platform'
    });

    // 儲存 secret
    await db.users.update(userId, {
      mfa_secret: this.encrypt(secret.base32),
      mfa_enabled: false // 驗證後才啟用
    });

    // 生成 QR Code
    const qrCode = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode
    };
  }

  // 驗證 MFA
  async verifyMFA(userId: string, token: string): Promise<boolean> {
    const user = await db.users.findById(userId);

    if (!user.mfa_secret) {
      throw new Error('MFA not enabled');
    }

    const secret = this.decrypt(user.mfa_secret);

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // 允許前後 2 個時間窗口
    });

    return verified;
  }

  // MFA 登入流程
  async loginWithMFA(email: string, password: string, mfaToken?: string) {
    // 1. 驗證密碼
    const user = await this.verifyPassword(email, password);

    // 2. 如果啟用 MFA
    if (user.mfa_enabled) {
      if (!mfaToken) {
        return {
          status: 'mfa_required',
          temp_token: this.generateTempToken(user.id)
        };
      }

      const mfaValid = await this.verifyMFA(user.id, mfaToken);
      if (!mfaValid) {
        throw new UnauthorizedError('Invalid MFA token');
      }
    }

    // 3. 生成正式 token
    return generateTokens(user);
  }
}
```

### OAuth 2.0 整合

```typescript
// Google OAuth 設定
const googleOAuthConfig = {
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://api.edu-saas.com/auth/google/callback'
};

// OAuth 流程
app.get('/auth/google', (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${googleOAuthConfig.clientID}&` +
    `redirect_uri=${googleOAuthConfig.callbackURL}&` +
    `response_type=code&` +
    `scope=openid email profile`;

  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  // 1. 換取 access token
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: googleOAuthConfig.clientID,
    client_secret: googleOAuthConfig.clientSecret,
    redirect_uri: googleOAuthConfig.callbackURL,
    grant_type: 'authorization_code'
  });

  // 2. 取得用戶資訊
  const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
  });

  // 3. 查找或創建用戶
  let user = await db.users.findOne({ email: userInfo.data.email });
  if (!user) {
    user = await db.users.create({
      email: userInfo.data.email,
      first_name: userInfo.data.given_name,
      last_name: userInfo.data.family_name,
      avatar_url: userInfo.data.picture,
      email_verified_at: new Date(),
      oauth_provider: 'google',
      oauth_id: userInfo.data.id
    });
  }

  // 4. 生成 JWT
  const tokens = generateTokens(user);

  res.redirect(`/dashboard?token=${tokens.accessToken}`);
});
```

---

## 2. 授權與權限 (Authorization)

### RBAC 實作

```typescript
// 權限檢查裝飾器
function RequirePermission(...permissions: string[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args[0];
      const user = req.user;

      // 檢查是否有任一權限
      const hasPermission = permissions.some(p =>
        checkPermission(user.permissions, p)
      );

      if (!hasPermission) {
        throw new ForbiddenError(`Requires permissions: ${permissions.join(' or ')}`);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

// 使用範例
class StudentController {
  @RequirePermission('student.write', 'student.create')
  async createStudent(req: Request, res: Response) {
    const student = await studentService.create(req.body);
    res.json(student);
  }

  @RequirePermission('student.read')
  async getStudent(req: Request, res: Response) {
    const student = await studentService.findById(req.params.id);

    // Resource-level 檢查
    if (!await this.canAccessStudent(req.user, student)) {
      throw new ForbiddenError('Cannot access this student');
    }

    res.json(student);
  }

  private async canAccessStudent(user: User, student: Student): Promise<boolean> {
    // 系統管理員可以看所有
    if (user.roles.includes('system_admin')) return true;

    // 學生只能看自己
    if (user.roles.includes('student')) {
      return student.user_id === user.id;
    }

    // 家長可以看子女
    if (user.roles.includes('parent')) {
      const children = await this.getParentChildren(user.id);
      return children.includes(student.id);
    }

    // 教師可以看自己班級的學生
    if (user.roles.includes('teacher')) {
      const teacherClasses = await this.getTeacherClasses(user.id);
      const studentClasses = await this.getStudentClasses(student.id);
      return teacherClasses.some(tc => studentClasses.includes(tc));
    }

    return false;
  }
}
```

### 資料遮罩 (Data Masking)

```typescript
// 根據角色遮罩敏感資料
class DataMaskingService {
  maskStudent(student: Student, userRole: string): Partial<Student> {
    const baseMask = {
      id: student.id,
      student_number: student.student_number,
      first_name: student.first_name,
      last_name: student.last_name
    };

    switch (userRole) {
      case 'system_admin':
      case 'tenant_admin':
        return student; // 完整資料

      case 'teacher':
        return {
          ...baseMask,
          email: student.email,
          phone: student.phone,
          // 遮罩身分證字號
          id_number: this.maskIDNumber(student.id_number)
        };

      case 'student':
        if (student.user_id === currentUserId) {
          return student; // 自己的完整資料
        }
        return baseMask; // 其他學生只看基本資料

      default:
        return baseMask;
    }
  }

  private maskIDNumber(idNumber: string): string {
    // A123456789 -> A12****789
    return idNumber.slice(0, 3) + '****' + idNumber.slice(-3);
  }
}
```

---

## 3. 輸入驗證與防護

### SQL Injection 防護

```typescript
// ✅ 正確：使用參數化查詢
async function getStudentByNumber(studentNumber: string) {
  return db.query(
    'SELECT * FROM students WHERE student_number = $1',
    [studentNumber]
  );
}

// ❌ 錯誤：字串拼接
async function getStudentByNumberUnsafe(studentNumber: string) {
  return db.query(
    `SELECT * FROM students WHERE student_number = '${studentNumber}'`
  );
}

// 使用 ORM 自動防護
async function getStudent(id: string) {
  return db.students.findUnique({ where: { id } });
}
```

### XSS 防護

```typescript
import DOMPurify from 'isomorphic-dompurify';

// 清理 HTML 輸入
function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href']
  });
}

// API 層驗證
app.post('/announcements', async (req, res) => {
  const { title, content } = req.body;

  const sanitized = {
    title: sanitizeHTML(title),
    content: sanitizeHTML(content)
  };

  const announcement = await db.announcements.create(sanitized);
  res.json(announcement);
});

// 前端也要編碼輸出
function renderAnnouncement(announcement) {
  return `
    <div class="announcement">
      <h2>${escapeHTML(announcement.title)}</h2>
      <div>${announcement.content}</div>
    </div>
  `;
}
```

### CSRF 防護

```typescript
import csrf from 'csurf';

// CSRF 中介層
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);

// 表單需帶 CSRF token
app.get('/form', (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

app.post('/submit', (req, res) => {
  // 自動驗證 CSRF token
  res.send('Valid!');
});

// API 可用 Double Submit Cookie 或 SameSite
app.use(cookieParser());
app.use(session({
  cookie: {
    sameSite: 'strict',
    secure: true, // HTTPS only
    httpOnly: true
  }
}));
```

---

## 4. 資料加密

### 傳輸加密

```typescript
// 強制 HTTPS
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// HTTPS 設定
const httpsOptions = {
  key: fs.readFileSync('/path/to/private-key.pem'),
  cert: fs.readFileSync('/path/to/certificate.pem'),
  // TLS 1.2+
  minVersion: 'TLSv1.2',
  // 強加密套件
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384'
  ].join(':')
};

https.createServer(httpsOptions, app).listen(443);
```

### 儲存加密

```typescript
import crypto from 'crypto';

class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

  // 加密
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  // 解密
  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// 敏感欄位加密
async function createStudent(data: StudentInput) {
  return db.students.create({
    ...data,
    // 加密身分證字號
    id_number: encryptionService.encrypt(data.id_number),
    // Hash 密碼
    password_hash: await bcrypt.hash(data.password, 12)
  });
}
```

### 密碼安全

```typescript
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

// 密碼策略
const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

function validatePassword(password: string): boolean {
  if (password.length < PASSWORD_POLICY.minLength) return false;
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) return false;
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) return false;
  if (PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(password)) return false;
  if (PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*]/.test(password)) return false;
  return true;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

---

## 5. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// 全局限流
const globalLimiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 每 IP 最多 100 次請求
  message: 'Too many requests from this IP'
});

// 登入限流
const loginLimiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000,
  max: 5, // 每 IP 最多 5 次登入嘗試
  skipSuccessfulRequests: true
});

app.use('/api', globalLimiter);
app.post('/api/auth/login', loginLimiter, loginHandler);

// 動態限流（根據用戶等級）
async function dynamicRateLimiter(req, res, next) {
  const user = req.user;
  const plan = await getTenantPlan(user.tenant_id);

  const limits = {
    'basic': 100,
    'premium': 1000,
    'enterprise': 10000
  };

  const maxRequests = limits[plan];
  // 檢查與限制邏輯...
  next();
}
```

---

## 6. 安全標頭

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.example.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'api.example.com']
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 額外標頭
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

---

## 7. 安全檢查清單

### 開發階段
- [ ] 使用參數化查詢防止 SQL Injection
- [ ] 清理所有用戶輸入防止 XSS
- [ ] 實作 CSRF 防護
- [ ] 密碼強度驗證與安全儲存
- [ ] 敏感資料加密

### 部署階段
- [ ] 強制 HTTPS
- [ ] 設定安全標頭
- [ ] 啟用 Rate Limiting
- [ ] 設定 CORS 白名單
- [ ] 定期安全掃描

### 營運階段
- [ ] 監控異常登入行為
- [ ] 定期密碼重置政策
- [ ] 稽核日誌檢查
- [ ] 定期備份與災難演練
- [ ] 安全更新與補丁管理
