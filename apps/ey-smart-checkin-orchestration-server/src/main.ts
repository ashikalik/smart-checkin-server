/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setMaxListeners } from 'events';
import { AppModule } from './app/app.module';
import { MainMcpModule } from './main-mcp/main-mcp.module';
import { MainMcpService } from './main-mcp/main-mcp.service';

async function bootstrap() {
  // Avoid MaxListenersExceededWarning from high-volume AbortSignal usage.
  setMaxListeners(0);
  if (process.env.MAIN_MCP_STDIO === 'true') {
    const app = await NestFactory.createApplicationContext(MainMcpModule, {
      logger: ['log', 'error', 'warn', 'debug'],
    });
    await app.get(MainMcpService).start();
    return;
  }
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
