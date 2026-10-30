const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Send the image bytes inline so OpenAI never has to follow the host's redirects.
export async function toDataUrl(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Could not download the image (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("The image is too large to caption.");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function cleanCaption(text) {
  return text
    ?.trim()
    .replace(/^["“']+|["”']+$/g, "")
    .trim()
    .slice(0, 300);
}

// Returns `count` distinct captions for an image given as a data URL.
export async function requestCaptions(dataUrl, model, count, prompts) {
  const response = await fetch(OPENAI_URL, {
    signal: AbortSignal.timeout(45000),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 80 * count,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            prompts.system,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                prompts.user,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI request failed (${response.status}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "");
  } catch {
    throw new Error("OpenAI returned captions in an unexpected format.");
  }

  const captions = (Array.isArray(parsed?.captions) ? parsed.captions : [])
    .filter((caption) => typeof caption === "string")
    .map(cleanCaption)
    .filter(Boolean)
    .slice(0, count);
  if (!captions.length) {
    throw new Error("OpenAI returned an empty caption.");
  }
  return { captions, raw: body?.choices?.[0]?.message?.content ?? "" };
}

