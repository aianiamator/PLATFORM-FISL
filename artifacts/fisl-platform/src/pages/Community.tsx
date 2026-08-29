import { 
  useListDiscussionPosts, 
  getListDiscussionPostsQueryKey,
  useCreateDiscussionPost 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquarePlus, MessageCircle } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Community() {
  const queryClient = useQueryClient();
  const [isComposing, setIsComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: posts, isLoading } = useListDiscussionPosts({
    query: { queryKey: getListDiscussionPostsQueryKey() }
  });

  const createPost = useCreateDiscussionPost();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    createPost.mutate(
      { data: { title, content } },
      {
        onSuccess: (newPost) => {
          setTitle("");
          setContent("");
          setIsComposing(false);
          queryClient.setQueryData(getListDiscussionPostsQueryKey(), (old: any) => 
            old ? [newPost, ...old] : [newPost]
          );
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif">Community</h1>
          <p className="text-muted-foreground mt-1">Discuss ideas, share progress, and ask questions.</p>
        </div>
        {!isComposing && (
          <Button onClick={() => setIsComposing(true)} className="rounded-full">
            <MessageSquarePlus className="w-4 h-4 mr-2" />
            New Topic
          </Button>
        )}
      </div>

      {isComposing && (
        <Card className="border-primary/20 shadow-md">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                placeholder="Topic Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="font-medium text-lg border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary bg-transparent"
                autoFocus
              />
              <Textarea
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[150px] resize-none border-0 px-0 focus-visible:ring-0 bg-transparent"
              />
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsComposing(false)}
                  disabled={createPost.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!title.trim() || !content.trim() || createPost.isPending}>
                  {createPost.isPending ? "Posting..." : "Post Topic"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : posts?.length === 0 ? (
          <div className="text-center py-20 border border-dashed rounded-xl bg-muted/10">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No topics yet</h3>
            <p className="text-muted-foreground text-sm">Be the first to start a discussion in the community.</p>
          </div>
        ) : (
          posts?.map((post) => (
            <Card key={post.id} className="group hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="p-5 md:p-6 flex flex-col md:flex-row gap-5 items-start">
                <Avatar className="hidden md:flex w-12 h-12 border bg-muted/50">
                  <AvatarFallback className="font-serif bg-transparent text-foreground">
                    {post.authorName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Avatar className="md:hidden w-5 h-5 border">
                      <AvatarFallback className="text-[10px]">{post.authorName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-foreground">{post.authorName}</span>
                    <span>&middot;</span>
                    <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                  </div>
                  
                  <h3 className="text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors truncate">
                    {post.title}
                  </h3>
                  
                  <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed">
                    {post.content}
                  </p>
                  
                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      <MessageCircle className="w-4 h-4 mr-1.5" />
                      {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
