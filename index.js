import express from "express";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 5000;

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// API
app.get("/api/insta", (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: "URL required" });
  }

  exec(`yt-dlp.exe -j "${url}"`, (err, stdout, stderr) => {
    if (err) {
      console.error(stderr);
      return res.status(500).json({ error: "Download failed" });
    }

    try {
      const data = JSON.parse(stdout);
console.log("Parsed data:", {
  title: data.title,
  description: data.description,
  thumbnail: data.thumbnail,
  formatsCount: Array.isArray(data.formats) ? data.formats.length : 0,
});
      const formats = data.formats
        .filter((f) => f.vcodec !== "none")
        .map((f) => ({
          quality: f.format,
          url: f.url,
        }));

      // if 'thumbnail' is missing, pick best entry from 'thumbnails' array
      let thumbnailUrl = data.thumbnail;
      if (
        !thumbnailUrl &&
        Array.isArray(data.thumbnails) &&
        data.thumbnails.length > 0
      ) {
        const sorted = data.thumbnails
          .filter((t) => t && t.url)
          .sort(
            (a, b) =>
              (b.width || 0) * (b.height || 0) -
              (a.width || 0) * (a.height || 0),
          );
        if (sorted.length > 0) {
          thumbnailUrl = sorted[0].url;
        }
      }

      res.json({
        title: data.title,
        caption: data.description || data.title || "",
        thumbnail: thumbnailUrl,
        formats: formats,
      });
    } catch (e) {
      res.status(500).json({ error: "Parsing failed" });
    }
  });
});

app.get("/api/image", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Image URL required");
  }

  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).send("Invalid image URL");
  }

  try {
    let response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Referer: "https://www.instagram.com/",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok && [403, 404].includes(response.status)) {
      console.warn(
        `Primary image fetch failed ${response.status}, trying fallback proxy`,
      );
      const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      response = await fetch(fallbackUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "image/*,*/*;q=0.8",
        },
      });
    }

    if (!response.ok) {
      return res
        .status(response.status)
        .send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.set("Content-Type", contentType);

    const data = await response.arrayBuffer();
    res.send(Buffer.from(data));
  } catch (err) {
    console.error("Image proxy error:", err.message || err);
    res.status(500).send("Image proxy failed");
  }
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
