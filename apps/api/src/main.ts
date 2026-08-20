import "reflect-metadata";
import { RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@verevia/auth";
import { AppModule } from "./app.module";

// better-auth is mounted directly on the underlying Express instance,
// BEFORE Nest's global body parser is (re-)enabled — verified in the Phase 1
// spike (docs/ARCHITEKTUR_FINALISIERUNG.md, section 1) and required per
// ADR 0002:
//   1. NestFactory.create(AppModule, { bodyParser: false }) — otherwise
//      Nest's body parser drains the request stream before better-auth can
//      read it, and better-auth receives an empty body.
//   2. Mount on "/api/auth/{*splat}" using Express 5's wildcard syntax
//      (NestJS 11 ships Express 5; the Express 4 `*` syntax silently fails).
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: [process.env.APP_URL ?? "http://localhost:3000"],
    credentials: true,
  });

  const expressInstance = app.getHttpAdapter().getInstance();
  expressInstance.all("/api/auth/{*splat}", toNodeHandler(auth));

  const express = await import("express");
  app.use(express.default.json());

  // Fachliche Endpunkte unter /api/v1/…, siehe ADR 0007. /health(/ready)
  // bleibt bewusst unversioniert und ohne /api-Präfix (siehe
  // HealthController: `version: VERSION_NEUTRAL`) — betrieblicher
  // Healthcheck-Pfad, kein fachlicher Domain-Endpunkt.
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // Global: unbekannte Felder werden abgelehnt (kein stillschweigendes
  // Übernehmen), Query-/Param-Werte werden gemäß DTO-Typen transformiert.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`Verevia API listening on http://localhost:${port}`);
}

bootstrap();
