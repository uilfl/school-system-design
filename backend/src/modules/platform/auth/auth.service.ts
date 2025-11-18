import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../database/client';
import {
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from '../../../common/middleware/error-handler';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId?: string;
}

export class AuthService {
  async login(email: string, password: string, tenantId?: string) {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenants: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    if (!user.passwordHash) {
      throw new UnauthorizedError('Password not set. Please use OAuth login.');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check user status
    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Select tenant
    const userTenants = user.tenants.map((ut) => ut.tenant);
    if (userTenants.length === 0) {
      throw new UnauthorizedError('No tenant assigned to user');
    }

    const selectedTenant =
      tenantId && userTenants.find((t) => t.id === tenantId)
        ? userTenants.find((t) => t.id === tenantId)!
        : userTenants[0];

    // Load roles and permissions
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId: user.id,
        tenantId: selectedTenant.id,
      },
      include: {
        role: true,
      },
    });

    const roles = userRoles.map((ur) => ur.role.name);
    const permissions = userRoles.flatMap((ur) => ur.role.permissions as string[]);

    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, user.email, selectedTenant.id, roles, permissions);
    const refreshToken = this.generateRefreshToken(user.id);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
      tenant: {
        id: selectedTenant.id,
        name: selectedTenant.name,
        subdomain: selectedTenant.subdomain,
      },
      roles,
    };
  }

  async register(data: RegisterData) {
    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new BadRequestError('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });

    // TODO: Send verification email
    // TODO: Assign default role
    // TODO: Link to tenant if provided

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as any;

      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      // Get user with latest data
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenants: {
            include: { tenant: true },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Get roles and permissions
      const selectedTenant = user.tenants[0]?.tenant;
      if (!selectedTenant) {
        throw new UnauthorizedError('No tenant assigned');
      }

      const userRoles = await prisma.userRole.findMany({
        where: {
          userId: user.id,
          tenantId: selectedTenant.id,
        },
        include: { role: true },
      });

      const roles = userRoles.map((ur) => ur.role.name);
      const permissions = userRoles.flatMap((ur) => ur.role.permissions as string[]);

      // Generate new access token
      const newAccessToken = this.generateAccessToken(
        user.id,
        user.email,
        selectedTenant.id,
        roles,
        permissions
      );

      return {
        accessToken: newAccessToken,
      };
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async logout(token: string) {
    // TODO: Add token to blacklist (Redis)
    // For now, just log it
    console.log('User logged out, token:', token.substring(0, 20) + '...');
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // TODO: Generate reset token and send email
    console.log('Password reset requested for:', email);
  }

  async resetPassword(token: string, newPassword: string) {
    // TODO: Verify reset token
    // TODO: Update password
    console.log('Password reset for token:', token);
  }

  private generateAccessToken(
    userId: string,
    email: string,
    tenantId: string,
    roles: string[],
    permissions: string[]
  ): string {
    return jwt.sign(
      {
        sub: userId,
        email,
        tenant_id: tenantId,
        roles,
        permissions,
        type: 'access',
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign(
      {
        sub: userId,
        type: 'refresh',
      },
      process.env.REFRESH_TOKEN_SECRET!,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
    );
  }
}
