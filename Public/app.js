// public/app.js

// Mark JS as loaded
const jsDot = document.getElementById("js-dot");
const jsStatusText = document.getElementById("js-status-text");
jsDot.className = "dot dot-ok";
jsStatusText.textContent = "Loaded";

const dbDot = document.getElementById("db-dot");
const dbStatusText = document.getElementById("db-status-text");

const recipesContainer = document.getElementById("recipes-container");
const form = document.getElementById("recipe-form");

// DB health check
async function checkDbHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Status not OK");
    const data = await res.json();

    if (data.ok) {
      dbDot.className = "dot dot-ok";
      dbStatusText.textContent = `Connected (${data.dbName}/${data.collection})`;
    } else {
      dbDot.className = "dot dot-bad";
      dbStatusText.textContent = "Error talking to MongoDB";
    }
  } catch (err) {
    console.error(err);
    dbDot.className = "dot dot-bad";
    dbStatusText.textContent = "Cannot reach /api/health";
  }
}

function ensureArrayMaybeLines(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  return String(val)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Load recipes from server
async function loadRecipes() {
  recipesContainer.innerHTML = '<p class="helper">Loading recipes…</p>';

  try {
    const res = await fetch("/api/recipes");
    if (!res.ok) throw new Error("Failed to fetch recipes");
    const recipes = await res.json();

    if (!recipes.length) {
      recipesContainer.innerHTML =
        '<p class="helper">No recipes yet. Add one on the left!</p>';
      return;
    }

    recipesContainer.innerHTML = "";
    recipes.forEach((recipe) => renderRecipe(recipe));
  } catch (err) {
    console.error(err);
    recipesContainer.innerHTML =
      '<p class="helper">Error loading recipes from the server.</p>';
  }
}

function renderRecipe(recipe) {
  const item = document.createElement("article");
  item.className = "recipe-item";

  // TITLE + META
  const title = document.createElement("div");
  title.className = "recipe-title";
  title.textContent = recipe.title || "Untitled recipe";

  const meta = document.createElement("div");
  meta.className = "recipe-meta";
  const created = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleString()
    : "Unknown date";
  meta.textContent = `Saved: ${created}`;

  const desc = document.createElement("div");
  desc.textContent =
    recipe.description || "No description. Check ingredients below.";

  item.appendChild(title);
  item.appendChild(meta);
  item.appendChild(desc);

  // INGREDIENTS
  const ingredients = ensureArrayMaybeLines(recipe.ingredients);
  if (ingredients.length) {
    const ingTitle = document.createElement("div");
    ingTitle.className = "recipe-section-title";
    ingTitle.textContent = "Ingredients";

    const ul = document.createElement("ul");
    ingredients.forEach((ing) => {
      const li = document.createElement("li");
      li.textContent = ing;
      ul.appendChild(li);
    });

    item.appendChild(ingTitle);
    item.appendChild(ul);
  }

  // STEPS
  const steps = ensureArrayMaybeLines(recipe.steps);
  if (steps.length) {
    const stepsTitle = document.createElement("div");
    stepsTitle.className = "recipe-section-title";
    stepsTitle.textContent = "Steps";

    const ol = document.createElement("ol");
    steps.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      ol.appendChild(li);
    });

    item.appendChild(stepsTitle);
    item.appendChild(ol);
  }

  // COMMENTS SECTION
  const commentsTitle = document.createElement("div");
  commentsTitle.className = "recipe-section-title";
  commentsTitle.textContent = "Comments";
  item.appendChild(commentsTitle);

  const commentsList = document.createElement("ul");
  commentsList.className = "comments-list";

  const comments = Array.isArray(recipe.comments) ? recipe.comments : [];
  if (!comments.length) {
    const empty = document.createElement("li");
    empty.className = "comment-empty";
    empty.textContent = "No comments yet. Be the first to comment!";
    commentsList.appendChild(empty);
  } else {
    comments.forEach((c) => {
      const li = document.createElement("li");
      li.className = "comment-item";

      const textDiv = document.createElement("div");
      textDiv.className = "comment-text";
      textDiv.textContent = c.text;

      const timeDiv = document.createElement("div");
      timeDiv.className = "comment-meta";
      timeDiv.textContent = c.createdAt
        ? new Date(c.createdAt).toLocaleString()
        : "";

      li.appendChild(textDiv);
      li.appendChild(timeDiv);
      commentsList.appendChild(li);
    });
  }

  item.appendChild(commentsList);

  // COMMENT FORM
  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";

  const textarea = document.createElement("input");
  textarea.type = "text";
  textarea.name = "comment";
  textarea.placeholder = "Add a comment…";

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = "Post";

  commentForm.appendChild(textarea);
  commentForm.appendChild(btn);

  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;

    try {
      const res = await fetch(`/api/recipes/${recipe._id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        alert("Error posting comment");
        return;
      }

      textarea.value = "";
      await loadRecipes();
    } catch (err) {
      console.error(err);
      alert("Network error while posting comment.");
    }
  });

  item.appendChild(commentForm);

  recipesContainer.appendChild(item);
}

// Handle form submission (JSON)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const payload = {
    title: formData.get("title"),
    description: formData.get("description"),
    ingredients: formData.get("ingredients"),
    steps: formData.get("steps"),
  };

  try {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Save failed:", res.status, text);
      alert("Error saving recipe. Check console + terminal for details.");
      return;
    }

    form.reset();
    await loadRecipes();
  } catch (err) {
    console.error(err);
    alert("Network error while saving recipe.");
  }
});

// Run on page load
checkDbHealth();
loadRecipes();
