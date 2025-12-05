// index.js
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config({ path: "./connect.env" });

const app = express();

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "Public")));

// home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

// --- ENV ---
const uri = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "cookbook";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "recipes";
const PORT = process.env.PORT || 3000;

if (!uri) {
  console.error("❌ MONGODB_URI missing in connect.env");
  process.exit(1);
}

// --- HELPERS ---
function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

function cleanRecipe(doc) {
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() };
}

// --- START SERVER ---
async function startServer() {
  const client = new MongoClient(uri);

  try {
    console.log("⏳ Connecting to MongoDB...");
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(DB_NAME);
    const recipes = db.collection(COLLECTION_NAME);

    // HEALTH CHECK
    app.get("/api/health", async (req, res) => {
      try {
        await db.command({ ping: 1 });
        res.json({ ok: true, dbName: DB_NAME, collection: COLLECTION_NAME });
      } catch (err) {
        console.error("Ping error:", err);
        res.status(500).json({ ok: false });
      }
    });

    // GET ALL RECIPES
    app.get("/api/recipes", async (req, res) => {
      try {
        const docs = await recipes.find().sort({ createdAt: -1 }).toArray();
        res.json(docs.map(cleanRecipe));
      } catch (err) {
        console.error("❌ Error fetching recipes:", err);
        res.status(500).json({ error: "Failed to fetch recipes" });
      }
    });

    // CREATE RECIPE
    app.post("/api/recipes", async (req, res) => {
      try {
        const body = req.body || {};
        const title = (body.title || "").trim();

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        const recipe = {
          title,
          description: body.description || "",
          ingredients: splitLines(body.ingredients),
          steps: splitLines(body.steps),
          category:
            (body.category && String(body.category).trim()) || "Uncategorized",
          comments: [],
          createdAt: new Date(),
        };

        const result = await recipes.insertOne(recipe);
        recipe._id = result.insertedId; // attach id so we can clean it

        res.status(201).json(cleanRecipe(recipe));
      } catch (err) {
        console.error("❌ Error saving recipe:", err);
        res.status(500).json({ error: "Server error while saving recipe" });
      }
    });

    // UPDATE RECIPE
    app.put("/api/recipes/:id", async (req, res) => {
      try {
        const id = req.params.id;

        let mongoId;
        try {
          mongoId = new ObjectId(id);
        } catch (e) {
          console.error("Invalid ObjectId for update:", id);
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const body = req.body || {};
        const title = body.title !== undefined ? String(body.title).trim() : "";

        if (!title) {
          return res.status(400).json({ error: "Title cannot be empty" });
        }

        const update = {
          title,
          description: body.description || "",
          ingredients: splitLines(body.ingredients),
          steps: splitLines(body.steps),
          category:
            (body.category && String(body.category).trim()) || "Uncategorized",
          // optional: track when it was edited
          updatedAt: new Date(),
        };

        // first update
        const result = await recipes.updateOne(
          { _id: mongoId },
          { $set: update }
        );

        if (result.matchedCount === 0) {
          console.error("Recipe not found for update:", id);
          return res.status(404).json({ error: "Recipe not found" });
        }

        // then fetch the updated doc
        const updatedDoc = await recipes.findOne({ _id: mongoId });
        res.json(cleanRecipe(updatedDoc));
      } catch (err) {
        console.error("❌ Error updating recipe:", err);
        res.status(500).json({ error: "Failed to update recipe" });
      }
    });

    // DELETE RECIPE
    app.delete("/api/recipes/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let mongoId;
        try {
          mongoId = new ObjectId(id);
        } catch (e) {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const result = await recipes.deleteOne({ _id: mongoId });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Recipe not found" });
        }

        res.json({ ok: true });
      } catch (err) {
        console.error("❌ Error deleting recipe:", err);
        res.status(500).json({ error: "Failed to delete recipe" });
      }
    });

    // ADD COMMENT
    app.post("/api/recipes/:id/comments", async (req, res) => {
      try {
        const text = (req.body.text || "").trim();
        const id = req.params.id;

        if (!text) {
          return res.status(400).json({ error: "Comment text is required" });
        }

        let mongoId;
        try {
          mongoId = new ObjectId(id);
        } catch (e) {
          return res.status(400).json({ error: "Invalid recipe id" });
        }

        const comment = { text, createdAt: new Date() };

        const result = await recipes.findOneAndUpdate(
          { _id: mongoId },
          { $push: { comments: comment } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).json({ error: "Recipe not found" });
        }

        res.json(cleanRecipe(result.value));
      } catch (err) {
        console.error("❌ Error adding comment:", err);
        res.status(500).json({ error: "Failed to add comment" });
      }
    });

    // START HTTP SERVER
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

startServer();
