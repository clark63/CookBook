// public/app.js

// ----- STATUS DOTS -----
const jsDot = document.getElementById("js-dot");
const jsStatusText = document.getElementById("js-status-text");
jsDot.className = "dot dot-ok";
jsStatusText.textContent = "Loaded";

const dbDot = document.getElementById("db-dot");
const dbStatusText = document.getElementById("db-status-text");

// ----- DOM ELEMENTS -----
const recipesContainer = document.getElementById("recipes-container");
const form = document.getElementById("recipe-form");
const submitButton = form.querySelector('button[type="submit"]');

let editingId = null;          // _id of recipe we’re editing
let currentRecipes = [];

// ----- HELPERS -----
function ensureArrayMaybeLines(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  return String(val)
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

// ----- DB HEALTH -----
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

// ----- LOAD RECIPES -----
async function loadRecipes() {
  recipesContainer.innerHTML = '<p class="helper">Loading recipes…</p>';

  try {
    const res = await fetch("/api/recipes");
    if (!res.ok) throw new Error("Failed to fetch recipes");
    const recipes = await res.json();
    currentRecipes = recipes;

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

// ----- RENDER ONE RECIPE CARD -----
function renderRecipe(recipe) {
  const item = document.createElement("article");
  item.className = "recipe-item";

  // Title
  const title = document.createElement("div");
  title.className = "recipe-title";
  title.textContent = recipe.title || "Untitled recipe";

  // Meta (date)
  const meta = document.createElement("div");
  meta.className = "recipe-meta";
  const created = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleString()
    : "Unknown date";
  meta.textContent = `Saved: ${created}`;

  // Description
  const desc = document.createElement("div");
  desc.textContent =
    recipe.description || "No description. Check ingredients below.";

  item.appendChild(title);
  item.appendChild(meta);
  item.appendChild(desc);

  // Category badge
  if (recipe.category) {
    const badge = document.createElement("span");
    badge.className = "badge-pill";
    badge.textContent = recipe.category;
    item.appendChild(badge);
  }

  // Ingredients
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

  // Steps
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

  // Comments title
  const commentsTitle = document.createElement("div");
  commentsTitle.className = "recipe-section-title";
  commentsTitle.textContent = "Comments";
  item.appendChild(commentsTitle);

  // Comments list
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

  // Comment form
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

  // ----- ACTION BUTTONS -----
  const actions = document.createElement("div");
  actions.style.marginTop = "8px";
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "Edit recipe";
  editBtn.style.fontSize = "11px";
  editBtn.style.padding = "6px 10px";
  editBtn.style.borderRadius = "999px";
  editBtn.style.border = "1px solid rgba(76,106,146,0.7)";
  editBtn.style.background = "#eef3fb";
  editBtn.style.cursor = "pointer";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.style.fontSize = "11px";
  deleteBtn.style.padding = "6px 10px";
  deleteBtn.style.borderRadius = "999px";
  deleteBtn.style.border = "1px solid rgba(220, 38, 38, 0.7)";
  deleteBtn.style.background = "#fee2e2";
  deleteBtn.style.color = "#991b1b";
  deleteBtn.style.cursor = "pointer";

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(actions);

  // Click handlers
  editBtn.addEventListener("click", () => {
    startEditMode(recipe);
  });

  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Delete this recipe?")) return;
    try {
      const res = await fetch(`/api/recipes/${recipe._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Error deleting recipe");
        return;
      }
      await loadRecipes();
    } catch (err) {
      console.error(err);
      alert("Network error while deleting recipe.");
    }
  });

  recipesContainer.appendChild(item);
}

// ----- EDIT MODE -----
function startEditMode(recipe) {
  editingId = recipe._id;  // this is the string id from the server
  console.log("Editing recipe id:", editingId);

  form.title.value = recipe.title || "";
  form.category.value = recipe.category || "Uncategorized";
  form.description.value = recipe.description || "";
  form.ingredients.value = ensureArrayMaybeLines(recipe.ingredients).join("\n");
  form.steps.value = ensureArrayMaybeLines(recipe.steps).join("\n");

  submitButton.textContent = "Save Changes";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ----- FORM SUBMISSION (CREATE OR UPDATE) -----
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const payload = {
    title: formData.get("title"),
    description: formData.get("description"),
    ingredients: formData.get("ingredients"),
    steps: formData.get("steps"),
    category: formData.get("category") || "Uncategorized",
  };

  const url = editingId ? `/api/recipes/${editingId}` : "/api/recipes";
  const method = editingId ? "PUT" : "POST";

  console.log(`Submitting ${method} ${url} with id:`, editingId);

  try {
    const res = await fetch(url, {
      method,
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
    editingId = null;
    submitButton.textContent = "Post Recipe";

    await loadRecipes();
  } catch (err) {
    console.error(err);
    alert("Network error while saving recipe.");
  }
});

// ----- INIT -----
checkDbHealth();
loadRecipes();
