import { Request, Response, NextFunction } from 'express';
import { StudentService } from './student.service';
import { BadRequestError } from '../../common/middleware/error-handler';

export class StudentController {
  private service = new StudentService();

  getStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = '1', limit = '20', ...filters } = req.query;
      const tenantId = req.tenantId!;

      const result = await this.service.findAll(tenantId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        filters,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  getStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const student = await this.service.findById(tenantId, id);

      res.json({
        success: true,
        data: student,
      });
    } catch (error) {
      next(error);
    }
  };

  createStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const studentData = req.body;

      const student = await this.service.create(tenantId, studentData);

      res.status(201).json({
        success: true,
        data: student,
      });
    } catch (error) {
      next(error);
    }
  };

  updateStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const updateData = req.body;

      const student = await this.service.update(tenantId, id, updateData);

      res.json({
        success: true,
        data: student,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      await this.service.delete(tenantId, id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
