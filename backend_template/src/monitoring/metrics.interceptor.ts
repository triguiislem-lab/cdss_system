import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const record = (statusOverride?: number) => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metrics.recordHttpRequest({
        method: request.method,
        route: this.routeLabel(request),
        status: statusOverride ?? response.statusCode,
        durationSeconds,
      });
    };

    return next.handle().pipe(
      tap({ complete: () => record() }),
      catchError((error: unknown) => {
        const status =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof error.status === 'number'
            ? error.status
            : 500;
        record(status);
        throw error;
      }),
    );
  }

  private routeLabel(request: Request) {
    const routePath = request.route?.path;
    const baseUrl = request.baseUrl || '';

    if (typeof routePath === 'string') {
      return `${baseUrl}${routePath}` || request.path || 'unknown';
    }

    return this.normalizePath(request.path || request.originalUrl || 'unknown');
  }

  private normalizePath(path: string) {
    return path
      .split('?')[0]
      .replace(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
        ':uuid',
      )
      .replace(/\b\d+\b/g, ':id');
  }
}
