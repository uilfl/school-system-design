import { Router } from 'express';
import { GradeController } from './grade.controller';
import { authenticate, authorize } from '../../common/middleware/auth';

const router = Router();
const controller = new GradeController();

// All routes require authentication
router.use(authenticate);

// Grade records
router.post('/', authorize('grade.write'), controller.createGrade);
router.post('/batch', authorize('grade.write'), controller.createBatchGrades);
router.get('/:id', authorize('grade.read'), controller.getGrade);
router.patch('/:id', authorize('grade.write'), controller.updateGrade);
router.delete('/:id', authorize('grade.delete'), controller.deleteGrade);

// Student grades
router.get(
  '/student/:studentId',
  authorize('grade.read'),
  controller.getStudentGrades
);

router.get(
  '/student/:studentId/course/:offeringId',
  authorize('grade.read'),
  controller.getStudentCourseGrades
);

router.get(
  '/student/:studentId/semester/:semesterId',
  authorize('grade.read'),
  controller.getStudentSemesterGrades
);

// Course grades
router.get(
  '/course/:offeringId',
  authorize('grade.read'),
  controller.getCourseGrades
);

// Grade calculation
router.post(
  '/calculate/final',
  authorize('grade.write'),
  controller.calculateFinalGrade
);

router.post(
  '/calculate/gpa/:studentId',
  authorize('grade.read'),
  controller.calculateGPA
);

// Grade statistics
router.get(
  '/stats/course/:offeringId',
  authorize('grade.read'),
  controller.getCourseStats
);

export default router;
