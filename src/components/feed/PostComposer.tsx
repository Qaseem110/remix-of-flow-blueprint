import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPost, KIND_LABEL, uploadFeedImage, validatePost, type PostKind } from "@/lib/feed";

export function PostComposer({ kinds }: { kinds: PostKind[] }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PostKind>(kinds[0] ?? "forum");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [video, setVideo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const pics = kind !== "video";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = { kind, title, body, summary, video_url: video, images: pics ? files.map((f) => f.name) : [] };
    try { validatePost(input); } catch (er) { toast.error((er as Error).message); return; }
    setBusy(true);
    try {
      const images = pics ? await Promise.all(files.map(uploadFeedImage)) : [];
      await createPost({ ...input, images });
      setTitle(""); setBody(""); setSummary(""); setVideo(""); setFiles([]);
      await qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Published");
    } catch (er) { toast.error((er as Error).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card p-5 shadow-soft">
      {kinds.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label="Post type">{kinds.map((k) => <Button key={k} type="button" size="sm" variant={k === kind ? "default" : "outline"} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>)}</div>}
      <div><Label htmlFor="post-title">Title *</Label><Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>
      {kind === "video" && <>
        <div><Label htmlFor="post-video">Video link * (YouTube, Facebook, TikTok, Vimeo…)</Label><Input id="post-video" type="url" placeholder="https://" value={video} onChange={(e) => setVideo(e.target.value)} /></div>
        <div><Label htmlFor="post-summary">Video summary *</Label><Textarea id="post-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} /></div>
      </>}
      <div><Label htmlFor="post-body">{kind === "blog" ? "Blog *" : kind === "forum" ? "Details *" : kind === "photo" ? "Caption" : "More details"}</Label><Textarea id="post-body" rows={kind === "blog" ? 8 : 4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} /></div>
      {pics && <div className="space-y-2">
        <Label htmlFor="post-pics" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><ImagePlus className="size-4" />Add pictures{kind === "photo" ? " *" : ""} (up to 6)</Label>
        <input id="post-pics" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; setFiles((f) => [...f, ...picked].slice(0, 6)); }} />
        {files.length > 0 && <ul className="flex flex-wrap gap-2">{files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><X className="size-3" /></button></li>)}</ul>}
      </div>}
      <Button type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish"}</Button>
    </form>
  );
}
