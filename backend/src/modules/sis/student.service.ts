import { prisma } from '../../database/client';
import { NotFoundError, ConflictError } from '../../common/middleware/error-handler';

interface CreateStudentData {
  firstName: string;
  lastName: string;
  chineseName?: string;
  gender?: string;
  dateOfBirth?: Date;
  email?: string;
  phone?: string;
  address?: string;
  enrollmentDate?: Date;
}

interface UpdateStudentData {
  firstName?: string;
  lastName?: string;
  chineseName?: string;
  gender?: string;
  dateOfBirth?: Date;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
}

interface FindAllOptions {
  page: number;
  limit: number;
  filters: any;
}

export class StudentService {
  async findAll(tenantId: string, options: FindAllOptions) {
    const { page, limit, filters } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      deletedAt: null,
    };

    // Apply filters
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { studentNumber: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.student.count({ where }),
    ]);

    return {
      data: students,
      pagination: {
        current_page: page,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1,
      },
    };
  }

  async findById(tenantId: string, id: string) {
    const student = await prisma.student.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            avatarUrl: true,
          },
        },
        parents: {
          include: {
            parent: true,
          },
        },
        classes: {
          where: { leftAt: null },
          include: {
            class: {
              include: {
                grade: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    return student;
  }

  async create(tenantId: string, data: CreateStudentData) {
    // Generate student number
    const studentNumber = await this.generateStudentNumber(tenantId);

    // Check email uniqueness if provided
    if (data.email) {
      const existing = await prisma.student.findFirst({
        where: {
          tenantId,
          email: data.email,
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictError('Email already exists');
      }
    }

    const student = await prisma.student.create({
      data: {
        tenantId,
        studentNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        chineseName: data.chineseName,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        email: data.email,
        phone: data.phone,
        address: data.address,
        enrollmentDate: data.enrollmentDate || new Date(),
        status: 'active',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    // TODO: Emit event 'student.created'
    // TODO: Create user account if email is provided

    return student;
  }

  async update(tenantId: string, id: string, data: UpdateStudentData) {
    // Check if student exists
    const existing = await this.findById(tenantId, id);

    // Check email uniqueness if changing
    if (data.email && data.email !== existing.email) {
      const duplicate = await prisma.student.findFirst({
        where: {
          tenantId,
          email: data.email,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictError('Email already exists');
      }
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        chineseName: data.chineseName,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        email: data.email,
        phone: data.phone,
        address: data.address,
        status: data.status,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    // TODO: Emit event 'student.updated'

    return student;
  }

  async delete(tenantId: string, id: string) {
    // Check if student exists
    await this.findById(tenantId, id);

    // Soft delete
    await prisma.student.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    // TODO: Emit event 'student.deleted'
  }

  private async generateStudentNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = String(year).slice(-2);

    // Count students in current year
    const count = await prisma.student.count({
      where: {
        tenantId,
        studentNumber: {
          startsWith: prefix,
        },
      },
    });

    const sequence = String(count + 1).padStart(5, '0');
    return `${prefix}${sequence}`;
  }
}
