// index.js
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config({ path: "./connect.env" });

const app = express();

// body parsing (JSON + form)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// serve static files from /Public
app.use(express.static(path.join(__dirname, "Public")));

// home page route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
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

// ---- HELPERS ----
function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

// build an _id query that works for both string and ObjectId ids
function buildIdQuery(id) {
  if (!id) return null;

  // If it's a valid ObjectId string, match either the string _id OR ObjectId _id
  if (ObjectId.isValid(id)) {
    return { _id: { $in: [id, new ObjectId(id)] } };
  }

  // Fallback: just treat it as a plain string id
  return { _id: id };
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

        // always send _id to frontend as a string
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

    // Add a recipe (CREATE)
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
        res
          .status(201)
          .json({ ...recipe, _id: result.insertedId.toString() });
      } catch (err) {
        console.error("❌ Error saving recipe:", err);
        res.status(500).json({ error: "Server error while saving recipe" });
      }
    });

    // UPDATE a recipe
    app.put("/api/recipes/:id", async (req, res) => {
      try {
        const id = req.params.id;
        console.log("🔧 PUT /api/recipes/:id with id:", id);

        const filter = buildIdQuery(id);
        if (!filter) {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const body = req.body || {};
        const update = {};

        if (body.title !== undefined) {
          const title = String(body.title).trim();
          if (!title) {
            return res.status(400).json({ error: "Title cannot be empty" });
          }
          update.title = title;
        }

        if (body.description !== undefined) {
          update.description = body.description;
        }

        if (body.ingredients !== undefined) {
          update.ingredients = splitLines(body.ingredients);
        }

        if (body.steps !== undefined) {
          update.steps = splitLines(body.steps);
        }

        if (body.category !== undefined) {
          update.category =
            (body.category && body.category.trim()) || "Uncategorized";
        }

        console.log("Updating with filter:", JSON.stringify(filter));
        console.log("Update payload:", update);

        const result = await recipes.findOneAndUpdate(
          filter,
          { $set: update },
          { returnDocument: "after" }
        );

        if (!result.value) {
          console.error("Recipe not found for update:", id);
          return res.status(404).json({ error: "Recipe not found" });
        }

        const updated = {
          ...result.value,
          _id: result.value._id.toString(),
        };
        res.json(updated);
      } catch (err) {
        console.error("❌ Error updating recipe:", err);
        res.status(500).json({ error: "Failed to update recipe" });
      }
    });

    // DELETE a recipe
    app.delete("/api/recipes/:id", async (req, res) => {
      try {
        const id = req.params.id;
        console.log("🗑 DELETE /api/recipes/:id with id:", id);

        const filter = buildIdQuery(id);
        if (!filter) {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const result = await recipes.deleteOne(filter);
        if (result.deletedCount === 0) {
          console.error("Recipe not found for delete:", id);
          return res.status(404).json({ error: "Recipe not found" });
        }

        res.json({ ok: true });
      } catch (err) {
        console.error("❌ Error deleting recipe:", err);
        res.status(500).json({ error: "Failed to delete recipe" });
      }
    });

    // Add a comment to a recipe
    app.post("/api/recipes/:id/comments", async (req, res) => {
      try {
        const id = req.params.id;
        const body = req.body || {};
        const text = (body.text || "").trim();

        if (!text) {
          return res.status(400).json({ error: "Comment text is required" });
        }

        const filter = buildIdQuery(id);
        if (!filter) {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const comment = { text, createdAt: new Date() };

        const result = await recipes.findOneAndUpdate(
          filter,
          { $push: { comments: comment } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          console.error("Recipe not found for comment:", id);
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
    });
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

startServer();
