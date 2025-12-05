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

// serve static files from /Public  (make sure folder name matches!)
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

// Build a query that matches BOTH:
//   {_id: "<string id>"}
//   {_id: ObjectId("<same hex>")}  (if valid)
function buildIdQuery(id) {
  const clauses = [{ _id: id }];

  if (ObjectId.isValid(id)) {
    clauses.push({ _id: new ObjectId(id) });
  }

  return { $or: clauses };
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
          // always send _id to the frontend as a string
          _id: typeof d._id === "string" ? d._id : d._id.toString(),
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

        // 👇 force a STRING id for new documents
        const id = new ObjectId().toHexString();

        const recipe = {
          _id: id, // string _id in MongoDB
          title,
          description,
          ingredients: splitLines(ingredientsRaw),
          steps: splitLines(stepsRaw),
          category,
          comments: [],
          createdAt: new Date(),
        };

        await recipes.insertOne(recipe);
        res.status(201).json(recipe); // already has string _id
      } catch (err) {
        console.error("❌ Error saving recipe:", err);
        res.status(500).json({ error: "Server error while saving recipe" });
      }
    });

    
  // UPDATE a recipe (works for both string and ObjectId _id)
app.put("/api/recipes/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // 👉 Build a query that works whether _id is a string or an ObjectId
    const query = ObjectId.isValid(id)
      ? { _id: new ObjectId(id) }
      : { _id: id };

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

    const result = await recipes.findOneAndUpdate(
      query,
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const updated = { ...result.value, _id: result.value._id.toString() };
    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating recipe:", err);
    res.status(500).json({ error: "Failed to update recipe" });
  }
});


    // DELETE a recipe (works for both string and ObjectId _id)
app.delete("/api/recipes/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // 👉 Same trick: handle both string and ObjectId
    const query = ObjectId.isValid(id)
      ? { _id: new ObjectId(id) }
      : { _id: id };

    const result = await recipes.deleteOne(query);

    if (result.deletedCount === 0) {
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
        const body = req.body || {};
        const text = (body.text || "").trim();
        const id = req.params.id;

        if (!text) {
          return res.status(400).json({ error: "Comment text is required" });
        }

        const filter = buildIdQuery(id);
        const comment = { text, createdAt: new Date() };

        const result = await recipes.findOneAndUpdate(
          filter,
          { $push: { comments: comment } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).json({ error: "Recipe not found" });
        }

        const updated = {
          ...result.value,
          _id:
            typeof result.value._id === "string"
              ? result.value._id
              : result.value._id.toString(),
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
