import { prisma } from '../../database/client';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../common/middleware/error-handler';

interface CreateCourseData {
  courseCode: string;
  courseName: string;
  description?: string;
  credits: number;
  courseType?: string;
  department?: string;
}

interface CreateOfferingData {
  semesterId: string;
  teacherId?: string;
  section?: string;
  maxEnrollment?: number;
}

interface CreateScheduleData {
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  classroom?: string;
}

export class CourseService {
  // ==================== Course CRUD ====================

  async findAll(tenantId: string, options: any) {
    const { page, limit, filters } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
    };

    if (filters.department) {
      where.department = filters.department;
    }
    if (filters.courseType) {
      where.courseType = filters.courseType;
    }
    if (filters.search) {
      where.OR = [
        { courseName: { contains: filters.search, mode: 'insensitive' } },
        { courseCode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);

    return {
      data: courses,
      pagination: {
        current_page: page,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1,
      },
    };
  }

  async findById(tenantId: string, id: string) {
    const course = await prisma.course.findFirst({
      where: { id, tenantId },
      include: {
        offerings: {
          include: {
            semester: true,
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundError('Course not found');
    }

    return course;
  }

  async create(tenantId: string, data: CreateCourseData) {
    // Check if course code exists
    const existing = await prisma.course.findFirst({
      where: {
        tenantId,
        courseCode: data.courseCode,
      },
    });

    if (existing) {
      throw new ConflictError('Course code already exists');
    }

    const course = await prisma.course.create({
      data: {
        tenantId,
        courseCode: data.courseCode,
        courseName: data.courseName,
        description: data.description,
        credits: data.credits,
        courseType: data.courseType,
        department: data.department,
      },
    });

    return course;
  }

  async update(tenantId: string, id: string, data: Partial<CreateCourseData>) {
    // Check if course exists
    await this.findById(tenantId, id);

    // Check course code uniqueness if changing
    if (data.courseCode) {
      const duplicate = await prisma.course.findFirst({
        where: {
          tenantId,
          courseCode: data.courseCode,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictError('Course code already exists');
      }
    }

    const course = await prisma.course.update({
      where: { id },
      data: {
        courseName: data.courseName,
        description: data.description,
        credits: data.credits,
        courseType: data.courseType,
        department: data.department,
        updatedAt: new Date(),
      },
    });

    return course;
  }

  async delete(tenantId: string, id: string) {
    // Check if course exists
    await this.findById(tenantId, id);

    // Check if there are offerings
    const offeringsCount = await prisma.courseOffering.count({
      where: { courseId: id },
    });

    if (offeringsCount > 0) {
      throw new BadRequestError(
        'Cannot delete course with existing offerings. Please delete offerings first.'
      );
    }

    await prisma.course.delete({
      where: { id },
    });
  }

  // ==================== Course Offerings ====================

  async getOfferings(tenantId: string, courseId: string, semesterId?: string) {
    const where: any = {
      tenantId,
      courseId,
    };

    if (semesterId) {
      where.semesterId = semesterId;
    }

    const offerings = await prisma.courseOffering.findMany({
      where,
      include: {
        course: true,
        semester: true,
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        schedules: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return offerings;
  }

  async createOffering(
    tenantId: string,
    courseId: string,
    data: CreateOfferingData
  ) {
    // Validate course exists
    await this.findById(tenantId, courseId);

    // Validate semester exists
    const semester = await prisma.semester.findFirst({
      where: { id: data.semesterId, tenantId },
    });

    if (!semester) {
      throw new NotFoundError('Semester not found');
    }

    // Create offering
    const offering = await prisma.courseOffering.create({
      data: {
        tenantId,
        courseId,
        semesterId: data.semesterId,
        teacherId: data.teacherId,
        section: data.section,
        maxEnrollment: data.maxEnrollment || 50,
        currentEnrollment: 0,
      },
      include: {
        course: true,
        semester: true,
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return offering;
  }

  // ==================== Schedules ====================

  async getSchedules(tenantId: string, offeringId: string) {
    const schedules = await prisma.schedule.findMany({
      where: {
        tenantId,
        courseOfferingId: offeringId,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
    });

    return schedules;
  }

  async createSchedule(
    tenantId: string,
    offeringId: string,
    data: CreateScheduleData
  ) {
    // Validate offering exists
    const offering = await prisma.courseOffering.findFirst({
      where: { id: offeringId, tenantId },
      include: { teacher: true },
    });

    if (!offering) {
      throw new NotFoundError('Course offering not found');
    }

    // Check for conflicts
    await this.validateScheduleConflicts(
      tenantId,
      data.dayOfWeek,
      data.periodNumber,
      data.classroom,
      offering.teacherId
    );

    // Create schedule
    const schedule = await prisma.schedule.create({
      data: {
        tenantId,
        courseOfferingId: offeringId,
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
        startTime: new Date(`1970-01-01T${data.startTime}:00Z`),
        endTime: new Date(`1970-01-01T${data.endTime}:00Z`),
        classroom: data.classroom,
      },
    });

    return schedule;
  }

  private async validateScheduleConflicts(
    tenantId: string,
    dayOfWeek: number,
    periodNumber: number,
    classroom?: string,
    teacherId?: string
  ) {
    // Check teacher conflict
    if (teacherId) {
      const teacherConflict = await prisma.schedule.findFirst({
        where: {
          tenantId,
          dayOfWeek,
          periodNumber,
          courseOffering: {
            teacherId,
          },
        },
      });

      if (teacherConflict) {
        throw new ConflictError('Teacher has another class at this time');
      }
    }

    // Check classroom conflict
    if (classroom) {
      const roomConflict = await prisma.schedule.findFirst({
        where: {
          tenantId,
          dayOfWeek,
          periodNumber,
          classroom,
        },
      });

      if (roomConflict) {
        throw new ConflictError('Classroom is already booked at this time');
      }
    }
  }

  // ==================== Enrollment ====================

  async enrollStudent(tenantId: string, offeringId: string, studentId: string) {
    // Validate offering
    const offering = await prisma.courseOffering.findFirst({
      where: { id: offeringId, tenantId },
    });

    if (!offering) {
      throw new NotFoundError('Course offering not found');
    }

    // Check enrollment limit
    if (offering.currentEnrollment >= offering.maxEnrollment) {
      throw new BadRequestError('Course is full');
    }

    // Check if already enrolled
    const existing = await prisma.$queryRaw<any[]>`
      SELECT 1 FROM class_students cs
      JOIN course_offerings co ON cs.class_id = co.id
      WHERE co.id = ${offeringId} AND cs.student_id = ${studentId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      throw new ConflictError('Student is already enrolled in this course');
    }

    // TODO: Check schedule conflicts

    // Enroll student (simplified - in reality would use an enrollments table)
    await prisma.courseOffering.update({
      where: { id: offeringId },
      data: {
        currentEnrollment: {
          increment: 1,
        },
      },
    });

    return {
      offeringId,
      studentId,
      enrolledAt: new Date(),
    };
  }

  async withdrawStudent(tenantId: string, offeringId: string, studentId: string) {
    // Validate offering
    const offering = await prisma.courseOffering.findFirst({
      where: { id: offeringId, tenantId },
    });

    if (!offering) {
      throw new NotFoundError('Course offering not found');
    }

    // Decrease enrollment
    await prisma.courseOffering.update({
      where: { id: offeringId },
      data: {
        currentEnrollment: {
          decrement: 1,
        },
      },
    });
  }
}
