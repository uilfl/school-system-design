import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../database/client';
import { NotFoundError } from '../../common/middleware/error-handler';

interface CreateGradeInput {
  studentId: string;
  courseOfferingId: string;
  assessmentType: string;
  assessmentName?: string;
  score: number;
  maxScore?: number;
  notes?: string;
  gradedBy: string;
}

interface BatchGradesInput {
  courseOfferingId: string;
  assessmentType: string;
  assessmentName: string;
  maxScore: number;
  grades: Array<{
    studentId: string;
    score: number;
  }>;
  gradedBy: string;
}

export class GradeService {
  // ==================== CRUD Operations ====================

  async create(tenantId: string, data: CreateGradeInput) {
    const maxScore = data.maxScore || 100;
    const percentage = (data.score / maxScore) * 100;
    const gradeLetter = this.convertToGradeLetter(percentage);
    const passed = percentage >= 60;

    const grade = await prisma.gradeRecord.create({
      data: {
        tenantId,
        studentId: data.studentId,
        courseOfferingId: data.courseOfferingId,
        assessmentType: data.assessmentType,
        assessmentName: data.assessmentName,
        score: new Decimal(data.score),
        maxScore: new Decimal(maxScore),
        percentage: new Decimal(percentage),
        gradeLetter,
        passed,
        notes: data.notes,
        gradedBy: data.gradedBy,
        gradedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    return grade;
  }

  async createBatch(tenantId: string, data: BatchGradesInput) {
    const gradeRecords = data.grades.map((grade) => {
      const percentage = (grade.score / data.maxScore) * 100;
      return {
        tenantId,
        studentId: grade.studentId,
        courseOfferingId: data.courseOfferingId,
        assessmentType: data.assessmentType,
        assessmentName: data.assessmentName,
        score: new Decimal(grade.score),
        maxScore: new Decimal(data.maxScore),
        percentage: new Decimal(percentage),
        gradeLetter: this.convertToGradeLetter(percentage),
        passed: percentage >= 60,
        gradedBy: data.gradedBy,
        gradedAt: new Date(),
      };
    });

    await prisma.gradeRecord.createMany({
      data: gradeRecords,
      skipDuplicates: true,
    });
  }

  async findById(tenantId: string, id: string) {
    const grade = await prisma.gradeRecord.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    if (!grade) {
      throw new NotFoundError('Grade record not found');
    }

    return grade;
  }

  async update(tenantId: string, id: string, data: Partial<CreateGradeInput>) {
    await this.findById(tenantId, id);

    let percentage: number | undefined;
    let gradeLetter: string | undefined;
    let passed: boolean | undefined;

    if (data.score !== undefined) {
      const existing = await prisma.gradeRecord.findFirst({
        where: { id },
      });
      const maxScore = data.maxScore || Number(existing!.maxScore);
      percentage = (data.score / maxScore) * 100;
      gradeLetter = this.convertToGradeLetter(percentage);
      passed = percentage >= 60;
    }

    const grade = await prisma.gradeRecord.update({
      where: { id },
      data: {
        score: data.score !== undefined ? new Decimal(data.score) : undefined,
        maxScore: data.maxScore !== undefined ? new Decimal(data.maxScore) : undefined,
        percentage: percentage !== undefined ? new Decimal(percentage) : undefined,
        gradeLetter,
        passed,
        notes: data.notes,
        updatedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return grade;
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    await prisma.gradeRecord.delete({
      where: { id },
    });
  }

  // ==================== Query Grades ====================

  async getStudentGrades(tenantId: string, studentId: string) {
    const grades = await prisma.gradeRecord.findMany({
      where: {
        tenantId,
        studentId,
      },
      include: {
        courseOffering: {
          include: {
            course: true,
            semester: true,
          },
        },
      },
      orderBy: [{ gradedAt: 'desc' }],
    });

    return grades;
  }

  async getStudentCourseGrades(
    tenantId: string,
    studentId: string,
    courseOfferingId: string
  ) {
    const grades = await prisma.gradeRecord.findMany({
      where: {
        tenantId,
        studentId,
        courseOfferingId,
      },
      orderBy: { gradedAt: 'asc' },
    });

    return grades;
  }

  async getStudentSemesterGrades(
    tenantId: string,
    studentId: string,
    semesterId: string
  ) {
    const grades = await prisma.gradeRecord.findMany({
      where: {
        tenantId,
        studentId,
        courseOffering: {
          semesterId,
        },
      },
      include: {
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    // Group by course
    const courseGrades: Record<string, any> = {};

    for (const grade of grades) {
      const courseId = grade.courseOffering.courseId;

      if (!courseGrades[courseId]) {
        courseGrades[courseId] = {
          course: grade.courseOffering.course,
          assessments: [],
          finalGrade: null,
        };
      }

      courseGrades[courseId].assessments.push({
        type: grade.assessmentType,
        name: grade.assessmentName,
        score: Number(grade.score),
        maxScore: Number(grade.maxScore),
        percentage: Number(grade.percentage),
        gradeLetter: grade.gradeLetter,
      });
    }

    // Calculate final grades for each course
    for (const courseId in courseGrades) {
      const finalGrade = await this.calculateFinalGrade(
        tenantId,
        studentId,
        courseGrades[courseId].course.id
      );
      courseGrades[courseId].finalGrade = finalGrade;
    }

    // Calculate GPA
    const gpa = await this.calculateGPA(tenantId, studentId, semesterId);

    return {
      courses: Object.values(courseGrades),
      gpa: gpa.toFixed(2),
    };
  }

  async getCourseGrades(tenantId: string, offeringId: string, assessmentType?: string) {
    const where: any = {
      tenantId,
      courseOfferingId: offeringId,
    };

    if (assessmentType) {
      where.assessmentType = assessmentType;
    }

    const grades = await prisma.gradeRecord.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentNumber: true,
          },
        },
      },
      orderBy: [{ studentId: 'asc' }, { gradedAt: 'asc' }],
    });

    return grades;
  }

  // ==================== Grade Calculation ====================

  async calculateFinalGrade(tenantId: string, studentId: string, courseOfferingId: string) {
    const grades = await this.getStudentCourseGrades(tenantId, studentId, courseOfferingId);

    if (grades.length === 0) {
      return {
        studentId,
        courseOfferingId,
        finalScore: 0,
        gradeLetter: 'F',
        passed: false,
      };
    }

    // Grading rule (simplified - should be configurable per course)
    const weights: Record<string, number> = {
      assignment: 0.2,
      quiz: 0.1,
      midterm: 0.3,
      final: 0.4,
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Group grades by type and calculate average
    const gradesByType: Record<string, number[]> = {};

    for (const grade of grades) {
      if (!gradesByType[grade.assessmentType]) {
        gradesByType[grade.assessmentType] = [];
      }
      gradesByType[grade.assessmentType].push(Number(grade.percentage));
    }

    // Calculate weighted average
    for (const [type, scores] of Object.entries(gradesByType)) {
      const weight = weights[type] || 0;
      if (weight > 0) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        totalScore += avgScore * weight;
        totalWeight += weight;
      }
    }

    const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const gradeLetter = this.convertToGradeLetter(finalScore);
    const passed = finalScore >= 60;

    return {
      studentId,
      courseOfferingId,
      finalScore: finalScore.toFixed(2),
      gradeLetter,
      passed,
      breakdown: gradesByType,
    };
  }

  async calculateGPA(tenantId: string, studentId: string, semesterId: string): Promise<number> {
    const grades = await prisma.gradeRecord.findMany({
      where: {
        tenantId,
        studentId,
        courseOffering: {
          semesterId,
        },
      },
      include: {
        courseOffering: {
          include: {
            course: true,
          },
        },
      },
    });

    // Group by course and calculate final grades
    const courseGrades: Record<string, { credits: number; grade: number }> = {};

    for (const grade of grades) {
      const courseId = grade.courseOffering.courseId;

      if (!courseGrades[courseId]) {
        const finalGrade = await this.calculateFinalGrade(
          tenantId,
          studentId,
          grade.courseOfferingId
        );

        courseGrades[courseId] = {
          credits: Number(grade.courseOffering.course.credits),
          grade: this.letterToGradePoint(finalGrade.gradeLetter),
        };
      }
    }

    // Calculate GPA
    let totalGradePoints = 0;
    let totalCredits = 0;

    for (const { credits, grade } of Object.values(courseGrades)) {
      totalGradePoints += grade * credits;
      totalCredits += credits;
    }

    return totalCredits > 0 ? totalGradePoints / totalCredits : 0;
  }

  // ==================== Statistics ====================

  async getCourseStats(tenantId: string, offeringId: string) {
    const grades = await prisma.gradeRecord.findMany({
      where: {
        tenantId,
        courseOfferingId: offeringId,
      },
    });

    if (grades.length === 0) {
      return {
        totalStudents: 0,
        average: 0,
        median: 0,
        highest: 0,
        lowest: 0,
        passRate: 0,
        distribution: {},
      };
    }

    const scores = grades.map((g) => Number(g.percentage)).sort((a, b) => a - b);

    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median = scores[Math.floor(scores.length / 2)];
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passCount = scores.filter((s) => s >= 60).length;
    const passRate = (passCount / scores.length) * 100;

    // Grade distribution
    const distribution: Record<string, number> = {
      'A+': 0,
      A: 0,
      'B+': 0,
      B: 0,
      'C+': 0,
      C: 0,
      D: 0,
      F: 0,
    };

    for (const score of scores) {
      const letter = this.convertToGradeLetter(score);
      distribution[letter]++;
    }

    return {
      totalStudents: grades.length,
      average: average.toFixed(2),
      median: median.toFixed(2),
      highest: highest.toFixed(2),
      lowest: lowest.toFixed(2),
      passRate: passRate.toFixed(2),
      distribution,
    };
  }

  // ==================== Helper Functions ====================

  private convertToGradeLetter(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'B+';
    if (percentage >= 75) return 'B';
    if (percentage >= 70) return 'C+';
    if (percentage >= 65) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }

  private letterToGradePoint(letter: string): number {
    const mapping: Record<string, number> = {
      'A+': 4.3,
      A: 4.0,
      'A-': 3.7,
      'B+': 3.3,
      B: 3.0,
      'B-': 2.7,
      'C+': 2.3,
      C: 2.0,
      'C-': 1.7,
      D: 1.0,
      F: 0.0,
    };
    return mapping[letter] || 0;
  }
}
