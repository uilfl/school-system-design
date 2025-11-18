import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from './error-handler';
import { prisma } from '../../database/client';

interface JWTPayload {
  sub: string;
  email: string;
  tenant_id: string;
  roles: string[];
  permissions: string[];
  type: 'access' | 'refresh';
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      tenantId?: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JWTPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Attach user to request
    req.user = payload;
    req.tenantId = payload.tenant_id;

    // Set PostgreSQL session variable for RLS
    await prisma.$executeRawUnsafe(
      `SET LOCAL app.current_tenant = '${payload.tenant_id}'`
    );

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};

export const authorize = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return next(new UnauthorizedError());
    }

    // System admin has all permissions
    if (user.permissions.includes('*')) {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some((permission) =>
      checkPermission(user.permissions, permission)
    );

    if (!hasPermission) {
      return next(
        new ForbiddenError(
          `Missing required permission: ${requiredPermissions.join(' or ')}`
        )
      );
    }

    next();
  };
};

function checkPermission(userPermissions: string[], requiredPermission: string): boolean {
  // Exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Wildcard match (e.g., student.* matches student.read)
  return userPermissions.some((permission) => {
    const pattern = permission.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requiredPermission);
  });
}

export const tenantContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;

  if (!tenantId) {
    return next(new BadRequestError('Tenant ID is required'));
  }

  req.tenantId = tenantId;
  next();
};
