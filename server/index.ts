import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { runMigrations } from "./migrate";

// Create tables then seed on startup
runMigrations().then(() => seedDatabase()).catch(console.error);
// Seed database on startup
seedDatabase();

const app = express();

// ── Gzip / Brotli compression ─────────────────────────────────────────────
// Compress all responses over 1 KB. Reduces payload sizes by ~70%.
app.use(compression({
  level: 6,           // balanced speed/ratio (1=fastest, 9=smallest)
  threshold: 1024,    // only compress responses ≥ 1 KB
  filter: (req, res) => {
    // Don't compress image uploads or already-compressed files
    const ct = res.getHeader("Content-Type") as string | undefined;
    if (ct && /image\/(png|jpg|jpeg|gif|webp|svg)/.test(ct)) return false;
    return compression.filter(req, res);
  },
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// ── Request timing logger (API only) ─────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
