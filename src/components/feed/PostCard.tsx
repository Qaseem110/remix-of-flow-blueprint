import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Heart, MessageCircle, Share2, Trash2, Pencil, PlayCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, updatePost, KIND_LABEL, setLike, useFeedViewer, useImageUrls, videoEmbed, type Post } from "@/lib/feed";

export function PostImages({ paths }: { paths: string[] }) {
  const urls = useImageUrls(paths);
  if (!urls.length) return null;
  if (urls.length === 1) return <a href={urls[0]} target="_blank" rel="noreferrer" className="block w-full max-w-md overflow-hidden rounded-2xl border"><img src={urls[0]} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:scale-[1.02]" /></a>;
  return <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border"><img src={u} alt="" loading="lazy" className="aspect-square w-full object-cover transition hover:scale-105" /></a>)}</div>;
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
  const liked = !!viewer && post.liked;
  const toggle = async () => {
    if (!viewer) { toast.info("Sign in to like posts"); return; }
    setBusy(true);
    try { await setLike(post.id, viewer.id, !liked); await Promise.all([qc.invalidateQueries({ queryKey: ["posts"] }), qc.invalidateQueries({ queryKey: ["post", post.id] }), qc.invalidateQueries({ queryKey: ["doctor-reputation"] })]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Button variant="ghost" size="sm" disabled={busy} onClick={toggle} aria-pressed={liked} className={liked ? "text-primary" : ""}><Heart className={liked ? "fill-current" : ""} />{post.likes}</Button>;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function EditPost({ post, open, onOpenChange }: { post: Post; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [summary, setSummary] = useState(post.summary);
  const [video, setVideo] = useState(post.video_url ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await updatePost(post.id, { kind: post.kind, title, body, summary, video_url: video, images: post.images });
      await Promise.all([qc.invalidateQueries({ queryKey: ["posts"] }), qc.invalidateQueries({ queryKey: ["post", post.id] })]);
      toast.success("Post updated"); onOpenChange(false);
    } catch (er) { toast.error((er as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit {KIND_LABEL[post.kind].toLowerCase()}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div><Label htmlFor="edit-title">Title *</Label><Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
          {post.kind === "video" && <>
            <div><Label htmlFor="edit-video">Video link *</Label><Input id="edit-video" value={video} onChange={(e) => setVideo(e.target.value)} /></div>
            <div><Label htmlFor="edit-summary">Video summary *</Label><Textarea id="edit-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} /></div>
          </>}
          <div><Label htmlFor="edit-body">{post.kind === "blog" ? "Blog *" : post.kind === "forum" ? "Details *" : post.kind === "photo" ? "Caption" : "More details"}</Label><Textarea id="edit-body" rows={post.kind === "blog" ? 8 : 4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} /></div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PostCard({ post, full = false }: { post: Post; full?: boolean }) {
  const viewer = useFeedViewer();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const text = post.kind === "video" ? post.summary : post.body;
  const short = !full && text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const remove = async () => {
    if (!confirm("Delete this post?")) return;
    try { await deletePost(post.id); await qc.invalidateQueries({ queryKey: ["posts"] }); toast.success("Deleted"); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <article className="group/card relative space-y-4 overflow-hidden rounded-[22px] border bg-card p-5 shadow-soft transition hover:shadow-lg sm:p-6">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary via-accent to-primary opacity-80" />
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-primary-foreground ${post.author_role === "doctor" ? "bg-sidebar ring-2 ring-accent" : "bg-primary"}`}>{(post.author_name || "M").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-secondary-foreground">{post.author_name || "Member"}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${post.author_role === "doctor" ? "bg-accent/20 text-accent-foreground" : "bg-muted"}`}>{post.author_role === "doctor" ? "✓ Doctor" : post.author_role}</span><span className="truncate">{when(post.created_at)}</span></p>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-full">{KIND_LABEL[post.kind]}</Badge>
      </header>
      {full ? <h1 className="font-display text-3xl font-bold text-secondary-foreground">{post.title}</h1> : <Link to="/feed/$postId" params={{ postId: post.id }} className="block font-display text-xl font-bold leading-snug text-secondary-foreground hover:text-primary">{post.title}</Link>}
      {post.kind === "video" && post.video_url && <PostVideo url={post.video_url} />}
      {short && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/85">{short}</p>}
      {full && post.kind === "video" && post.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
      <PostImages paths={full ? post.images : post.images.slice(0, 4)} />
      <footer className="-mx-2 flex flex-wrap items-center gap-1 rounded-xl bg-muted/50 px-2 py-1">
        <LikeButton post={post} />
        <Button variant="ghost" size="sm" asChild><Link to="/feed/$postId" params={{ postId: post.id }}><MessageCircle />{post.comments}</Link></Button>
        <ShareMenu post={post} />
        {viewer?.id === post.author_id && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}><Pencil />Edit</Button>}
        {viewer && (viewer.id === post.author_id || viewer.role === "admin") && <Button variant="ghost" size="sm" className={viewer.id === post.author_id ? "text-destructive" : "ml-auto text-destructive"} onClick={remove}><Trash2 />Delete</Button>}
      </footer>
      {editing && <EditPost post={post} open={editing} onOpenChange={setEditing} />}
    </article>
  );
}

export function PostList({ posts, loading, empty }: { posts?: Post[]; loading: boolean; empty: string }) {
  if (loading) return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-[22px] border bg-muted/60" />)}</div>;
  if (!posts?.length) return <p className="rounded-[22px] border border-dashed py-12 text-center text-muted-foreground">{empty}</p>;
  return <div className="space-y-5">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>;
}
