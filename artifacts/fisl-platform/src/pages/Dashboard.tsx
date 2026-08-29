import { useGetCurrentMember } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, Activity, Lock } from "lucide-react";

export default function Dashboard() {
  const { data: member, isLoading, isError } = useGetCurrentMember();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Access Restricted</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          We could not load your profile. You may need to complete your membership setup.
        </p>
        <Link href="/membership">
          <Button>Check Membership Status</Button>
        </Link>
      </div>
    );
  }

  const isPendingOrUnpaid = member.accessStatus === "unpaid" || member.accessStatus === "pending";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif">Welcome back, {member.name.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1">Here is your learning overview for today.</p>
        </div>
        
        <Badge 
          variant={member.accessStatus === "active" ? "default" : "secondary"}
          className="w-fit"
        >
          {member.accessStatus === "active" ? "Active Member" : "Membership Pending"}
        </Badge>
      </div>

      {isPendingOrUnpaid && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Action Required</CardTitle>
            <CardDescription>
              Your membership is currently {member.accessStatus}. To access all lessons and community features, please complete your payment setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/membership">
              <Button size="sm">Manage Membership</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Learning Pathway</CardTitle>
            <CardDescription>Continue your structured journey in applied AI.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-end">
            <Link href="/pathway">
              <Button variant="outline" className="w-full justify-between group">
                Resume Pathway
                <span className="group-hover:translate-x-1 transition-transform">-&gt;</span>
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Community Pulse</CardTitle>
            <CardDescription>See what other builders are discussing.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-end">
            <Link href="/community">
              <Button variant="outline" className="w-full justify-between group">
                Join Discussion
                <span className="group-hover:translate-x-1 transition-transform">-&gt;</span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
