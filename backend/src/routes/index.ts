import { Router } from 'express';
import authRoutes from '../modules/platform/auth/auth.routes';
import studentRoutes from '../modules/sis/student.routes';
import courseRoutes from '../modules/course/course.routes';
import attendanceRoutes from '../modules/attendance/attendance.routes';
import gradeRoutes from '../modules/grade/grade.routes';

const router = Router();

// Platform routes
router.use('/auth', authRoutes);

// SIS routes
router.use('/students', studentRoutes);

// Course management routes
router.use('/courses', courseRoutes);

// Attendance routes
router.use('/attendance', attendanceRoutes);

// Grade routes
router.use('/grades', gradeRoutes);

export default router;
