import { Injectable } from '@nestjs/common';

type RequestMetricKey = {
  method: string;
  route: string;
  status: number;
};

type RequestMetric = RequestMetricKey & {
  count: number;
  sumSeconds: number;
  buckets: Map<number, number>;
};

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly requests = new Map<string, RequestMetric>();

  recordHttpRequest(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }) {
    const key = this.metricKey(input);
    const metric =
      this.requests.get(key) ??
      {
        method: input.method,
        route: input.route,
        status: input.status,
        count: 0,
        sumSeconds: 0,
        buckets: new Map(this.buckets.map((bucket) => [bucket, 0])),
      };

    metric.count += 1;
    metric.sumSeconds += input.durationSeconds;
    for (const bucket of this.buckets) {
      if (input.durationSeconds <= bucket) {
        metric.buckets.set(bucket, (metric.buckets.get(bucket) ?? 0) + 1);
      }
    }

    this.requests.set(key, metric);
  }

  renderPrometheus() {
    const memory = process.memoryUsage();
    const lines = [
      '# HELP medcity_api_info MedCity NestJS API information.',
      '# TYPE medcity_api_info gauge',
      'medcity_api_info{service="medcity-connect-api"} 1',
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime().toFixed(3)}`,
      '# HELP medcity_api_start_time_seconds Process start time as Unix seconds.',
      '# TYPE medcity_api_start_time_seconds gauge',
      `medcity_api_start_time_seconds ${(this.startedAt / 1000).toFixed(3)}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memory.rss}`,
      '# HELP nodejs_heap_size_used_bytes Node.js used heap size in bytes.',
      '# TYPE nodejs_heap_size_used_bytes gauge',
      `nodejs_heap_size_used_bytes ${memory.heapUsed}`,
      '# HELP nodejs_heap_size_total_bytes Node.js total heap size in bytes.',
      '# TYPE nodejs_heap_size_total_bytes gauge',
      `nodejs_heap_size_total_bytes ${memory.heapTotal}`,
      '# HELP medcity_http_requests_total Total HTTP requests handled by NestJS.',
      '# TYPE medcity_http_requests_total counter',
    ];

    for (const metric of this.requests.values()) {
      const labels = this.labels(metric);
      lines.push(`medcity_http_requests_total${labels} ${metric.count}`);
    }

    lines.push(
      '# HELP medcity_http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE medcity_http_request_duration_seconds histogram',
    );

    for (const metric of this.requests.values()) {
      let cumulative = 0;
      for (const bucket of this.buckets) {
        cumulative = metric.buckets.get(bucket) ?? cumulative;
        lines.push(
          `medcity_http_request_duration_seconds_bucket${this.labels(metric, {
            le: String(bucket),
          })} ${cumulative}`,
        );
      }
      lines.push(
        `medcity_http_request_duration_seconds_bucket${this.labels(metric, {
          le: '+Inf',
        })} ${metric.count}`,
      );
      lines.push(
        `medcity_http_request_duration_seconds_sum${this.labels(metric)} ${metric.sumSeconds.toFixed(6)}`,
      );
      lines.push(
        `medcity_http_request_duration_seconds_count${this.labels(metric)} ${metric.count}`,
      );
    }

    return `${lines.join('\n')}\n`;
  }

  private metricKey(input: RequestMetricKey) {
    return `${input.method}|${input.route}|${input.status}`;
  }

  private labels(metric: RequestMetricKey, extra: Record<string, string> = {}) {
    const labels = {
      method: metric.method,
      route: metric.route,
      status: String(metric.status),
      ...extra,
    };
    return `{${Object.entries(labels)
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',')}}`;
  }

  private escapeLabel(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
