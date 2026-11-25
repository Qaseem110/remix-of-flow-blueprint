import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, MessageCircle, Share2, Trash2, PlayCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deletePost, KIND_LABEL, setLike, useFeedViewer, useImageUrls, videoEmbed, type Post } from "@/lib/feed";

export function PostImages({ paths }: { paths: string[] }) {
  const urls = useImageUrls(paths);
  if (!urls.length) return null;
  return <div className={`grid gap-2 ${urls.length > 1 ? "grid-cols-2" : ""}`}>{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" loading="lazy" className="max-h-96 w-full rounded-xl border object-cover" /></a>)}</div>;
}

export function PostVideo({ url }: { url: string }) {
  const embed = videoEmbed(url);
  if (embed) return <div className="aspect-video overflow-hidden rounded-xl border"><iframe src={embed} title="Video" className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen /></div>;
  return <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border bg-secondary/40 p-4 text-sm font-medium text-primary"><PlayCircle className="size-5" />Watch video<ExternalLink className="ml-auto size-4" /></a>;
}

export function ShareMenu({ post }: { post: Post }) {
  const url = typeof window === "undefined" ? `/feed/${post.id}` : `${window.location.origin}/feed/${post.id}`;
  const text = encodeURIComponent(post.title);
  const link = encodeURIComponent(url);
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.error("Could not copy the link"); } };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Share2 />Share</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copy}>Copy link</DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`https://wa.me/?text=${text}%20${link}`} target="_blank" rel="noreferrer">WhatsApp</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`https://www.facebook.com/sharer/sharer.php?u=${link}`} target="_blank" rel="noreferrer">Facebook</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`https://twitter.com/intent/tweet?text=${text}&url=${link}`} target="_blank" rel="noreferrer">X (Twitter)</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${link}`} target="_blank" rel="noreferrer">LinkedIn</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LikeButton({ post }: { post: Post }) {
  const viewer = useFeedViewer();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const liked = !!viewer && post.likes.includes(viewer.id);
  const toggle = async () => {
    if (!viewer) { toast.info("Sign in to like posts"); return; }
    setBusy(true);
    try { await setLike(post.id, viewer.id, !liked); await Promise.all([qc.invalidateQueries({ queryKey: ["posts"] }), qc.invalidateQueries({ queryKey: ["post", post.id] }), qc.invalidateQueries({ queryKey: ["doctor-reputation"] })]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Button variant="ghost" size="sm" disabled={busy} onClick={toggle} aria-pressed={liked} className={liked ? "text-primary" : ""}><Heart className={liked ? "fill-current" : ""} />{post.likes.length}</Button>;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function PostCard({ post, full = false }: { post: Post; full?: boolean }) {
  const viewer = useFeedViewer();
  const qc = useQueryClient();
  const text = post.kind === "video" ? post.summary : post.body;
  const short = !full && text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const remove = async () => {
    if (!confirm("Delete this post?")) return;
    try { await deletePost(post.id); await qc.invalidateQueries({ queryKey: ["posts"] }); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-5 shadow-soft">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{post.author_name || "Member"} <span className="text-xs font-normal capitalize text-muted-foreground">· {post.author_role}</span></p>
          <p className="text-xs text-muted-foreground">{when(post.created_at)}</p>
        </div>
        <Badge variant="secondary">{KIND_LABEL[post.kind]}</Badge>
      </header>
      {full ? <h1 className="font-display text-3xl font-semibold">{post.title}</h1> : <Link to="/feed/$postId" params={{ postId: post.id }} className="block font-display text-xl font-semibold hover:text-primary">{post.title}</Link>}
      {post.kind === "video" && post.video_url && <PostVideo url={post.video_url} />}
      {short && <p className="whitespace-pre-wrap text-sm leading-relaxed">{short}</p>}
      {full && post.kind === "video" && post.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
      <PostImages paths={full ? post.images : post.images.slice(0, 4)} />
      <footer className="flex flex-wrap items-center gap-1 border-t pt-2">
        <LikeButton post={post} />
        <Button variant="ghost" size="sm" asChild><Link to="/feed/$postId" params={{ postId: post.id }}><MessageCircle />{post.comments}</Link></Button>
        <ShareMenu post={post} />
        {viewer && (viewer.id === post.author_id || viewer.role === "admin") && <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={remove}><Trash2 />Delete</Button>}
      </footer>
    </article>
  );
}

export function PostList({ posts, loading, empty }: { posts?: Post[]; loading: boolean; empty: string }) {
  if (loading) return <p className="py-8 text-center text-muted-foreground">Loading…</p>;
  if (!posts?.length) return <p className="py-8 text-center text-muted-foreground">{empty}</p>;
  return <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}
