import { Router } from 'express';
import { AttendanceController } from './attendance.controller';
import { authenticate, authorize } from '../../common/middleware/auth';

const router = Router();
const controller = new AttendanceController();

// All routes require authentication
router.use(authenticate);

// Batch attendance marking (for teachers)
router.post('/batch', authorize('attendance.write'), controller.markBatchAttendance);

// Single attendance record
router.post('/', authorize('attendance.write'), controller.markAttendance);
router.get('/:id', authorize('attendance.read'), controller.getAttendance);
router.patch('/:id', authorize('attendance.write'), controller.updateAttendance);

// Student attendance records
router.get(
  '/student/:studentId',
  authorize('attendance.read'),
  controller.getStudentAttendance
);

// Class attendance records
router.get(
  '/class/:classId',
  authorize('attendance.read'),
  controller.getClassAttendance
);

// Course attendance records
router.get(
  '/course/:offeringId',
  authorize('attendance.read'),
  controller.getCourseAttendance
);

// QR Code check-in
router.post('/qr/generate', authorize('attendance.write'), controller.generateQRSession);
router.post('/qr/checkin', authenticate, controller.checkInWithQR);

// Attendance statistics
router.get(
  '/stats/student/:studentId',
  authorize('attendance.read'),
  controller.getStudentStats
);

export default router;
