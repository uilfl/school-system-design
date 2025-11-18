import { Router } from 'express';
import authRoutes from '../modules/platform/auth/auth.routes';
import studentRoutes from '../modules/sis/student.routes';

const router = Router();

// Platform routes
router.use('/auth', authRoutes);

// SIS routes
router.use('/students', studentRoutes);

// TODO: Add more routes
// router.use('/courses', courseRoutes);
// router.use('/attendance', attendanceRoutes);
// router.use('/grades', gradeRoutes);

export default router;
