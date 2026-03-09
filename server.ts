import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // In-memory store for shared sketches (ephemeral)
  const sharedSketches = new Map<string, { title: string, image: string, timestamp: number }>();

  // API to "publish" a sketch for sharing
  app.post("/api/share", (req, res) => {
    const { title, image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }
    
    const id = Math.random().toString(36).substring(2, 15);
    sharedSketches.set(id, { 
      title: title || "Untitled Sketch", 
      image, 
      timestamp: Date.now() 
    });
    
    res.json({ id });
  });

  // API to get a shared sketch
  app.get("/api/share/:id", (req, res) => {
    const sketch = sharedSketches.get(req.params.id);
    if (!sketch) {
      return res.status(404).json({ error: "Sketch not found" });
    }
    res.json(sketch);
  });

  // Vite middleware for development
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  // Handle sharing routes with OG tags for social media
  app.get("/share/:id", async (req, res, next) => {
    const id = req.params.id;
    const sketch = sharedSketches.get(id);
    
    if (!sketch) {
      return next(); // Let SPA handle it (will show not found)
    }

    try {
      let template = fs.readFileSync(
        path.resolve(__dirname, process.env.NODE_ENV === "production" ? "dist/index.html" : "index.html"),
        "utf-8"
      );

      if (vite) {
        template = await vite.transformIndexHtml(req.originalUrl, template);
      }

      // Inject OG tags
      const ogTags = `
        <title>${sketch.title} | AI Sketch Studio</title>
        <meta name="description" content="Check out this professional sketch refined by AI.">
        <meta property="og:title" content="${sketch.title} | AI Sketch Studio">
        <meta property="og:description" content="Check out this professional sketch refined by AI.">
        <meta property="og:image" content="${sketch.image}">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${sketch.title}">
        <meta name="twitter:description" content="Check out this professional sketch refined by AI.">
        <meta name="twitter:image" content="${sketch.image}">
      `;

      const html = template.replace("</head>", `${ogTags}</head>`);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite?.ssrFixStacktrace(e);
      next(e);
    }
  });

  // SPA fallback
  app.get("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    
    try {
      let template = fs.readFileSync(
        path.resolve(__dirname, process.env.NODE_ENV === "production" ? "dist/index.html" : "index.html"),
        "utf-8"
      );

      if (vite) {
        template = await vite.transformIndexHtml(req.originalUrl, template);
      }

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite?.ssrFixStacktrace(e);
      next(e);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
