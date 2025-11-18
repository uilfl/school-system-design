# 核心模組設計

## 模組化架構原則

每個核心模組遵循以下設計原則：

1. **獨立性** - 模組間低耦合，透過明確介面通訊
2. **可替換性** - 可以啟用/停用個別模組
3. **可擴展性** - 支援自訂欄位與業務邏輯
4. **事件驅動** - 透過事件匯流排（Event Bus）通訊

---

## 模組 1：學籍管理系統 (SIS)

### 核心功能

1. **學生資訊管理**
   - 基本資料（姓名、性別、生日、聯絡方式）
   - 學籍狀態（在學、休學、畢業、轉學）
   - 學號生成規則
   - 照片與文件管理

2. **家長管理**
   - 家長資訊維護
   - 學生-家長關聯
   - 緊急聯絡人設定

3. **班級編組**
   - 學生分班
   - 班級名單管理
   - 導師指派

4. **學籍異動**
   - 轉班、轉學、休學、復學
   - 異動歷史紀錄
   - 審批流程

### 資料模型

```typescript
// 學生實體
class Student {
  id: string;
  tenant_id: string;
  user_id?: string; // 關聯到登入帳號
  student_number: string; // 學號

  // 基本資料
  first_name: string;
  last_name: string;
  chinese_name?: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth: Date;
  nationality: string;
  id_number: string; // 身分證字號

  // 聯絡資訊
  email?: string;
  phone?: string;
  address?: string;
  emergency_contact: EmergencyContact;

  // 就讀資訊
  enrollment_date: Date;
  graduation_date?: Date;
  status: StudentStatus;

  // 擴展欄位
  photo_url?: string;
  metadata: Record<string, any>;

  // 關聯
  parents: Parent[];
  classes: ClassStudent[];
}

enum StudentStatus {
  ACTIVE = 'active',
  GRADUATED = 'graduated',
  SUSPENDED = 'suspended',
  TRANSFERRED = 'transferred',
  DROPPED = 'dropped'
}
```

### 業務邏輯範例

```typescript
class StudentService {
  // 學號自動生成
  async generateStudentNumber(tenantId: string, enrollmentYear: number): Promise<string> {
    const config = await this.getTenantConfig(tenantId);
    const format = config.student_number_format; // "YYYY-NNN"

    const count = await this.getEnrollmentCount(tenantId, enrollmentYear);
    const sequence = String(count + 1).padStart(3, '0');

    return format.replace('YYYY', String(enrollmentYear)).replace('NNN', sequence);
  }

  // 學生入學
  async enrollStudent(data: StudentEnrollmentData): Promise<Student> {
    const studentNumber = await this.generateStudentNumber(
      data.tenant_id,
      new Date().getFullYear()
    );

    const student = await db.students.create({
      ...data,
      student_number: studentNumber,
      status: StudentStatus.ACTIVE,
      enrollment_date: new Date()
    });

    // 發布事件
    eventBus.publish('student.enrolled', {
      tenant_id: data.tenant_id,
      student_id: student.id,
      student_number: studentNumber
    });

    return student;
  }

  // 學籍異動
  async transferStudent(
    studentId: string,
    fromClassId: string,
    toClassId: string,
    reason: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. 更新原班級關聯
      await tx.classStudents.update({
        where: { student_id: studentId, class_id: fromClassId },
        data: { left_at: new Date() }
      });

      // 2. 建立新班級關聯
      await tx.classStudents.create({
        student_id: studentId,
        class_id: toClassId,
        joined_at: new Date()
      });

      // 3. 記錄異動
      await tx.studentTransferRecords.create({
        student_id: studentId,
        from_class_id: fromClassId,
        to_class_id: toClassId,
        reason,
        transferred_at: new Date()
      });
    });

    eventBus.publish('student.transferred', { studentId, fromClassId, toClassId });
  }
}
```

---

## 模組 2：課程與課表管理

### 核心功能

1. **課程管理**
   - 課程基本資料（課程代碼、名稱、學分）
   - 課程分類（必修、選修、實驗）
   - 課程大綱與教材

2. **開課管理**
   - 學期開課規劃
   - 授課教師指派
   - 修課人數限制

3. **排課系統**
   - 自動/手動排課
   - 衝突檢測（教師時間衝突、教室衝突）
   - 課表視覺化

4. **選課系統**
   - 線上選課
   - 加退選規則
   - 選課志願序

### 排課演算法

```typescript
class SchedulingEngine {
  // 排課衝突檢測
  async validateSchedule(schedule: ScheduleInput): Promise<ValidationResult> {
    const conflicts = [];

    // 1. 教師時間衝突
    const teacherConflict = await this.checkTeacherConflict(
      schedule.teacher_id,
      schedule.day_of_week,
      schedule.period_number
    );
    if (teacherConflict) {
      conflicts.push({
        type: 'TEACHER_CONFLICT',
        message: `教師 ${schedule.teacher_id} 在此時段已有課程`
      });
    }

    // 2. 教室衝突
    const roomConflict = await this.checkRoomConflict(
      schedule.classroom,
      schedule.day_of_week,
      schedule.period_number
    );
    if (roomConflict) {
      conflicts.push({
        type: 'ROOM_CONFLICT',
        message: `教室 ${schedule.classroom} 在此時段已被使用`
      });
    }

    // 3. 班級時間衝突（固定班級）
    if (schedule.class_id) {
      const classConflict = await this.checkClassConflict(
        schedule.class_id,
        schedule.day_of_week,
        schedule.period_number
      );
      if (classConflict) {
        conflicts.push({
          type: 'CLASS_CONFLICT',
          message: `班級在此時段已有其他課程`
        });
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts
    };
  }

  // 自動排課（簡化版貪心演算法）
  async autoSchedule(courseOffering: CourseOffering): Promise<Schedule[]> {
    const requirements = {
      periods_per_week: 3, // 每週 3 節課
      preferred_days: [1, 3, 5], // 週一、三、五
      avoid_first_last_period: true
    };

    const availableSlots = await this.findAvailableSlots(
      courseOffering.teacher_id,
      requirements
    );

    // 選擇最佳時段
    const selectedSlots = this.selectBestSlots(availableSlots, requirements.periods_per_week);

    // 建立課表
    return Promise.all(
      selectedSlots.map(slot =>
        db.schedules.create({
          course_offering_id: courseOffering.id,
          day_of_week: slot.day,
          period_number: slot.period,
          start_time: slot.start_time,
          end_time: slot.end_time,
          classroom: await this.findAvailableRoom(slot)
        })
      )
    );
  }
}
```

### 選課流程

```typescript
class EnrollmentService {
  async enrollCourse(studentId: string, courseOfferingId: string): Promise<Enrollment> {
    const courseOffering = await db.courseOfferings.findById(courseOfferingId);
    const student = await db.students.findById(studentId);

    // 1. 驗證選課資格
    await this.validateEnrollment(student, courseOffering);

    // 2. 檢查人數上限
    if (courseOffering.current_enrollment >= courseOffering.max_enrollment) {
      throw new Error('課程已額滿');
    }

    // 3. 檢查時間衝突
    const hasConflict = await this.checkStudentScheduleConflict(
      studentId,
      courseOfferingId
    );
    if (hasConflict) {
      throw new Error('選課時間衝突');
    }

    // 4. 建立選課記錄
    const enrollment = await db.enrollments.create({
      student_id: studentId,
      course_offering_id: courseOfferingId,
      enrolled_at: new Date(),
      status: 'enrolled'
    });

    // 5. 更新選課人數
    await db.courseOfferings.update(courseOfferingId, {
      current_enrollment: courseOffering.current_enrollment + 1
    });

    eventBus.publish('course.enrolled', { studentId, courseOfferingId });

    return enrollment;
  }

  private async validateEnrollment(student: Student, course: CourseOffering): Promise<void> {
    // 檢查先修課程
    const prerequisites = await this.getCoursePrerequisites(course.course_id);
    for (const prereq of prerequisites) {
      const completed = await this.hasCompletedCourse(student.id, prereq.id);
      if (!completed) {
        throw new Error(`需先完成先修課程: ${prereq.course_name}`);
      }
    }

    // 檢查學分上限
    const currentCredits = await this.getStudentCurrentCredits(student.id, course.semester_id);
    const maxCredits = await this.getMaxCreditsAllowed(student.id);
    if (currentCredits + course.credits > maxCredits) {
      throw new Error('超過學分上限');
    }
  }
}
```

---

## 模組 3：出缺勤管理

### 核心功能

1. **點名管理**
   - 線上點名（Web/App）
   - 批次點名
   - QR Code 簽到
   - 刷卡整合

2. **缺曠統計**
   - 個人出缺勤報表
   - 班級出缺勤統計
   - 缺曠預警

3. **請假系統**
   - 線上請假申請
   - 假別管理（病假、事假、公假）
   - 審批流程

### 點名實作

```typescript
class AttendanceService {
  // 批次點名
  async markAttendance(data: BatchAttendanceInput): Promise<void> {
    const { course_offering_id, attendance_date, period_number, records } = data;

    // 取得應到學生名單
    const expectedStudents = await this.getEnrolledStudents(course_offering_id);

    // 標記未點名的學生為曠課
    const markedIds = records.map(r => r.student_id);
    const unmarkedStudents = expectedStudents.filter(s => !markedIds.includes(s.id));

    const attendanceRecords = [
      ...records,
      ...unmarkedStudents.map(s => ({
        student_id: s.id,
        status: 'absent' as const
      }))
    ];

    // 批次寫入
    await db.attendanceRecords.createMany(
      attendanceRecords.map(record => ({
        tenant_id: data.tenant_id,
        student_id: record.student_id,
        course_offering_id,
        attendance_date,
        period_number,
        status: record.status,
        notes: record.notes,
        recorded_by: data.teacher_id,
        recorded_at: new Date()
      }))
    );

    // 觸發缺曠預警
    await this.checkAbsentAlerts(attendanceRecords.filter(r => r.status === 'absent'));
  }

  // 缺曠預警
  private async checkAbsentAlerts(absentRecords: AttendanceRecord[]): Promise<void> {
    for (const record of absentRecords) {
      // 計算累計缺課次數
      const absentCount = await this.getAbsentCount(
        record.student_id,
        { days: 30 } // 近 30 天
      );

      // 超過門檻發送通知
      if (absentCount >= 3) {
        await notificationService.send({
          tenant_id: record.tenant_id,
          recipient_ids: [
            record.student_id,
            ...await this.getStudentParentIds(record.student_id),
            ...await this.getHomeTeacherId(record.student_id)
          ],
          channels: ['email', 'sms', 'in_app'],
          template: 'absent_alert',
          data: {
            student_name: await this.getStudentName(record.student_id),
            absent_count: absentCount
          }
        });
      }
    }
  }

  // QR Code 簽到
  async checkInWithQRCode(qrToken: string, studentId: string): Promise<void> {
    // 1. 驗證 QR Code
    const session = await this.validateQRToken(qrToken);

    // 2. 檢查簽到時間
    if (Date.now() > session.expires_at) {
      throw new Error('QR Code 已過期');
    }

    // 3. 記錄出席
    await db.attendanceRecords.create({
      tenant_id: session.tenant_id,
      student_id: studentId,
      course_offering_id: session.course_offering_id,
      attendance_date: session.date,
      period_number: session.period_number,
      status: 'present',
      recorded_at: new Date()
    });
  }

  // 教師產生 QR Code
  async generateQRCodeSession(courseOfferingId: string, periodNumber: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');

    await redis.setex(
      `qr:${token}`,
      300, // 5 分鐘有效
      JSON.stringify({
        course_offering_id: courseOfferingId,
        period_number: periodNumber,
        date: new Date().toISOString().split('T')[0],
        expires_at: Date.now() + 300000
      })
    );

    return token;
  }
}
```

---

## 模組 4：成績評量系統

### 核心功能

1. **成績管理**
   - 成績輸入（平時、期中、期末）
   - 成績計算規則
   - 等第轉換

2. **評量設定**
   - 評分標準設定
   - 權重配置
   - 及格標準

3. **成績查詢**
   - 學生成績查詢
   - 成績單生成
   - 排名計算

4. **成績分析**
   - 成績分佈圖
   - 及格率統計
   - 預警名單

### 成績計算引擎

```typescript
class GradingEngine {
  // 計算最終成績
  async calculateFinalGrade(
    studentId: string,
    courseOfferingId: string
  ): Promise<FinalGrade> {
    // 1. 取得成績規則
    const gradingRule = await this.getGradingRule(courseOfferingId);

    // 2. 取得所有評量成績
    const assessments = await db.gradeRecords.findMany({
      where: {
        student_id: studentId,
        course_offering_id: courseOfferingId
      }
    });

    // 3. 按類型分組計算
    const scoresByType = this.groupByAssessmentType(assessments);

    let totalScore = 0;
    for (const [type, records] of Object.entries(scoresByType)) {
      const weight = gradingRule.weights[type] || 0;
      const avgScore = this.average(records.map(r => r.percentage));
      totalScore += avgScore * weight;
    }

    // 4. 轉換等第
    const gradeLetter = this.convertToGradeLetter(totalScore, gradingRule.scale);

    // 5. 判定及格
    const passed = totalScore >= gradingRule.passing_score;

    return {
      student_id: studentId,
      course_offering_id: courseOfferingId,
      final_score: totalScore,
      grade_letter: gradeLetter,
      passed,
      calculated_at: new Date()
    };
  }

  // 等第轉換
  private convertToGradeLetter(score: number, scale: GradingScale): string {
    // A+: 90-100, A: 85-89, B+: 80-84, ...
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 65) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  // GPA 計算
  async calculateGPA(studentId: string, semesterId: string): Promise<number> {
    const courses = await this.getStudentCourses(studentId, semesterId);

    let totalGradePoints = 0;
    let totalCredits = 0;

    for (const course of courses) {
      const finalGrade = await this.calculateFinalGrade(studentId, course.id);
      const gradePoint = this.letterToGradePoint(finalGrade.grade_letter);

      totalGradePoints += gradePoint * course.credits;
      totalCredits += course.credits;
    }

    return totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  private letterToGradePoint(letter: string): number {
    const mapping = {
      'A+': 4.3, 'A': 4.0, 'A-': 3.7,
      'B+': 3.3, 'B': 3.0, 'B-': 2.7,
      'C+': 2.3, 'C': 2.0, 'C-': 1.7,
      'D': 1.0, 'F': 0.0
    };
    return mapping[letter] || 0;
  }
}
```

---

## 模組 5：家校溝通

### 核心功能

1. **公告系統**
   - 校方公告
   - 班級公告
   - 緊急通知

2. **訊息中心**
   - 一對一訊息
   - 群組訊息
   - 已讀回執

3. **活動報名**
   - 線上報名表
   - 名額管理
   - 報名統計

### 實作範例

```typescript
class CommunicationService {
  // 發布公告
  async publishAnnouncement(data: AnnouncementInput): Promise<Announcement> {
    const announcement = await db.announcements.create({
      tenant_id: data.tenant_id,
      title: data.title,
      content: data.content,
      author_id: data.author_id,
      target_audience: data.target_audience, // 'all', 'teachers', 'students', 'parents'
      priority: data.priority,
      published_at: new Date()
    });

    // 發送通知給目標對象
    const recipients = await this.getTargetAudience(
      data.tenant_id,
      data.target_audience
    );

    await notificationService.send({
      tenant_id: data.tenant_id,
      recipient_ids: recipients,
      channels: ['in_app', 'email'],
      template: 'new_announcement',
      data: { announcement }
    });

    return announcement;
  }
}
```

---

## 模組間通訊：事件驅動架構

```typescript
// 事件定義
enum SystemEvent {
  STUDENT_ENROLLED = 'student.enrolled',
  STUDENT_TRANSFERRED = 'student.transferred',
  COURSE_ENROLLED = 'course.enrolled',
  GRADE_PUBLISHED = 'grade.published',
  ATTENDANCE_MARKED = 'attendance.marked'
}

// 事件匯流排
class EventBus {
  private handlers: Map<string, Function[]> = new Map();

  subscribe(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  async publish(event: string, data: any) {
    const handlers = this.handlers.get(event) || [];
    await Promise.all(handlers.map(h => h(data)));
  }
}

// 使用範例
eventBus.subscribe('student.enrolled', async (data) => {
  // 自動創建學生帳號
  await createStudentAccount(data.student_id);

  // 發送歡迎郵件
  await sendWelcomeEmail(data.student_id);
});

eventBus.subscribe('grade.published', async (data) => {
  // 通知學生與家長
  await notifyGradePublished(data.student_id, data.grade_id);
});
```
