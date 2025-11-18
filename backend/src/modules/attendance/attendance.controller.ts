import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';
import { BadRequestError } from '../../common/middleware/error-handler';

export class AttendanceController {
  private service = new AttendanceService();

  markBatchAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const teacherId = req.user!.sub;
      const {
        courseOfferingId,
        attendanceDate,
        periodNumber,
        records,
      } = req.body;

      if (!courseOfferingId || !attendanceDate || !records) {
        throw new BadRequestError('Missing required fields');
      }

      await this.service.markBatchAttendance({
        tenantId,
        courseOfferingId,
        attendanceDate,
        periodNumber,
        records,
        teacherId,
      });

      res.status(201).json({
        success: true,
        message: 'Attendance marked successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  markAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const teacherId = req.user!.sub;
      const attendanceData = req.body;

      const record = await this.service.markAttendance(tenantId, {
        ...attendanceData,
        recordedBy: teacherId,
      });

      res.status(201).json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  };

  getAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const record = await this.service.findById(tenantId, id);

      res.json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  };

  updateAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const updateData = req.body;

      const record = await this.service.update(tenantId, id, updateData);

      res.json({
        success: true,
        data: record,
      });
    } catch (error) {
      next(error);
    }
  };

  getStudentAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const { startDate, endDate, status } = req.query;
      const tenantId = req.tenantId!;

      const records = await this.service.getStudentAttendance(tenantId, studentId, {
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });

      res.json({
        success: true,
        data: records,
      });
    } catch (error) {
      next(error);
    }
  };

  getClassAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const { date } = req.query;
      const tenantId = req.tenantId!;

      const records = await this.service.getClassAttendance(
        tenantId,
        classId,
        date as string
      );

      res.json({
        success: true,
        data: records,
      });
    } catch (error) {
      next(error);
    }
  };

  getCourseAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const { date } = req.query;
      const tenantId = req.tenantId!;

      const records = await this.service.getCourseAttendance(
        tenantId,
        offeringId,
        date as string
      );

      res.json({
        success: true,
        data: records,
      });
    } catch (error) {
      next(error);
    }
  };

  generateQRSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseOfferingId, periodNumber, validMinutes } = req.body;
      const tenantId = req.tenantId!;

      if (!courseOfferingId || !periodNumber) {
        throw new BadRequestError('Course offering ID and period number are required');
      }

      const session = await this.service.generateQRSession(
        tenantId,
        courseOfferingId,
        periodNumber,
        validMinutes || 5
      );

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  };

  checkInWithQR = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { qrToken } = req.body;
      const studentId = req.user!.sub;
      const tenantId = req.tenantId!;

      if (!qrToken) {
        throw new BadRequestError('QR token is required');
      }

      await this.service.checkInWithQR(tenantId, qrToken, studentId);

      res.json({
        success: true,
        message: 'Check-in successful',
      });
    } catch (error) {
      next(error);
    }
  };

  getStudentStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const { startDate, endDate } = req.query;
      const tenantId = req.tenantId!;

      const stats = await this.service.getStudentStats(tenantId, studentId, {
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };
}
