"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function declineInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_invite_by_token", { p_token: token });

  if (error) {
    redirect(`/invite/${token}?error=decline_failed`);
  }

  revalidatePath(`/invite/${token}`);
  redirect(`/invite/${token}?declined=1`);
}
