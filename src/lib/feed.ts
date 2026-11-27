import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type PostKind = "blog" | "photo" | "video" | "forum";
export type Post = {
  id: string; author_id: string; author_name: string; author_role: string; kind: PostKind;
  title: string; body: string; summary: string; video_url: string | null; images: string[]; created_at: string;
  likes: number; liked: boolean; comments: number;
};
export type Comment = { id: string; post_id: string; author_id: string; author_name: string; author_role: string; body: string; created_at: string };
export const KIND_LABEL: Record<PostKind, string> = { blog: "Blog", photo: "Photos", video: "Video", forum: "Discussion" };

type Row = Omit<Post, "likes" | "liked" | "comments"> & { like_count: number; post_likes: { user_id: string }[]; post_comments: { count: number }[] };
const toPost = (r: Row): Post => ({ ...r, likes: r.like_count, liked: r.post_likes.length > 0, comments: r.post_comments[0]?.count ?? 0 });
const SELECT = "*, post_likes(user_id), post_comments(count)";

export type PostFilter = { kinds?: PostKind[]; authorId?: string; q?: string };
export const postsKey = (f: PostFilter) => ["posts", f.kinds?.join(",") ?? "all", f.authorId ?? "", f.q ?? ""] as const;
export async function fetchPosts(f: PostFilter): Promise<Post[]> {
  let q = supabase.from("posts").select(SELECT).order("created_at", { ascending: false }).limit(50);
  if (f.kinds) q = q.in("kind", f.kinds);
  if (f.authorId) q = q.eq("author_id", f.authorId);
  const term = f.q?.replace(/[,()%*\\]/g, " ").trim();
  if (term) {
    // Match any meaningful word so a problem like "sir dard bukhar" finds related posts.
    const words = [...new Set(term.split(/\s+/).filter((w) => w.length >= 3))].slice(0, 6);
    const parts = words.length ? words : [term];
    q = q.or(parts.flatMap((w) => ["title", "body", "summary"].map((c) => `${c}.ilike.%${w}%`)).join(","));
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toPost);
}
export const usePosts = (f: PostFilter, enabled = true) => useQuery({ queryKey: postsKey(f), queryFn: () => fetchPosts(f), enabled });

export async function fetchPost(id: string) {
  const { data, error } = await supabase.from("posts").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPost(data as Row) : null;
}
export const usePost = (id: string) => useQuery({ queryKey: ["post", id], queryFn: () => fetchPost(id) });
export const useComments = (postId: string) => useQuery({
  queryKey: ["comments", postId],
  queryFn: async () => {
    const { data, error } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at");
    if (error) throw new Error(error.message);
    return data as Comment[];
  },
});

/** Signed-in viewer (id + role), or null for visitors. */
export function useFeedViewer() {
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN" || e === "SIGNED_OUT") void qc.invalidateQueries({ queryKey: ["feed-viewer"] }); });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  return useQuery({
    queryKey: ["feed-viewer"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return null;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
      return { id, role: (p?.role as string | undefined) ?? "" };
    },
  }).data ?? null;
}

const err = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
export async function uploadFeedImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Only pictures can be uploaded");
  if (file.size > 5 * 1024 * 1024) throw new Error("Each picture must be under 5 MB");
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Sign in to upload pictures");
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("feed").upload(path, file, { contentType: file.type });
  err(error);
  return path;
}

export type PostInput = { kind: PostKind; title: string; body: string; summary: string; video_url?: string; images: string[] };
/** Mirrors the database rules so people see the problem before sending. */
export function validatePost(p: PostInput) {
  const t = p.title.trim();
  if (t.length < 3) throw new Error("Title is required");
  if (p.images.length > 6) throw new Error("Up to 6 pictures");
  if (p.kind === "blog" && p.body.trim().length < 20) throw new Error("Write the blog text (at least 20 characters)");
  if (p.kind === "photo" && p.images.length === 0) throw new Error("Upload at least one picture");
  if (p.kind === "video") {
    if (!/^https?:\/\/[^ ]+\.[^ ]+/i.test(p.video_url?.trim() ?? "")) throw new Error("Add a valid video link");
    if (p.summary.trim().length < 10) throw new Error("Video summary is required (at least 10 characters)");
  }
  if (p.kind === "forum" && p.body.trim().length < 5) throw new Error("Describe your discussion");
}
export async function createPost(p: PostInput) {
  validatePost(p);
  const { data, error } = await supabase.from("posts").insert({ ...p, video_url: p.kind === "video" ? p.video_url?.trim() : null }).select("id").single();
  err(error);
  return (data as { id: string }).id;
}
export async function deletePost(id: string) { const { error } = await supabase.from("posts").delete().eq("id", id); err(error); }
export async function setLike(postId: string, userId: string, liked: boolean) {
  const { error } = liked ? await supabase.from("post_likes").insert({ post_id: postId, user_id: userId }) : await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  err(error);
}
export async function addComment(postId: string, body: string) {
  if (!body.trim()) throw new Error("Write a comment");
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, body: body.trim().slice(0, 2000) });
  err(error);
}
export async function deleteComment(id: string) { const { error } = await supabase.from("post_comments").delete().eq("id", id); err(error); }

export type Reputation = { doctor_id: string; score: number; posts: number; likes: number; comments: number };
export const useReputation = () => useQuery({
  queryKey: ["doctor-reputation"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("doctor_reputation");
    if (error) throw new Error(error.message);
    return new Map((data as Reputation[]).map((r) => [r.doctor_id, { ...r, score: Number(r.score) }]));
  },
});

/** Pictures sit in a private bucket; viewers get week-long signed links. */
export function useImageUrls(paths: string[]) {
  const [urls, setUrls] = useState<string[]>([]);
  const key = paths.join("|");
  useEffect(() => {
    if (!paths.length) { setUrls([]); return; }
    let live = true;
    void supabase.storage.from("feed").createSignedUrls(paths, 60 * 60 * 24 * 7).then(({ data }) => { if (live) setUrls((data ?? []).map((d) => d.signedUrl ?? "").filter(Boolean)); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

/** YouTube/Vimeo links become embeds; other platforms open as links. */
export function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com") {
      const v = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (host === "vimeo.com") { const id = u.pathname.match(/^\/(\d+)/)?.[1]; return id ? `https://player.vimeo.com/video/${id}` : null; }
  } catch { /* invalid */ }
  return null;
}
