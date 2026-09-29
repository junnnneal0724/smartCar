import 'reflect-metadata';
import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '../libs/common/all-exceptions.filter';
import { ResultInterceptor } from '../libs/common/result.interceptor';

/**
 * 业务应用进程（:8081）。
 * 由 gateway(:8080) 反向代理对外暴露，也可以直连调试。
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 2 * 1024 * 1024 }),
    { logger: ['error', 'warn', 'log'] },
  );

  app.enableCors({ origin: true, credentials: true, exposedHeaders: ['x-trace-id'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResultInterceptor());
  app.enableShutdownHooks();

  /**
   * 允许"声明了 JSON 但没带 body"的请求。
   * Fastify 遇到空 JSON 体会直接 400（FST_ERR_CTP_EMPTY_JSON_BODY），
   * 而车机上的很多操作（开始行程、开门、结束行程）本身就是"一个动作、零参数"，
   * 前端不该被迫塞一个空对象。
   *
   * 这里用 preParsing 钩子把空体替换成 `{}`，而不是去 addContentTypeParser ——
   * NestJS 的 FastifyAdapter 随后也会注册 application/json 解析器，重复注册会直接启动失败。
   */
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('preParsing', (req, _reply, payload, done) => {
    const isJson = String(req.headers['content-type'] ?? '').includes('application/json');
    const len = req.headers['content-length'];
    const empty = len === undefined || len === '0' || Number(len) === 0;
    if (isJson && empty && !req.headers['transfer-encoding']) {
      done(null, Readable.from(['{}']));
      return;
    }
    done(null, payload);
  });

  const port = Number(process.env.APP_PORT ?? 8081);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`业务应用已启动 → http://127.0.0.1:${port}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('启动失败:', e);
  process.exit(1);
});
