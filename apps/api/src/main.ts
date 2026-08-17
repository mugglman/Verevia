import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// NOTE: when packages/auth (better-auth) is wired in, NestFactory.create
// must be called with { bodyParser: false } and better-auth's handler
// mounted on the raw Express instance BEFORE re-enabling body parsing —
// see docs/architecture/adr/0002-authentication-strategy.md and the
// verified spike in docs/ARCHITEKTUR_FINALISIERUNG.md, section 1.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [process.env.APP_URL ?? "http://localhost:3000"],
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`Verevia API listening on http://localhost:${port}`);
}

bootstrap();
