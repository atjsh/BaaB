import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ProcessConfig } from './config/process.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const processConfig = app.get<ProcessConfig>(ProcessConfig);

  app.enableCors({
    origin: processConfig.webOrigin,
  });

  console.log(processConfig.webOrigin);

  SwaggerModule.setup(
    'openapi',
    app,
    SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('baab server').addBearerAuth().build()),
  );

  await app.listen(processConfig.port);
}
bootstrap();
