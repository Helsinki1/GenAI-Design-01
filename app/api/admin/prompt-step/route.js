import { handlePromptStudioGeneration } from "../../../../lib/prompt-studio-generation.js";
export const maxDuration = 60;
export async function POST(request) { return handlePromptStudioGeneration(request); }
