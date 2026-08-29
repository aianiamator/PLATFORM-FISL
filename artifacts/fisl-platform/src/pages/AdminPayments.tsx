import { useState } from "react";
import { 
  useListAdminPaymentRequests, 
  getListAdminPaymentRequestsQueryKey,
  useReviewPaymentRequest
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import type { PaymentReviewInputStatus } from "@workspace/api-client-react";

export default function AdminPayments() {
  const queryClient = useQueryClient();
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: requests, isLoading } = useListAdminPaymentRequests({
    query: { queryKey: getListAdminPaymentRequestsQueryKey() }
  });

  const reviewRequest = useReviewPaymentRequest();

  const handleReview = (id: number, status: PaymentReviewInputStatus) => {
    reviewRequest.mutate(
      { 
        requestId: id,
        data: { status, reviewNote: reviewNote.trim() || undefined }
      },
      {
        onSuccess: (updatedRequest) => {
          queryClient.setQueryData(getListAdminPaymentRequestsQueryKey(), (old: any) => 
            old ? old.map((r: any) => r.id === id ? updatedRequest : r) : old
          );
          setReviewingId(null);
          setReviewNote("");
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 mb-8" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
      </div>
    );
  }

  const pending = requests?.filter(r => r.status === "pending") || [];
  const processed = requests?.filter(r => r.status !== "pending") || [];

  return (
    <div className="space-y-10 animate-in fade-in duration-300 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-serif">Payment Queue</h1>
        <p className="text-muted-foreground mt-1">Review and approve manual Revolut payments.</p>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <Clock className="w-5 h-5 text-amber-500" /> 
          Pending Action ({pending.length})
        </h2>
        
        {pending.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 border border-dashed rounded-xl">
            <CheckCircle className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">All caught up! No pending payments.</p>
          </div>
        ) : (
          pending.map(req => (
            <Card key={req.id} className="border-amber-500/30 shadow-sm overflow-hidden">
              <div className="h-1 bg-amber-500/20" />
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                  <div className="grid sm:grid-cols-2 gap-x-12 gap-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Member</p>
                      <p className="font-semibold text-lg">{req.memberName}</p>
                      <p className="text-sm text-muted-foreground">{req.memberEmail}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Amount & Plan</p>
                      <div className="flex items-center gap-2 font-semibold text-lg">
                        <span>£{(req.amountPence / 100).toFixed(2)}</span>
                        <Badge variant="outline" className="capitalize">{req.plan}</Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Reference Provided</p>
                      <p className="font-mono text-sm font-medium bg-muted px-2 py-1 rounded inline-block mt-1">{req.reference}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted</p>
                      <p className="font-medium text-sm mt-1">{format(new Date(req.submittedAt), "MMM d, yyyy HH:mm")}</p>
                    </div>
                  </div>

                  <div className="w-full md:w-auto md:min-w-[280px]">
                    {reviewingId === req.id ? (
                      <div className="space-y-3 bg-muted/30 p-4 rounded-lg border">
                        <Textarea 
                          placeholder="Optional note to member..."
                          className="h-20 resize-none text-sm bg-background"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button 
                            variant="default" 
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleReview(req.id, "approved")}
                            disabled={reviewRequest.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1.5" /> Approve
                          </Button>
                          <Button 
                            variant="destructive" 
                            className="flex-1"
                            onClick={() => handleReview(req.id, "rejected")}
                            disabled={reviewRequest.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1.5" /> Reject
                          </Button>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full h-8"
                          onClick={() => setReviewingId(null)}
                          disabled={reviewRequest.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        className="w-full md:w-auto" 
                        onClick={() => setReviewingId(req.id)}
                      >
                        Review Payment
                      </Button>
                    )}
                  </div>
                </div>
                {req.note && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Member Note:</p>
                    <p className="text-sm italic">"{req.note}"</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-6 pt-8">
        <h2 className="text-xl font-semibold flex items-center gap-2 border-b pb-2 text-muted-foreground">
          Recently Processed
        </h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-medium">
              <tr>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Processed At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {processed.slice(0, 10).map(req => (
                <tr key={req.id}>
                  <td className="px-6 py-4 font-medium">{req.memberName}</td>
                  <td className="px-6 py-4">£{(req.amountPence / 100).toFixed(2)}</td>
                  <td className="px-6 py-4 font-mono text-xs">{req.reference}</td>
                  <td className="px-6 py-4">
                    <Badge variant={req.status === 'approved' ? 'default' : 'destructive'} className="capitalize">
                      {req.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {req.reviewedAt ? format(new Date(req.reviewedAt), "MMM d, yyyy") : '-'}
                  </td>
                </tr>
              ))}
              {processed.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No processed requests</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
