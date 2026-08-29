import { useState } from "react";
import {
  useGetAdminOverview,
  getGetAdminOverviewQueryKey,
  useListAdminMembers,
  getListAdminMembersQueryKey,
  useListAdminMemberAccessHistory,
  getListAdminMemberAccessHistoryQueryKey,
  useRevokeMemberSubscription,
  type AdminMember,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Users, CreditCard, GraduationCap, History, MessageSquare, RotateCcw, ShieldX } from "lucide-react";

export default function AdminOverview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedMember, setSelectedMember] = useState<AdminMember | null>(null);
  const [historyMember, setHistoryMember] = useState<AdminMember | null>(null);
  const [revocationReason, setRevocationReason] = useState("");
  const { data, isLoading } = useGetAdminOverview({
    query: { queryKey: getGetAdminOverviewQueryKey() }
  });
  const { data: members, isLoading: membersLoading } = useListAdminMembers({
    query: { queryKey: getListAdminMembersQueryKey() }
  });
  const {
    data: accessHistory,
    isLoading: historyLoading,
    isError: historyError,
  } = useListAdminMemberAccessHistory(historyMember?.id ?? 0, {
    query: {
      queryKey: getListAdminMemberAccessHistoryQueryKey(historyMember?.id ?? 0),
      enabled: historyMember !== null,
    },
  });
  const revokeSubscription = useRevokeMemberSubscription();

  const handleRevoke = () => {
    if (!selectedMember) return;
    const memberName = selectedMember.name;
    const reason = revocationReason.trim();
    revokeSubscription.mutate(
      { memberId: selectedMember.id, data: { reason: reason || undefined } },
      {
        onSuccess: (updatedMember) => {
          queryClient.setQueryData<AdminMember[]>(getListAdminMembersQueryKey(), (current) =>
            current?.map((member) => member.id === updatedMember.id ? updatedMember : member)
          );
          queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getListAdminMemberAccessHistoryQueryKey(updatedMember.id),
          });
          setSelectedMember(null);
          toast({
            title: "Membership revoked",
            description: `${memberName} no longer has access to member content.`,
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Could not revoke membership",
            description: "The membership was not changed. Refresh and try again.",
          });
        },
      },
    );
  };

  if (isLoading || membersLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!data || !members) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-serif">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">High-level metrics and recent member activity.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Members</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.activeMembers}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payments</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.pendingPayments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Completion</CardTitle>
            <GraduationCap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.completionRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Conversations</CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.newConversations}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Access</th>
                  <th className="px-6 py-4">Current subscription</th>
                  <th className="px-6 py-4">Ends</th>
                  <th className="px-6 py-4">Latest revocation</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No recent members</td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={member.accessStatus === "active" ? "default" : member.accessStatus === "expired" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {member.accessStatus}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{member.plan}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {member.currentSubscription?.status ?? "No subscription"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {member.currentSubscription
                          ? format(new Date(member.currentSubscription.endsAt), "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {member.latestRevocation ? (
                          <>
                            <p className="font-medium">
                              {format(new Date(member.latestRevocation.revokedAt), "MMM d, yyyy HH:mm")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              By {member.latestRevocation.revokedBy.name}
                            </p>
                            <p className="text-xs text-muted-foreground max-w-[220px] truncate" title={member.latestRevocation.reason ?? "No reason provided"}>
                              {member.latestRevocation.reason ?? "No reason provided"}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setHistoryMember(member)}
                          >
                            <History />
                            History
                          </Button>
                          {member.role === "member" && member.currentSubscription?.status === "active" && (
                            <Button
                              variant="outline"
                              size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              setSelectedMember(member);
                              setRevocationReason("");
                            }}
                          >
                            <ShieldX />
                            Revoke
                          </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={historyMember !== null} onOpenChange={(open) => {
        if (!open) setHistoryMember(null);
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{historyMember?.name}&apos;s access history</DialogTitle>
            <DialogDescription>
              Every recorded membership revocation and restoration, newest first. This audit detail is visible only to administrators.
            </DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : historyError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
              <p className="font-medium text-destructive">Could not load access history</p>
              <p className="mt-1 text-sm text-muted-foreground">Close this window and try again.</p>
            </div>
          ) : accessHistory?.length ? (
            <ol className="space-y-3 py-2">
              {accessHistory.map((change) => {
                const isRevocation = change.action === "revoked";
                return (
                  <li key={change.id} className="flex gap-3 rounded-lg border p-4">
                    <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                      isRevocation ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                    }`}>
                      {isRevocation ? <ShieldX className="size-4" /> : <RotateCcw className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {isRevocation ? "Access revoked" : "Access restored"}
                        </p>
                        <Badge variant={isRevocation ? "destructive" : "secondary"}>
                          {isRevocation ? "Revoked" : "Reactivated"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {format(new Date(change.changedAt), "MMM d, yyyy 'at' HH:mm")}
                      </p>
                      <p className="mt-2 text-sm">
                        By <span className="font-medium">{change.changedBy.name}</span>
                        <span className="text-muted-foreground"> ({change.changedBy.email})</span>
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {change.reason ?? "No reason provided"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
              <History className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No access changes recorded</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Revocations and restorations will appear here.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={selectedMember !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedMember(null);
          setRevocationReason("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {selectedMember?.name}&apos;s membership?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately blocks pathway, lesson, playback, comments, and community access. Their current subscription will be marked inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedMember?.currentSubscription && (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{selectedMember.plan}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Paid access through</span>
                <span className="font-medium">
                  {format(new Date(selectedMember.currentSubscription.endsAt), "MMMM d, yyyy")}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Resulting access</span>
                <span className="font-medium text-destructive">Expired</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="revocation-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="revocation-reason"
              value={revocationReason}
              onChange={(event) => setRevocationReason(event.target.value)}
              placeholder="Add context for this access change..."
              maxLength={500}
              className="min-h-20 resize-none"
            />
            <p className="text-xs text-muted-foreground">Only administrators can see this audit detail.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeSubscription.isPending}>Keep membership</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevoke}
              disabled={revokeSubscription.isPending}
            >
              {revokeSubscription.isPending ? "Revoking..." : "Revoke membership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
