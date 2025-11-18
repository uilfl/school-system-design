import { Router } from 'express';
import { CourseController } from './course.controller';
import { authenticate, authorize } from '../../common/middleware/auth';

const router = Router();
const controller = new CourseController();

// All routes require authentication
router.use(authenticate);

// Course routes
router.get('/', authorize('course.read'), controller.getCourses);
router.post('/', authorize('course.write'), controller.createCourse);
router.get('/:id', authorize('course.read'), controller.getCourse);
router.patch('/:id', authorize('course.write'), controller.updateCourse);
router.delete('/:id', authorize('course.delete'), controller.deleteCourse);

// Course offerings (開課)
router.get('/:id/offerings', authorize('course.read'), controller.getCourseOfferings);
router.post('/:id/offerings', authorize('course.write'), controller.createOffering);

// Schedules (課表)
router.get('/offerings/:offeringId/schedules', authorize('course.read'), controller.getSchedules);
router.post('/offerings/:offeringId/schedules', authorize('course.write'), controller.createSchedule);

// Enrollment (選課)
router.post('/offerings/:offeringId/enroll', authorize('student.enroll'), controller.enrollStudent);
router.delete('/offerings/:offeringId/withdraw', authorize('student.enroll'), controller.withdrawStudent);

export default router;
