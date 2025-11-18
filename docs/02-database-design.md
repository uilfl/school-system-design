# 資料庫設計

## 資料庫選型

### 主資料庫：PostgreSQL

**選擇理由**：
- ✅ 強大的關聯式資料完整性
- ✅ 支援 JSONB 處理半結構化資料
- ✅ Row-Level Security 支援多租戶
- ✅ 豐富的索引類型（B-Tree, GiST, GIN）
- ✅ 成熟的生態系統

### 快取層：Redis

**用途**：
- Session 管理
- 熱點資料快取
- 分散式鎖
- 訊息佇列（簡單場景）

## 整體 ER 圖

```
┌─────────────────────────────────────────────────────────────┐
│                        平台層                                │
└─────────────────────────────────────────────────────────────┘

  ┌──────────┐        ┌──────────┐        ┌──────────┐
  │ Tenants  │◄───┐   │  Users   │───────►│  Roles   │
  └──────────┘    │   └──────────┘        └──────────┘
       │          │        │                    │
       │          │        │                    │
       │          │   ┌────▼────────┐    ┌─────▼──────┐
       │          └───│UserTenants  │    │ UserRoles  │
       │              └─────────────┘    └────────────┘
       │
┌─────────────────────────────────────────────────────────────┐
│                       核心模組層                             │
└─────────────────────────────────────────────────────────────┘

  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │ Students │      │ Teachers │      │  Staff   │
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       │                 │                  │
       │                 │                  │
  ┌────▼─────────────────▼──────────────────▼────┐
  │              AcademicYears                    │
  │         (學年度/學期設定)                      │
  └────┬──────────────────────────────────────────┘
       │
  ┌────▼─────┐      ┌──────────┐      ┌──────────┐
  │  Grades  │      │ Classes  │      │ Courses  │
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
              ┌──────────▼──────────┐
              │   CourseSchedules   │
              │      (課表)         │
              └──────────┬──────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
      ┌────▼────┐   ┌────▼────┐   ┌───▼─────┐
      │Attendance│   │ Grades  │   │Behaviors│
      │  Records │   │ Records │   │ Records │
      └──────────┘   └─────────┘   └─────────┘
```

## 核心資料表設計

### 1. 平台層表

#### tenants (租戶表)
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE NOT NULL, -- school-a.edu-saas.com
  logo_url VARCHAR(500),
  settings JSONB DEFAULT '{}', -- 自訂設定
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
  plan_type VARCHAR(50) DEFAULT 'basic', -- basic, premium, enterprise
  max_students INTEGER DEFAULT 1000,
  max_teachers INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
```

#### users (使用者表)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255), -- nullable for OAuth users
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, locked
  email_verified_at TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
```

#### user_tenants (用戶-租戶關聯)
```sql
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);
```

#### roles (角色表)
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  permissions JSONB DEFAULT '[]', -- ["student.read", "grade.write"]
  is_system BOOLEAN DEFAULT false, -- 系統預設角色不可刪除
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
```

#### user_roles (用戶角色關聯)
```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, role_id, tenant_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
```

### 2. 學籍管理模組

#### students (學生表)
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  student_number VARCHAR(50) NOT NULL, -- 學號

  -- 基本資料
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  chinese_name VARCHAR(100),
  gender VARCHAR(10), -- male, female, other
  date_of_birth DATE,
  nationality VARCHAR(50),
  id_number VARCHAR(50), -- 身分證字號

  -- 聯絡資訊
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  emergency_contact JSONB, -- {"name": "...", "phone": "...", "relation": "..."}

  -- 就讀資訊
  enrollment_date DATE,
  graduation_date DATE,
  status VARCHAR(20) DEFAULT 'active', -- active, graduated, suspended, transferred, dropped

  -- 額外資料
  photo_url VARCHAR(500),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  UNIQUE(tenant_id, student_number)
);

CREATE INDEX idx_students_tenant ON students(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_user ON students(user_id);
CREATE INDEX idx_students_number ON students(tenant_id, student_number);
CREATE INDEX idx_students_status ON students(status);

-- Row-Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON students
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

#### parents (家長表)
```sql
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20) NOT NULL,
  occupation VARCHAR(100),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_parents_tenant ON parents(tenant_id);
```

#### student_parents (學生-家長關聯)
```sql
CREATE TABLE student_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relationship VARCHAR(50), -- father, mother, guardian
  is_primary BOOLEAN DEFAULT false,
  is_emergency_contact BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, parent_id)
);
```

#### teachers (教師表)
```sql
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  teacher_number VARCHAR(50) NOT NULL,

  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),

  department VARCHAR(100), -- 系所
  title VARCHAR(50), -- 職稱: professor, associate, assistant, lecturer
  specialization TEXT[], -- 專長領域

  employment_type VARCHAR(50), -- full-time, part-time, adjunct
  hire_date DATE,
  status VARCHAR(20) DEFAULT 'active',

  photo_url VARCHAR(500),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  UNIQUE(tenant_id, teacher_number)
);

CREATE INDEX idx_teachers_tenant ON teachers(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_teachers_user ON teachers(user_id);
```

### 3. 課程與課表模組

#### academic_years (學年度)
```sql
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL, -- "2024-2025 學年度"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);
```

#### semesters (學期)
```sql
CREATE TABLE semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL, -- "第一學期", "Fall 2024"
  semester_number INTEGER, -- 1, 2
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### grades (年級)
```sql
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL, -- "高一", "Grade 10"
  grade_level INTEGER NOT NULL, -- 1-12
  display_order INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, grade_level)
);
```

#### classes (班級)
```sql
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grade_id UUID NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id),

  name VARCHAR(100) NOT NULL, -- "高一甲班", "Class 10-A"
  class_number VARCHAR(20),
  homeroom_teacher_id UUID REFERENCES teachers(id),
  max_students INTEGER DEFAULT 40,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_classes_tenant ON classes(tenant_id);
CREATE INDEX idx_classes_grade ON classes(grade_id);
```

#### class_students (班級學生關聯)
```sql
CREATE TABLE class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES semesters(id),

  seat_number INTEGER,
  joined_at DATE DEFAULT CURRENT_DATE,
  left_at DATE,

  UNIQUE(class_id, student_id, semester_id)
);
```

#### courses (課程)
```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  course_code VARCHAR(50) NOT NULL, -- "MATH101"
  course_name VARCHAR(255) NOT NULL,
  description TEXT,
  credits DECIMAL(3,1), -- 學分數
  course_type VARCHAR(50), -- required, elective, lab
  department VARCHAR(100),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, course_code)
);
```

#### course_offerings (開課資訊)
```sql
CREATE TABLE course_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id),

  section VARCHAR(10), -- "A", "B", "01", "02"
  max_enrollment INTEGER DEFAULT 50,
  current_enrollment INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### schedules (課表)
```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,

  day_of_week INTEGER NOT NULL, -- 1=Monday, 7=Sunday
  period_number INTEGER NOT NULL, -- 第幾節課
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  classroom VARCHAR(100),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_schedules_course ON schedules(course_offering_id);
```

### 4. 出缺勤模組

#### attendance_records (出缺勤紀錄)
```sql
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_offering_id UUID REFERENCES course_offerings(id),

  attendance_date DATE NOT NULL,
  period_number INTEGER, -- 第幾節
  status VARCHAR(20) NOT NULL, -- present, absent, late, excused, sick

  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMP DEFAULT NOW(),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attendance_student ON attendance_records(student_id, attendance_date);
CREATE INDEX idx_attendance_course ON attendance_records(course_offering_id, attendance_date);
```

### 5. 成績模組

#### grade_records (成績紀錄)
```sql
CREATE TABLE grade_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,

  assessment_type VARCHAR(50), -- midterm, final, quiz, assignment, project
  assessment_name VARCHAR(255),
  score DECIMAL(5,2),
  max_score DECIMAL(5,2) DEFAULT 100,
  percentage DECIMAL(5,2), -- score/max_score * 100

  grade_letter VARCHAR(5), -- A+, A, B+, etc.
  passed BOOLEAN,

  notes TEXT,
  graded_by UUID REFERENCES teachers(id),
  graded_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_grades_student ON grade_records(student_id);
CREATE INDEX idx_grades_course ON grade_records(course_offering_id);
```

## 索引策略

### 重要索引

```sql
-- 複合索引提升查詢效能
CREATE INDEX idx_students_tenant_status ON students(tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_attendance_lookup ON attendance_records(
  tenant_id, student_id, attendance_date DESC
);

CREATE INDEX idx_grade_lookup ON grade_records(
  tenant_id, student_id, course_offering_id
);

-- JSONB 索引
CREATE INDEX idx_tenants_settings ON tenants USING GIN (settings);
CREATE INDEX idx_student_metadata ON students USING GIN (metadata);
```

## 資料完整性約束

```sql
-- 確保一個學年度只有一個 is_current
CREATE UNIQUE INDEX idx_one_current_academic_year
  ON academic_years(tenant_id)
  WHERE is_current = true;

-- 確保班級學生數不超過上限
CREATE OR REPLACE FUNCTION check_class_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM class_students
      WHERE class_id = NEW.class_id AND left_at IS NULL) >=
     (SELECT max_students FROM classes WHERE id = NEW.class_id)
  THEN
    RAISE EXCEPTION 'Class is full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_class_capacity
  BEFORE INSERT ON class_students
  FOR EACH ROW EXECUTE FUNCTION check_class_capacity();
```

## 資料遷移與版本控制

使用 **Prisma Migrate** 或 **TypeORM Migrations** 管理 schema 變更。

```bash
# Prisma 範例
npx prisma migrate dev --name init_platform_tables
npx prisma migrate deploy
```

## 效能優化建議

1. **分區表** (Partitioning)
   - 按學年度分區存檔歷史資料

2. **物化視圖** (Materialized Views)
   - 預先計算統計報表

3. **讀寫分離**
   - Master 處理寫入
   - Replica 處理報表與查詢

4. **歸檔策略**
   - 畢業學生資料移至歸檔表
   - 保留近 5 年線上資料
