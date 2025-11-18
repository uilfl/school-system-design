import { Router } from 'express';
import { StudentController } from './student.controller';
import { authenticate, authorize } from '../../common/middleware/auth';

const router = Router();
const controller = new StudentController();

// All routes require authentication
router.use(authenticate);

router.get('/', authorize('student.read'), controller.getStudents);
router.post('/', authorize('student.write'), controller.createStudent);
router.get('/:id', authorize('student.read'), controller.getStudent);
router.patch('/:id', authorize('student.write'), controller.updateStudent);
router.delete('/:id', authorize('student.delete'), controller.deleteStudent);

export default router;
