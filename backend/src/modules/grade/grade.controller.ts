import { Request, Response, NextFunction } from 'express';
import { GradeService } from './grade.service';
import { BadRequestError } from '../../common/middleware/error-handler';

export class GradeController {
  private service = new GradeService();

  createGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const teacherId = req.user!.sub;
      const gradeData = req.body;

      const grade = await this.service.create(tenantId, {
        ...gradeData,
        gradedBy: teacherId,
      });

      res.status(201).json({
        success: true,
        data: grade,
      });
    } catch (error) {
      next(error);
    }
  };

  createBatchGrades = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const teacherId = req.user!.sub;
      const {
        courseOfferingId,
        assessmentType,
        assessmentName,
        maxScore,
        grades,
      } = req.body;

      if (!courseOfferingId || !assessmentType || !grades) {
        throw new BadRequestError('Missing required fields');
      }

      await this.service.createBatch(tenantId, {
        courseOfferingId,
        assessmentType,
        assessmentName,
        maxScore: maxScore || 100,
        grades,
        gradedBy: teacherId,
      });

      res.status(201).json({
        success: true,
        message: 'Grades created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const grade = await this.service.findById(tenantId, id);

      res.json({
        success: true,
        data: grade,
      });
    } catch (error) {
      next(error);
    }
  };

  updateGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const updateData = req.body;

      const grade = await this.service.update(tenantId, id, updateData);

      res.json({
        success: true,
        data: grade,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      await this.service.delete(tenantId, id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  getStudentGrades = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const tenantId = req.tenantId!;

      const grades = await this.service.getStudentGrades(tenantId, studentId);

      res.json({
        success: true,
        data: grades,
      });
    } catch (error) {
      next(error);
    }
  };

  getStudentCourseGrades = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId, offeringId } = req.params;
      const tenantId = req.tenantId!;

      const grades = await this.service.getStudentCourseGrades(
        tenantId,
        studentId,
        offeringId
      );

      res.json({
        success: true,
        data: grades,
      });
    } catch (error) {
      next(error);
    }
  };

  getStudentSemesterGrades = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { studentId, semesterId } = req.params;
      const tenantId = req.tenantId!;

      const result = await this.service.getStudentSemesterGrades(
        tenantId,
        studentId,
        semesterId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getCourseGrades = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const { assessmentType } = req.query;
      const tenantId = req.tenantId!;

      const grades = await this.service.getCourseGrades(
        tenantId,
        offeringId,
        assessmentType as string
      );

      res.json({
        success: true,
        data: grades,
      });
    } catch (error) {
      next(error);
    }
  };

  calculateFinalGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId, courseOfferingId } = req.body;
      const tenantId = req.tenantId!;

      if (!studentId || !courseOfferingId) {
        throw new BadRequestError('Student ID and course offering ID are required');
      }

      const finalGrade = await this.service.calculateFinalGrade(
        tenantId,
        studentId,
        courseOfferingId
      );

      res.json({
        success: true,
        data: finalGrade,
      });
    } catch (error) {
      next(error);
    }
  };

  calculateGPA = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const { semesterId } = req.body;
      const tenantId = req.tenantId!;

      if (!semesterId) {
        throw new BadRequestError('Semester ID is required');
      }

      const gpa = await this.service.calculateGPA(tenantId, studentId, semesterId);

      res.json({
        success: true,
        data: {
          studentId,
          semesterId,
          gpa: gpa.toFixed(2),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getCourseStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const tenantId = req.tenantId!;

      const stats = await this.service.getCourseStats(tenantId, offeringId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };
}
