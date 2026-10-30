"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "../../../lib/admin";
import { getResource, uuidPattern, validateResource } from "../../../lib/admin-resources";

export async function saveResource(slug, id, input) {
  const { supabase, user, error } = await getAdminClient();
  if (error) return { error };
  const config = getResource(slug);
  if (!config || !(id ? config.update : config.create)) return { error: "This operation is not available." };
  if (id && !uuidPattern.test(id)) return { error: "Invalid record ID." };
  let payload;
  try { payload = validateResource(config, input); } catch (error) { return { error: error.message }; }
  if (slug === "images" && !id) payload.created_by = user.id;
  const query = id
    ? supabase.from(config.table).update(payload).eq("id", id)
    : supabase.from(config.table).insert(payload);
  const { data, error: writeError } = await query.select("id").single();
  if (writeError || !data) return { error: writeError?.message || "Record was not saved. Refresh and try again." };
  revalidatePath("/admin", "layout");
  if (slug === "images") revalidatePath("/");
  return { error: null, id: data.id };
}

export async function deleteResource(slug, id) {
  const { supabase, error } = await getAdminClient();
  if (error) return { error };
  const config = getResource(slug);
  if (!config?.delete || !uuidPattern.test(id)) return { error: "This operation is not available." };
  const { data, error: deleteError } = await supabase.from(config.table).delete().eq("id", id).select("id").single();
  if (deleteError || !data) return { error: deleteError?.message || "Record was not deleted. Refresh and try again." };
  revalidatePath("/admin", "layout");
  if (slug === "images") revalidatePath("/");
  return { error: null };
}
