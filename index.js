const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

// load env vars from connect.env
dotenv.config({ path: './connect.env' });

// create express app (must come before any app.use/app.get)
const app = express();

// body parsing (if you use JSON/form data)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static files from /Public
app.use(express.static(path.join(__dirname, 'Public')));

// home page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// ---- ENV ----
const uri = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "cookbook";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "recipes";
const PORT = process.env.PORT || 3000;

if (!uri) {
  console.error("❌ MONGODB_URI missing in connect.env");
  process.exit(1);
}

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // serves cookbook.html & app.js

// ---- HELPERS ----
function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

// ---- START SERVER ----
async function startServer() {
  const client = new MongoClient(uri);

  try {
    console.log("⏳ Connecting to MongoDB...");
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(DB_NAME);
    const recipes = db.collection(COLLECTION_NAME);

    // Health check (used by app.js)
    app.get("/api/health", async (req, res) => {
      try {
        await db.command({ ping: 1 });
        res.json({ ok: true, dbName: DB_NAME, collection: COLLECTION_NAME });
      } catch (err) {
        console.error("Ping error:", err);
        res.status(500).json({ ok: false });
      }
    });

    // Get all recipes
    app.get("/api/recipes", async (req, res) => {
      try {
        const docs = await recipes.find().sort({ createdAt: -1 }).toArray();
        const cleaned = docs.map((d) => ({
          ...d,
          _id: d._id.toString(),
        }));
        res.json(cleaned);
      } catch (err) {
        console.error("❌ Error fetching recipes:", err);
        res.status(500).json({ error: "Failed to fetch recipes" });
      }
    });

    // Add a recipe (JSON only)
    app.post("/api/recipes", async (req, res) => {
      try {
        const body = req.body || {};
        const title = (body.title || "").trim();
        const description = body.description || "";
        const ingredientsRaw = body.ingredients || "";
        const stepsRaw = body.steps || "";
        const category =
          (body.category && body.category.trim()) || "Uncategorized";

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        const recipe = {
          title,
          description,
          ingredients: splitLines(ingredientsRaw),
          steps: splitLines(stepsRaw),
          category,
          comments: [],
          createdAt: new Date(),
        };

        const result = await recipes.insertOne(recipe);
        res.status(201).json({ ...recipe, _id: result.insertedId.toString() });
      } catch (err) {
        console.error("❌ Error saving recipe:", err);
        res.status(500).json({ error: "Server error while saving recipe" });
      }
    });

    // Add a comment to a recipe
    app.post("/api/recipes/:id/comments", async (req, res) => {
      try {
        const body = req.body || {};
        const text = (body.text || "").trim();
        const id = req.params.id;

        if (!text) {
          return res.status(400).json({ error: "Comment text is required" });
        }

        let _id;
        try {
          _id = new ObjectId(id);
        } catch {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const comment = { text, createdAt: new Date() };

        const result = await recipes.findOneAndUpdate(
          { _id },
          { $push: { comments: comment } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).json({ error: "Recipe not found" });
        }

        const updated = {
          ...result.value,
          _id: result.value._id.toString(),
        };

        res.json(updated);
      } catch (err) {
        console.error("❌ Error adding comment:", err);
        res.status(500).json({ error: "Failed to add comment" });
      }
    });

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`👉 Open http://localhost:${PORT}/cookbook.html`);
    });
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

startServer();
