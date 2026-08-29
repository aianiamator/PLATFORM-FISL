import { useEffect, useState } from "react";
import { 
  useGetPathway, 
  useGetLesson,
  useGetLessonVideoAssociation,
  getGetLessonQueryKey,
  getGetLessonVideoAssociationQueryKey,
  getGetPathwayQueryKey,
  useCreateLesson,
  useUpdateLesson
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, GripVertical, Save, FileText, Video } from "lucide-react";
import type { LessonInputStatus } from "@workspace/api-client-react";

export default function AdminContent() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  
  // Form state
  const [title, setTitle] = useState("");
  const [moduleName, setModule] = useState("");
  const [duration, setDuration] = useState(15);
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [order, setOrder] = useState(0);
  const [status, setStatus] = useState<LessonInputStatus>("draft");
  const [videoExternalId, setVideoExternalId] = useState("");

  const { data: pathway, isLoading } = useGetPathway({
    query: { queryKey: getGetPathwayQueryKey() }
  });
  const editingLessonId = typeof editingId === "number" ? editingId : 0;
  const { data: editingLesson } = useGetLesson(editingLessonId, {
    query: { queryKey: getGetLessonQueryKey(editingLessonId), enabled: editingLessonId > 0 }
  });
  const { data: videoAssociation, isFetched: isVideoAssociationFetched } = useGetLessonVideoAssociation(editingLessonId, {
    query: {
      queryKey: getGetLessonVideoAssociationQueryKey(editingLessonId),
      enabled: editingLessonId > 0,
    }
  });

  useEffect(() => {
    if (!editingLesson || editingId !== editingLesson.id) return;
    setTitle(editingLesson.title);
    setModule(editingLesson.module);
    setDuration(editingLesson.durationMinutes);
    setDescription(editingLesson.description || "");
    setBody(editingLesson.body);
    setOrder(editingLesson.order);
    setStatus(editingLesson.status as LessonInputStatus);
  }, [editingLesson, editingId]);

  useEffect(() => {
    if (editingLessonId <= 0 || !isVideoAssociationFetched) return;
    setVideoExternalId(videoAssociation?.externalId ?? "");
  }, [editingLessonId, isVideoAssociationFetched, videoAssociation]);

  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();

  const handleEdit = (lesson: any) => {
    setTitle(lesson.title);
    setModule(lesson.module);
    setDuration(lesson.durationMinutes);
    setDescription(lesson.description || "");
    setBody("");
    setOrder(lesson.order);
    setStatus(lesson.status as LessonInputStatus);
    setVideoExternalId("");
    setEditingId(lesson.id);
  };

  const handleNew = () => {
    setTitle("");
    setModule(pathway?.lessons?.[pathway.lessons.length - 1]?.module || "");
    setDuration(15);
    setDescription("");
    setBody("");
    setOrder((pathway?.lessons?.length || 0) + 1);
    setStatus("draft");
    setVideoExternalId("");
    setEditingId('new');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      title,
      module: moduleName,
      durationMinutes: duration,
      description,
      body,
      order,
      status,
      video: videoExternalId.trim()
        ? { provider: "cloudflare_stream" as const, externalId: videoExternalId.trim() }
        : null,
    };

    if (editingId === 'new') {
      createLesson.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetPathwayQueryKey() });
            setEditingId(null);
          }
        }
      );
    } else if (typeof editingId === "number") {
      const lessonId = editingId;
      updateLesson.mutate(
        { lessonId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetPathwayQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetLessonVideoAssociationQueryKey(lessonId) });
            queryClient.invalidateQueries({ queryKey: getGetLessonQueryKey(lessonId) });
            setEditingId(null);
          }
        }
      );
    }
  };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48 mb-8" /><Skeleton className="h-[500px]" /></div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-300 max-w-5xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif">Content Management</h1>
          <p className="text-muted-foreground mt-1">Manage the learning pathway and lesson content.</p>
        </div>
        {!editingId && (
          <Button onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" /> Add Lesson
          </Button>
        )}
      </div>

      {editingId ? (
        <Card className="border-primary/20 shadow-md">
          <CardHeader>
            <CardTitle>{editingId === 'new' ? 'Create New Lesson' : 'Edit Lesson'}</CardTitle>
            <CardDescription>Fill out the content and metadata for this lesson.</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="lesson-form" onSubmit={handleSave} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Introduction to RAG" />
                </div>
                <div className="space-y-2">
                  <Label>Module</Label>
                  <Input required value={moduleName} onChange={e => setModule(e.target.value)} placeholder="e.g. Module 1: Foundations" />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" required min={1} value={duration} onChange={e => setDuration(Number.isNaN(e.currentTarget.valueAsNumber) ? 1 : e.currentTarget.valueAsNumber)} />
                </div>
                <div className="space-y-2">
                  <Label>Order</Label>
                  <Input type="number" required min={1} value={order} onChange={e => setOrder(Number.isNaN(e.currentTarget.valueAsNumber) ? 1 : e.currentTarget.valueAsNumber)} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as LessonInputStatus)}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Short Description (Optional)</Label>
                <Textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="resize-none h-20" 
                  placeholder="Summary for the pathway card..."
                />
              </div>

              <div className="space-y-2">
                <Label>Body Content (plain text)</Label>
                <Textarea 
                  required
                  value={body} 
                  onChange={e => setBody(e.target.value)} 
                  className="min-h-[300px] font-mono text-sm" 
                  placeholder="Write the lesson content as plain text. HTML markup is not supported."
                />
              </div>

              <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="cloudflare-video-id">Cloudflare Stream video ID</Label>
                </div>
                <Input
                  id="cloudflare-video-id"
                  value={videoExternalId}
                  onChange={(event) => setVideoExternalId(event.target.value)}
                  placeholder="Paste the uploaded video's Stream UID"
                  autoComplete="off"
                  minLength={32}
                  maxLength={32}
                  pattern="[A-Fa-f0-9]{32}"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Upload the video in Cloudflare Stream, then paste its UID here. Leave this blank to remove the lesson's video.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                <Button type="submit" disabled={createLesson.isPending || updateLesson.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {createLesson.isPending || updateLesson.isPending ? "Saving..." : "Save Lesson"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pathway?.lessons?.map((lesson, index) => (
            <Card key={lesson.id} className="group hover:border-border transition-colors bg-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="text-muted-foreground/50 cursor-grab px-2">
                  <GripVertical className="w-5 h-5" />
                </div>
                
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
                  {lesson.order}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <Badge variant="secondary" className="text-xs">{lesson.module}</Badge>
                    {lesson.status === 'published' ? (
                      <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-500/20">Published</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Draft</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold truncate pr-4">{lesson.title}</h3>
                </div>

                <Button variant="ghost" size="sm" onClick={() => handleEdit(lesson)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
              </CardContent>
            </Card>
          ))}
          {pathway?.lessons?.length === 0 && (
            <div className="text-center py-16 bg-muted/20 border border-dashed rounded-xl">
              <FileText className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No lessons exist yet.</p>
              <Button variant="outline" className="mt-4" onClick={handleNew}>Create the first lesson</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
