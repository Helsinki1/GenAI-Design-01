import { handleAdminGeneration } from "../../../../lib/admin-generation";

export const maxDuration = 60;

export async function POST(request) {
  return handleAdminGeneration(request);
}
