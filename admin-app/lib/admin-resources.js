const text = (key, label, extra = {}) => ({ key, label, type: "text", required: true, ...extra });
const paragraph = (key, label, extra = {}) => text(key, label, { type: "textarea", ...extra });
const priority = { key: "priority", label: "Priority", type: "number", required: true, min: 0, max: 100, default: 0 };
const crud = { create: true, update: true, delete: true };

// A fixed allowlist shared by navigation, forms, and server-side validation.
export const resources = {
  "prompt-chains": { title: "Prompt chains", table: "prompt_chains", search: "name", columns: ["name", "description"], fields: [] },
  "prompt-chain-steps": { title: "Prompt chain steps", table: "prompt_chain_steps", columns: ["chain_id", "position", "model_id", "system_prompt", "user_prompt"], fields: [] },
  "prompt-chain-mix": { title: "Prompt chain mix", table: "prompt_chain_mix", columns: ["chain_id", "caption_count"], update: true,
    description: "Captions contributed by each chain on image upload. Zero disables a chain. Single-caption generation samples an enabled chain in proportion to its count.",
    fields: [{ key: "caption_count", label: "Caption count", type: "number", required: true, min: 0, max: 10 }] },
  terms: { title: "Terms", table: "terms", search: "term", columns: ["term", "definition", "example", "priority"], ...crud,
    fields: [text("term", "Term"), paragraph("definition", "Definition"), paragraph("example", "Example", { required: false }), priority] },
  "generation-requests": { title: "Generation requests", table: "generation_requests", columns: ["id", "image_id", "profile_id", "status", "caption_count", "error", "created_at"], fields: [], order: "created_at" },
  "generation-examples": { title: "AI generation examples", table: "ai_generation_examples", search: "caption", columns: ["image_description", "caption", "explanation", "priority"], ...crud,
    fields: [paragraph("image_description", "Image description"), paragraph("caption", "Caption"), paragraph("explanation", "Explanation"), priority] },
  "llm-models": { title: "LLM models", table: "llm_models", search: "name", columns: ["name", "provider_id", "provider_model_id", "is_temperature_supported"], ...crud,
    fields: [text("name", "Name"), text("provider_id", "Provider", { type: "reference", table: "llm_providers", labelKey: "name" }), text("provider_model_id", "Provider model ID"), { key: "is_temperature_supported", label: "Supports temperature", type: "checkbox", default: true }] },
  "llm-providers": { title: "LLM providers", table: "llm_providers", search: "name", columns: ["name", "created_at"], ...crud, fields: [text("name", "Name")] },
  "llm-responses": { title: "LLM responses", table: "llm_responses", columns: ["request_id", "model", "response", "error", "duration_ms", "created_at"], fields: [], order: "created_at" },
  "signup-domains": { title: "Allowed signup domains", table: "allowed_signup_domains", search: "domain", columns: ["domain", "created_at"], ...crud,
    fields: [text("domain", "Domain", { type: "domain", placeholder: "columbia.edu" })] },
  "whitelisted-emails": { title: "Whitelisted e-mail addresses", table: "whitelisted_emails", search: "email", columns: ["email", "created_at"], ...crud,
    fields: [text("email", "E-mail address", { type: "email" })] },
  images: { title: "Images", table: "images", search: "url", columns: ["url", "created_by", "created_datetime_utc"], ...crud,
    description: "Upload a new image or register a hosted image URL. Deleting a record unlinks captions; it does not delete a shared storage file.",
    fields: [text("url", "Image URL", { type: "url" })] },
  media: { title: "AI generated media", table: "captions", search: "content", columns: ["content", "model", "generation_request_id", "created_datetime_utc"], fields: [], order: "created_datetime_utc" },
};

export function getResource(slug) {
  return Object.hasOwn(resources, slug) ? resources[slug] : null;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateResource(config, input) {
  const payload = {};
  for (const field of config.fields) {
    let value = input?.[field.key];
    if (field.type === "checkbox") {
      if (typeof value !== "boolean") throw new Error(`${field.label} must be Yes or No.`);
    } else if (field.type === "number") {
      if (value === "" || value === null || value === undefined) throw new Error(`${field.label} is required.`);
      value = Number(value);
      if (!Number.isInteger(value) || value < field.min || value > field.max) throw new Error(`${field.label} must be a whole number from ${field.min} to ${field.max}.`);
    } else {
      if (typeof value !== "string") value = "";
      value = value.trim();
      if (field.required && !value) throw new Error(`${field.label} is required.`);
      if (value.length > 10000) throw new Error(`${field.label} is too long.`);
      if (field.type === "reference" && !uuidPattern.test(value)) throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
      if (field.type === "email" || field.type === "domain") value = value.toLowerCase();
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Enter a valid e-mail address.");
      if (field.type === "domain" && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) throw new Error("Enter a domain without a URL or @ sign.");
      if (field.type === "url") {
        let url;
        try { url = new URL(value); } catch { throw new Error("Enter a valid image URL."); }
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS image URL without credentials.");
      }
      if (!value) value = null;
    }
    payload[field.key] = value;
  }
  return payload;
}
