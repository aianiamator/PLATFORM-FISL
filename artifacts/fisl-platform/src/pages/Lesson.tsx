import { useParams } from "wouter";
import { 
  useGetLesson, 
  useGetLessonPlayback,
  getGetLessonQueryKey, 
  getGetLessonPlaybackQueryKey,
  useUpdateLessonProgress,
  useListLessonComments,
  getListLessonCommentsQueryKey,
  useCreateLessonComment
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, ChevronLeft, MessageSquare, Clock, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";

function safePlaybackUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowedHost = /^customer-[a-z0-9-]+\.cloudflarestream\.com$/i.test(url.hostname);
    return url.protocol === "https:" && allowedHost ? url.href : null;
  } catch {
    return null;
  }
}

export default function Lesson() {
  const { lessonId } = useParams();
  const parsedId = Number(lessonId);
  const isValidLessonId = Number.isSafeInteger(parsedId) && parsedId > 0;
  const id = isValidLessonId ? parsedId : 0;
  const queryClient = useQueryClient();
  const [commentContent, setCommentContent] = useState("");

  const { data: lesson, isLoading: isLoadingLesson } = useGetLesson(id, { 
    query: { queryKey: getGetLessonQueryKey(id), enabled: isValidLessonId }
  });
  const shouldLoadPlayback = lesson?.video?.status === "protected";
  const {
    data: playback,
    isLoading: isLoadingPlayback,
    isError: isPlaybackError,
    refetch: refetchPlayback,
    isFetching: isFetchingPlayback,
  } = useGetLessonPlayback(id, {
    query: {
      queryKey: getGetLessonPlaybackQueryKey(id),
      enabled: isValidLessonId && shouldLoadPlayback,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    },
  });
  
  const { data: comments, isLoading: isLoadingComments } = useListLessonComments(id, {
    query: { queryKey: getListLessonCommentsQueryKey(id), enabled: isValidLessonId }
  });

  const updateProgress = useUpdateLessonProgress();
  const createComment = useCreateLessonComment();

  if (!isValidLessonId) {
    return <div className="py-20 text-center"><h1 className="text-2xl font-bold">Lesson not found</h1></div>;
  }

  if (isLoadingLesson) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
        <Skeleton className="h-10 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!lesson) return <div className="py-20 text-center"><h1 className="text-2xl font-bold">Lesson not found</h1></div>;
  const playbackUrl = safePlaybackUrl(playback?.playbackUrl);

  const handleToggleComplete = () => {
    updateProgress.mutate(
      { lessonId: id, data: { completed: !lesson.completed } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetLessonQueryKey(id), (old: any) => 
            old ? { ...old, completed: data.completed } : old
          );
          // Also invalidate pathway to update aggregate progress
          queryClient.invalidateQueries({ queryKey: ["/api/pathway"] });
        }
      }
    );
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;

    createComment.mutate(
      { lessonId: id, data: { content: commentContent } },
      {
        onSuccess: (newComment) => {
          setCommentContent("");
          queryClient.setQueryData(getListLessonCommentsQueryKey(id), (old: any) => 
            old ? [newComment, ...old] : [newComment]
          );
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-20">
      <Link href="/pathway" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to Pathway
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{lesson.module}</Badge>
          <span className="text-sm font-medium text-muted-foreground flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1" />
            {lesson.durationMinutes} min read
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-serif">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-lg text-muted-foreground leading-relaxed">{lesson.description}</p>
        )}
      </div>

      {playbackUrl ? (
        <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-lg border border-border ring-1 ring-white/10">
          <iframe 
            src={playbackUrl}
            title={`${lesson.title} video`}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="no-referrer"
            allowFullScreen
          />
        </div>
      ) : isLoadingPlayback || isFetchingPlayback ? (
        <Skeleton className="aspect-video w-full rounded-2xl" />
      ) : isPlaybackError ? (
        <div className="aspect-video bg-muted rounded-2xl flex flex-col gap-4 items-center justify-center border border-border border-dashed px-6 text-center">
          <p className="text-muted-foreground font-medium">Video playback is temporarily unavailable.</p>
          <Button type="button" variant="outline" onClick={() => refetchPlayback()} disabled={isFetchingPlayback}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      ) : !lesson.video || lesson.video.status === "unavailable" ? (
        <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center border border-border border-dashed px-6 text-center">
          <p className="text-muted-foreground font-medium">No video is available for this lesson yet.</p>
        </div>
      ) : null}

      <div className="prose prose-slate dark:prose-invert max-w-none text-foreground/90 leading-relaxed font-serif whitespace-pre-wrap">
        {lesson.body}
      </div>

      <div className="pt-8 border-t border-border">
        <Button 
          size="lg"
          variant={lesson.completed ? "outline" : "default"}
          className="w-full sm:w-auto h-14 px-8 text-base rounded-full"
          onClick={handleToggleComplete}
          disabled={updateProgress.isPending}
        >
          {lesson.completed ? (
            <>
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
              Completed
            </>
          ) : (
            "Mark as Complete"
          )}
        </Button>
      </div>

      <div className="pt-16 space-y-8">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">Discussion</h2>
        </div>

        <Card className="bg-muted/30 border-transparent shadow-none">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleSubmitComment} className="space-y-4">
              <Textarea 
                placeholder="Share your thoughts on this lesson..."
                className="resize-none bg-background focus-visible:ring-primary/20 min-h-[100px]"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
              />
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={!commentContent.trim() || createComment.isPending}
                >
                  Post Comment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {isLoadingComments ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : comments?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No comments yet. Be the first to start the discussion.</p>
          ) : (
            comments?.map((comment) => (
              <div key={comment.id} className="flex gap-4 group">
                <Avatar className="w-10 h-10 border bg-card">
                  <AvatarFallback className="bg-primary/5 text-primary text-xs">
                    {comment.authorName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="text-sm text-foreground/90 leading-relaxed bg-card border rounded-2xl rounded-tl-none p-4 shadow-sm">
                    {comment.content}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
