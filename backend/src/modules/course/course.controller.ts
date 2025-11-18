import { Request, Response, NextFunction } from 'express';
import { CourseService } from './course.service';
import { BadRequestError } from '../../common/middleware/error-handler';

export class CourseController {
  private service = new CourseService();

  getCourses = async (req: Request, res: Response, next: NextFunction) => {
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

  getCourse = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const course = await this.service.findById(tenantId, id);

      res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  };

  createCourse = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const courseData = req.body;

      const course = await this.service.create(tenantId, courseData);

      res.status(201).json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  };

  updateCourse = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const updateData = req.body;

      const course = await this.service.update(tenantId, id, updateData);

      res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteCourse = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      await this.service.delete(tenantId, id);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  getCourseOfferings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const { semesterId } = req.query;

      const offerings = await this.service.getOfferings(
        tenantId,
        id,
        semesterId as string
      );

      res.json({
        success: true,
        data: offerings,
      });
    } catch (error) {
      next(error);
    }
  };

  createOffering = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const offeringData = req.body;

      const offering = await this.service.createOffering(tenantId, id, offeringData);

      res.status(201).json({
        success: true,
        data: offering,
      });
    } catch (error) {
      next(error);
    }
  };

  getSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const tenantId = req.tenantId!;

      const schedules = await this.service.getSchedules(tenantId, offeringId);

      res.json({
        success: true,
        data: schedules,
      });
    } catch (error) {
      next(error);
    }
  };

  createSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const tenantId = req.tenantId!;
      const scheduleData = req.body;

      const schedule = await this.service.createSchedule(
        tenantId,
        offeringId,
        scheduleData
      );

      res.status(201).json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  };

  enrollStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const { studentId } = req.body;
      const tenantId = req.tenantId!;

      if (!studentId) {
        throw new BadRequestError('Student ID is required');
      }

      const enrollment = await this.service.enrollStudent(
        tenantId,
        offeringId,
        studentId
      );

      res.status(201).json({
        success: true,
        data: enrollment,
        message: 'Successfully enrolled in course',
      });
    } catch (error) {
      next(error);
    }
  };

  withdrawStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offeringId } = req.params;
      const { studentId } = req.body;
      const tenantId = req.tenantId!;

      if (!studentId) {
        throw new BadRequestError('Student ID is required');
      }

      await this.service.withdrawStudent(tenantId, offeringId, studentId);

      res.json({
        success: true,
        message: 'Successfully withdrawn from course',
      });
    } catch (error) {
      next(error);
    }
  };
}
