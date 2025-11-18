import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'School SaaS API',
      version: '1.0.0',
      description: '學校管理 SaaS 平台 API 文檔',
      contact: {
        name: 'API Support',
        email: 'support@school-saas.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
      {
        url: 'https://api.school-saas.com/api/v1',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        tenantId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Tenant-ID',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
        tenantId: [],
      },
    ],
  },
  apis: [
    './src/modules/**/*.routes.ts',
    './src/modules/**/*.controller.ts',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'School SaaS API Docs',
  }));

  app.get('/api/v1/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
