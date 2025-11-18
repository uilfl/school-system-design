import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '../../common/utils/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('🌱 Starting database seeding...');

  try {
    // Clear existing data (optional - comment out if you want to preserve data)
    await clearDatabase();

    // 1. Create tenants
    const tenant = await createTenant();
    logger.info(`✅ Created tenant: ${tenant.name}`);

    // 2. Create roles
    const roles = await createRoles(tenant.id);
    logger.info(`✅ Created ${roles.length} roles`);

    // 3. Create users
    const users = await createUsers(tenant.id, roles);
    logger.info(`✅ Created ${users.length} users`);

    // 4. Create academic structure
    const academicYear = await createAcademicYear(tenant.id);
    const semester = await createSemester(tenant.id, academicYear.id);
    const grades = await createGrades(tenant.id);
    const classes = await createClasses(tenant.id, grades, academicYear.id);
    logger.info(`✅ Created academic structure`);

    // 5. Create students
    const students = await createStudents(tenant.id, users.students, classes);
    logger.info(`✅ Created ${students.length} students`);

    // 6. Create teachers
    const teachers = await createTeachers(tenant.id, users.teachers);
    logger.info(`✅ Created ${teachers.length} teachers`);

    // 7. Create courses
    const courses = await createCourses(tenant.id);
    const offerings = await createCourseOfferings(
      tenant.id,
      courses,
      semester.id,
      teachers
    );
    logger.info(`✅ Created ${courses.length} courses with ${offerings.length} offerings`);

    // 8. Create schedules
    await createSchedules(tenant.id, offerings);
    logger.info(`✅ Created schedules`);

    // 9. Create sample attendance records
    await createAttendanceRecords(tenant.id, students, offerings);
    logger.info(`✅ Created attendance records`);

    // 10. Create sample grades
    await createGradeRecords(tenant.id, students, offerings, users.teachers[0].id);
    logger.info(`✅ Created grade records`);

    logger.info('');
    logger.info('🎉 Database seeding completed successfully!');
    logger.info('');
    logger.info('📝 Default Login Credentials:');
    logger.info('   Admin:   admin@demo.school / password123');
    logger.info('   Teacher: teacher1@demo.school / password123');
    logger.info('   Student: student1@demo.school / password123');
    logger.info('');
  } catch (error) {
    logger.error('❌ Error seeding database:', error);
    throw error;
  }
}

async function clearDatabase() {
  logger.info('🗑️  Clearing existing data...');

  await prisma.gradeRecord.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.courseOffering.deleteMany();
  await prisma.course.deleteMany();
  await prisma.classStudent.deleteMany();
  await prisma.class.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.semester.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.studentParent.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany();
  await prisma.userTenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

async function createTenant() {
  return await prisma.tenant.create({
    data: {
      name: 'Demo School',
      subdomain: 'demo-school',
      logoUrl: 'https://via.placeholder.com/200',
      status: 'active',
      planType: 'premium',
      maxStudents: 1000,
      maxTeachers: 100,
      settings: {
        timezone: 'Asia/Taipei',
        language: 'zh-TW',
        academic_year_start: '09-01',
      },
    },
  });
}

async function createRoles(tenantId: string) {
  const roles = [
    {
      name: 'admin',
      displayName: '系統管理員',
      description: '擁有完整系統權限',
      permissions: ['*'],
      isSystem: true,
    },
    {
      name: 'teacher',
      displayName: '教師',
      description: '教師權限',
      permissions: [
        'student.read',
        'course.read',
        'attendance.write',
        'grade.write',
      ],
      isSystem: true,
    },
    {
      name: 'student',
      displayName: '學生',
      description: '學生權限',
      permissions: [
        'student.self.read',
        'course.read',
        'grade.self.read',
        'attendance.self.read',
      ],
      isSystem: true,
    },
  ];

  const createdRoles = [];
  for (const role of roles) {
    const created = await prisma.role.create({
      data: {
        tenantId,
        ...role,
      },
    });
    createdRoles.push(created);
  }

  return createdRoles;
}

async function createUsers(tenantId: string, roles: any[]) {
  const password = await bcrypt.hash('password123', 12);

  // Admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.school',
      passwordHash: password,
      firstName: 'Admin',
      lastName: 'User',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.userTenant.create({
    data: { userId: admin.id, tenantId, isPrimary: true },
  });

  await prisma.userRole.create({
    data: {
      userId: admin.id,
      roleId: roles.find((r) => r.name === 'admin')!.id,
      tenantId,
    },
  });

  // Teachers
  const teachers = [];
  for (let i = 1; i <= 5; i++) {
    const teacher = await prisma.user.create({
      data: {
        email: `teacher${i}@demo.school`,
        passwordHash: password,
        firstName: `Teacher${i}`,
        lastName: 'Wang',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userTenant.create({
      data: { userId: teacher.id, tenantId, isPrimary: true },
    });

    await prisma.userRole.create({
      data: {
        userId: teacher.id,
        roleId: roles.find((r) => r.name === 'teacher')!.id,
        tenantId,
      },
    });

    teachers.push(teacher);
  }

  // Students
  const students = [];
  for (let i = 1; i <= 30; i++) {
    const student = await prisma.user.create({
      data: {
        email: `student${i}@demo.school`,
        passwordHash: password,
        firstName: `Student${i}`,
        lastName: 'Chen',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.userTenant.create({
      data: { userId: student.id, tenantId, isPrimary: true },
    });

    await prisma.userRole.create({
      data: {
        userId: student.id,
        roleId: roles.find((r) => r.name === 'student')!.id,
        tenantId,
      },
    });

    students.push(student);
  }

  return { admin, teachers, students };
}

async function createAcademicYear(tenantId: string) {
  return await prisma.academicYear.create({
    data: {
      tenantId,
      name: '2024-2025 學年度',
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-06-30'),
      isCurrent: true,
    },
  });
}

async function createSemester(tenantId: string, academicYearId: string) {
  return await prisma.semester.create({
    data: {
      tenantId,
      academicYearId,
      name: '第一學期',
      semesterNumber: 1,
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-01-20'),
      isCurrent: true,
    },
  });
}

async function createGrades(tenantId: string) {
  const gradeData = [
    { name: '高一', gradeLevel: 10 },
    { name: '高二', gradeLevel: 11 },
    { name: '高三', gradeLevel: 12 },
  ];

  const grades = [];
  for (const data of gradeData) {
    const grade = await prisma.grade.create({
      data: {
        tenantId,
        ...data,
        displayOrder: data.gradeLevel,
      },
    });
    grades.push(grade);
  }

  return grades;
}

async function createClasses(tenantId: string, grades: any[], academicYearId: string) {
  const classes = [];
  const classNames = ['甲班', '乙班'];

  for (const grade of grades) {
    for (const className of classNames) {
      const cls = await prisma.class.create({
        data: {
          tenantId,
          gradeId: grade.id,
          academicYearId,
          name: `${grade.name}${className}`,
          classNumber: className[0],
          maxStudents: 40,
        },
      });
      classes.push(cls);
    }
  }

  return classes;
}

async function createStudents(tenantId: string, userStudents: any[], classes: any[]) {
  const students = [];
  let studentIndex = 0;

  for (const cls of classes) {
    // 每班 10 個學生
    for (let i = 0; i < 10 && studentIndex < userStudents.length; i++, studentIndex++) {
      const user = userStudents[studentIndex];
      const studentNumber = `24${String(studentIndex + 1).padStart(5, '0')}`;

      const student = await prisma.student.create({
        data: {
          tenantId,
          userId: user.id,
          studentNumber,
          firstName: user.firstName,
          lastName: user.lastName,
          gender: studentIndex % 2 === 0 ? 'male' : 'female',
          dateOfBirth: new Date('2008-01-15'),
          email: user.email,
          enrollmentDate: new Date('2024-09-01'),
          status: 'active',
        },
      });

      await prisma.classStudent.create({
        data: {
          classId: cls.id,
          studentId: student.id,
          seatNumber: i + 1,
          joinedAt: new Date('2024-09-01'),
        },
      });

      students.push(student);
    }
  }

  return students;
}

async function createTeachers(tenantId: string, userTeachers: any[]) {
  const teachers = [];
  const departments = ['數學', '物理', '化學', '英文', '國文'];

  for (let i = 0; i < userTeachers.length; i++) {
    const user = userTeachers[i];
    const teacher = await prisma.teacher.create({
      data: {
        tenantId,
        userId: user.id,
        teacherNumber: `T${String(i + 1).padStart(4, '0')}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: departments[i % departments.length],
        title: 'lecturer',
        employmentType: 'full-time',
        hireDate: new Date('2020-09-01'),
        status: 'active',
        specialization: [departments[i % departments.length]],
      },
    });

    teachers.push(teacher);
  }

  return teachers;
}

async function createCourses(tenantId: string) {
  const courseData = [
    { code: 'MATH101', name: '高等數學', credits: 3, type: 'required', dept: '數學' },
    { code: 'PHYS101', name: '普通物理', credits: 3, type: 'required', dept: '物理' },
    { code: 'CHEM101', name: '普通化學', credits: 3, type: 'required', dept: '化學' },
    { code: 'ENG101', name: '進階英文', credits: 2, type: 'required', dept: '英文' },
    { code: 'CHI101', name: '國文', credits: 2, type: 'required', dept: '國文' },
  ];

  const courses = [];
  for (const data of courseData) {
    const course = await prisma.course.create({
      data: {
        tenantId,
        courseCode: data.code,
        courseName: data.name,
        credits: data.credits,
        courseType: data.type,
        department: data.dept,
        description: `${data.name}課程說明`,
      },
    });
    courses.push(course);
  }

  return courses;
}

async function createCourseOfferings(
  tenantId: string,
  courses: any[],
  semesterId: string,
  teachers: any[]
) {
  const offerings = [];

  for (let i = 0; i < courses.length; i++) {
    const offering = await prisma.courseOffering.create({
      data: {
        tenantId,
        courseId: courses[i].id,
        semesterId,
        teacherId: teachers[i % teachers.length].id,
        section: 'A',
        maxEnrollment: 50,
        currentEnrollment: 30,
      },
    });
    offerings.push(offering);
  }

  return offerings;
}

async function createSchedules(tenantId: string, offerings: any[]) {
  const schedules = [
    { day: 1, period: 1, start: '08:00', end: '08:50', room: 'A101' },
    { day: 2, period: 2, start: '09:00', end: '09:50', room: 'A102' },
    { day: 3, period: 3, start: '10:10', end: '11:00', room: 'A103' },
    { day: 4, period: 4, start: '11:10', end: '12:00', room: 'B201' },
    { day: 5, period: 1, start: '08:00', end: '08:50', room: 'B202' },
  ];

  for (let i = 0; i < offerings.length; i++) {
    const schedule = schedules[i % schedules.length];
    await prisma.schedule.create({
      data: {
        tenantId,
        courseOfferingId: offerings[i].id,
        dayOfWeek: schedule.day,
        periodNumber: schedule.period,
        startTime: new Date(`1970-01-01T${schedule.start}:00Z`),
        endTime: new Date(`1970-01-01T${schedule.end}:00Z`),
        classroom: schedule.room,
      },
    });
  }
}

async function createAttendanceRecords(
  tenantId: string,
  students: any[],
  offerings: any[]
) {
  const statuses = ['present', 'present', 'present', 'present', 'absent', 'late'];
  const dates = [
    new Date('2024-11-01'),
    new Date('2024-11-04'),
    new Date('2024-11-05'),
  ];

  for (const date of dates) {
    for (const offering of offerings.slice(0, 2)) {
      for (const student of students.slice(0, 10)) {
        await prisma.attendanceRecord.create({
          data: {
            tenantId,
            studentId: student.id,
            courseOfferingId: offering.id,
            attendanceDate: date,
            periodNumber: 1,
            status: statuses[Math.floor(Math.random() * statuses.length)],
            recordedAt: new Date(),
          },
        });
      }
    }
  }
}

async function createGradeRecords(
  tenantId: string,
  students: any[],
  offerings: any[],
  teacherId: string
) {
  const assessmentTypes = ['assignment', 'quiz', 'midterm', 'final'];

  for (const offering of offerings.slice(0, 2)) {
    for (const type of assessmentTypes.slice(0, 2)) {
      for (const student of students.slice(0, 10)) {
        const score = 60 + Math.random() * 40; // 60-100
        const maxScore = 100;
        const percentage = (score / maxScore) * 100;

        await prisma.gradeRecord.create({
          data: {
            tenantId,
            studentId: student.id,
            courseOfferingId: offering.id,
            assessmentType: type,
            assessmentName: `${type}_1`,
            score,
            maxScore,
            percentage,
            gradeLetter: score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : 'C',
            passed: score >= 60,
            gradedBy: teacherId,
            gradedAt: new Date(),
          },
        });
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
