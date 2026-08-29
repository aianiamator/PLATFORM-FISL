import { useGetPathway, getGetPathwayQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2, PlayCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Pathway() {
  const { data: pathway, isLoading } = useGetPathway({ query: { queryKey: getGetPathwayQueryKey() } });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!pathway) return null;

  const progressPercentage = Math.round((pathway.completedLessons / pathway.totalLessons) * 100) || 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="max-w-3xl space-y-4">
        <div className="text-sm font-semibold tracking-wider text-primary uppercase">
          {pathway.eyebrow}
        </div>
        <h1 className="text-4xl font-bold tracking-tight font-serif">{pathway.title}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {pathway.description}
        </p>
        
        <div className="flex items-center gap-4 pt-4">
          <div className="flex-1 max-w-xs h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <span className="text-sm font-medium">{progressPercentage}% Complete</span>
        </div>
      </div>

      <div className="space-y-4 relative">
        <div className="absolute left-6 top-6 bottom-6 w-px bg-border -z-10 hidden md:block" />
        
        {pathway.lessons.map((lesson, index) => {
          const isNext = !lesson.completed && (index === 0 || pathway.lessons[index - 1].completed);
          
          return (
            <Card 
              key={lesson.id} 
              className={cn(
                "relative overflow-hidden transition-all duration-200 border-border group",
                lesson.completed ? "bg-muted/30" : "bg-card hover:border-primary/50 hover:shadow-md",
                isNext && "border-primary/50 ring-1 ring-primary/20 shadow-md"
              )}
            >
              <div className={cn(
                "absolute top-0 left-0 bottom-0 w-1 md:w-1.5 transition-colors",
                lesson.completed ? "bg-primary/50" : isNext ? "bg-primary" : "bg-transparent"
              )} />
              
              <CardContent className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="hidden md:flex flex-shrink-0 w-12 h-12 rounded-full border-2 bg-card items-center justify-center z-10"
                     style={{
                       borderColor: lesson.completed ? 'hsl(var(--primary))' : isNext ? 'hsl(var(--primary))' : 'hsl(var(--border))'
                     }}>
                  {lesson.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  ) : (
                    <span className={cn(
                      "font-semibold text-sm",
                      isNext ? "text-primary" : "text-muted-foreground"
                    )}>
                      {index + 1}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <Badge variant="secondary" className="font-medium bg-secondary text-secondary-foreground">
                      {lesson.module}
                    </Badge>
                    <div className="flex items-center text-xs text-muted-foreground font-medium">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {lesson.durationMinutes} min
                    </div>
                  </div>
                  
                  <h3 className={cn(
                    "text-xl font-bold tracking-tight",
                    lesson.completed ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {lesson.title}
                  </h3>
                  
                  {lesson.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2 max-w-2xl">
                      {lesson.description}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 w-full md:w-auto mt-4 md:mt-0">
                  <Link href={`/lessons/${lesson.id}`}>
                    <Button 
                      variant={isNext ? "default" : "outline"} 
                      className={cn(
                        "w-full md:w-auto h-11 px-6 rounded-full",
                        lesson.completed && "bg-transparent text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {lesson.completed ? "Review" : isNext ? "Start Lesson" : "View"}
                      {!lesson.completed && <PlayCircle className="w-4 h-4 ml-2" />}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
