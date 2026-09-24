import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';

export type Status = 'ok' | 'down';

export interface HealthReport {
  api: Status;
  redis: Status;
  postgres: Status;
}

// A check slower than this counts as down. Health must answer quickly even when a
// dependency hangs, or a load balancer probing it would hang too.
const CHECK_TIMEOUT_MS = 1000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  // Checks run in parallel and on every call. Nothing is cached, so the answer always
  // reflects the live dependencies (design rule 7, stateless API).
  async check(): Promise<HealthReport> {
    const [redis, postgres] = await Promise.all([
      probe(() => this.redis.ping()),
      probe(() => this.prisma.$queryRaw`SELECT 1`),
    ]);
    // "api" is ok by definition: if this code runs, the process is serving requests.
    return { api: 'ok', redis, postgres };
  }
}

async function probe(fn: () => Promise<unknown>): Promise<Status> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([fn(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
