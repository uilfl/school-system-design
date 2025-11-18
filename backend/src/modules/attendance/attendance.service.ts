import crypto from 'crypto';
import { prisma } from '../../database/client';
import {
  NotFoundError,
  BadRequestError,
} from '../../common/middleware/error-handler';

interface BatchAttendanceInput {
  tenantId: string;
  courseOfferingId: string;
  attendanceDate: string;
  periodNumber?: number;
  records: Array<{
    studentId: string;
    status: string;
    notes?: string;
  }>;
  teacherId: string;
}

interface MarkAttendanceInput {
  studentId: string;
  courseOfferingId?: string;
  attendanceDate: string;
  periodNumber?: number;
  status: string;
  notes?: string;
  recordedBy: string;
}

export class AttendanceService {
  // ==================== Mark Attendance ====================

  async markBatchAttendance(data: BatchAttendanceInput) {
    const { tenantId, courseOfferingId, attendanceDate, periodNumber, records, teacherId } =
      data;

    // Get enrolled students for the course
    const offering = await prisma.courseOffering.findFirst({
      where: { id: courseOfferingId, tenantId },
    });

    if (!offering) {
      throw new NotFoundError('Course offering not found');
    }

    // Create attendance records
    const attendanceRecords = records.map((record) => ({
      tenantId,
      studentId: record.studentId,
      courseOfferingId,
      attendanceDate: new Date(attendanceDate),
      periodNumber,
      status: record.status,
      notes: record.notes,
      recordedBy: teacherId,
      recordedAt: new Date(),
    }));

    await prisma.attendanceRecord.createMany({
      data: attendanceRecords,
      skipDuplicates: true,
    });

    // Check for absent alerts
    await this.checkAbsentAlerts(
      records.filter((r) => r.status === 'absent').map((r) => r.studentId)
    );
  }

  async markAttendance(tenantId: string, data: MarkAttendanceInput) {
    const record = await prisma.attendanceRecord.create({
      data: {
        tenantId,
        studentId: data.studentId,
        courseOfferingId: data.courseOfferingId,
        attendanceDate: new Date(data.attendanceDate),
        periodNumber: data.periodNumber,
        status: data.status,
        notes: data.notes,
        recordedBy: data.recordedBy,
        recordedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
      },
    });

    return record;
  }

  async findById(tenantId: string, id: string) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundError('Attendance record not found');
    }

    return record;
  }

  async update(tenantId: string, id: string, data: Partial<MarkAttendanceInput>) {
    // Check if record exists
    await this.findById(tenantId, id);

    const record = await prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        updatedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return record;
  }

  // ==================== Query Attendance ====================

  async getStudentAttendance(
    tenantId: string,
    studentId: string,
    options: { startDate?: string; endDate?: string; status?: string }
  ) {
    const where: any = {
      tenantId,
      studentId,
    };

    if (options.startDate || options.endDate) {
      where.attendanceDate = {};
      if (options.startDate) {
        where.attendanceDate.gte = new Date(options.startDate);
      }
      if (options.endDate) {
        where.attendanceDate.lte = new Date(options.endDate);
      }
    }

    if (options.status) {
      where.status = options.status;
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
      orderBy: { attendanceDate: 'desc' },
    });

    return records;
  }

  async getClassAttendance(tenantId: string, classId: string, date: string) {
    // Get students in class
    const classStudents = await prisma.classStudent.findMany({
      where: {
        classId,
        leftAt: null,
      },
      include: {
        student: true,
      },
    });

    const studentIds = classStudents.map((cs) => cs.studentId);

    // Get attendance records for this date
    const records = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        attendanceDate: new Date(date),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
      },
      orderBy: { periodNumber: 'asc' },
    });

    return {
      date,
      totalStudents: studentIds.length,
      records,
    };
  }

  async getCourseAttendance(tenantId: string, offeringId: string, date: string) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        tenantId,
        courseOfferingId: offeringId,
        attendanceDate: new Date(date),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
      },
      orderBy: { recordedAt: 'desc' },
    });

    const stats = {
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      late: records.filter((r) => r.status === 'late').length,
      excused: records.filter((r) => r.status === 'excused').length,
    };

    return {
      date,
      stats,
      records,
    };
  }

  // ==================== QR Code Check-in ====================

  async generateQRSession(
    tenantId: string,
    courseOfferingId: string,
    periodNumber: number,
    validMinutes: number
  ) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + validMinutes * 60 * 1000;

    const sessionData = {
      tenantId,
      courseOfferingId,
      periodNumber,
      date: new Date().toISOString().split('T')[0],
      expiresAt,
    };

    // Store in Redis (simplified - would use actual Redis)
    // await redis.setex(`qr:${token}`, validMinutes * 60, JSON.stringify(sessionData));

    return {
      token,
      qrData: `school-saas://checkin/${token}`,
      expiresAt: new Date(expiresAt),
      validMinutes,
    };
  }

  async checkInWithQR(tenantId: string, qrToken: string, studentId: string) {
    // Validate QR token (simplified)
    // const sessionData = await redis.get(`qr:${qrToken}`);
    // if (!sessionData) {
    //   throw new BadRequestError('QR code expired or invalid');
    // }

    // For now, just create attendance record
    const today = new Date().toISOString().split('T')[0];

    // Find course offering from token (simplified)
    // In reality, would decode from Redis session
    throw new BadRequestError('QR check-in temporarily unavailable');

    // await this.markAttendance(tenantId, {
    //   studentId,
    //   courseOfferingId: session.courseOfferingId,
    //   attendanceDate: today,
    //   periodNumber: session.periodNumber,
    //   status: 'present',
    //   recordedBy: studentId,
    // });
  }

  // ==================== Statistics ====================

  async getStudentStats(
    tenantId: string,
    studentId: string,
    options: { startDate?: string; endDate?: string }
  ) {
    const where: any = {
      tenantId,
      studentId,
    };

    if (options.startDate || options.endDate) {
      where.attendanceDate = {};
      if (options.startDate) {
        where.attendanceDate.gte = new Date(options.startDate);
      }
      if (options.endDate) {
        where.attendanceDate.lte = new Date(options.endDate);
      }
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
    });

    const stats = {
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      late: records.filter((r) => r.status === 'late').length,
      excused: records.filter((r) => r.status === 'excused').length,
      sick: records.filter((r) => r.status === 'sick').length,
    };

    const attendanceRate =
      stats.total > 0
        ? ((stats.present + stats.late) / stats.total) * 100
        : 0;

    return {
      ...stats,
      attendanceRate: attendanceRate.toFixed(2),
      period: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    };
  }

  // ==================== Alerts ====================

  private async checkAbsentAlerts(studentIds: string[]) {
    // Check for students with excessive absences
    const threshold = 3; // 3 absences in 30 days triggers alert

    for (const studentId of studentIds) {
      const recentAbsences = await prisma.attendanceRecord.count({
        where: {
          studentId,
          status: 'absent',
          attendanceDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      });

      if (recentAbsences >= threshold) {
        // TODO: Send notification to parents and homeroom teacher
        console.log(`Alert: Student ${studentId} has ${recentAbsences} absences in 30 days`);
      }
    }
  }
}
