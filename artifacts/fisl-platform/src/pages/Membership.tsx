import { useState } from "react";
import { 
  useGetMembership, 
  getGetMembershipQueryKey,
  useCreatePaymentRequest
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Check, CreditCard, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { PaymentRequestInputPlan } from "@workspace/api-client-react";

function safeRevolutUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "revolut.com" || host.endsWith(".revolut.com") || host === "revolut.me";
    return url.protocol === "https:" && allowedHost ? url.href : null;
  } catch {
    return null;
  }
}

export default function Membership() {
  const queryClient = useQueryClient();
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const { data: membership, isLoading } = useGetMembership({
    query: { queryKey: getGetMembershipQueryKey() }
  });

  const createRequest = useCreatePaymentRequest();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!membership) return null;

  const { currentRequest, offers, verificationNote } = membership;
  const isPending = currentRequest?.status === "pending";
  const selectedOffer = offers.find(offer => offer.id === selectedOfferId);
  const paymentLink = safeRevolutUrl(selectedOffer?.paymentLink);

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfferId || !reference) return;

    const offer = selectedOffer;
    if (!offer) return;

    createRequest.mutate(
      {
        data: {
          plan: offer.interval as PaymentRequestInputPlan,
          amountPence: offer.pricePence,
          reference,
          paidAt: new Date().toISOString(),
          note
        }
      },
      {
        onSuccess: (newRequest) => {
          queryClient.setQueryData(getGetMembershipQueryKey(), (old: any) => 
            old ? { ...old, currentRequest: newRequest } : old
          );
          setSelectedOfferId(null);
          setReference("");
          setNote("");
        }
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-serif">Membership</h1>
        <p className="text-muted-foreground mt-2">Manage your FISL platform access.</p>
      </div>

      {currentRequest && (
        <Card className={
          currentRequest.status === "pending" ? "border-amber-500/50 bg-amber-500/5" :
          currentRequest.status === "approved" ? "border-green-500/50 bg-green-500/5" :
          "border-destructive/50 bg-destructive/5"
        }>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              {currentRequest.status === "pending" && <Clock className="w-5 h-5 text-amber-600" />}
              {currentRequest.status === "approved" && <Check className="w-5 h-5 text-green-600" />}
              {currentRequest.status === "rejected" && <AlertCircle className="w-5 h-5 text-destructive" />}
              
              <CardTitle className="text-lg">
                {currentRequest.status === "pending" && "Verification Pending"}
                {currentRequest.status === "approved" && "Active Membership"}
                {currentRequest.status === "rejected" && "Verification Failed"}
              </CardTitle>
            </div>
            <CardDescription className="text-foreground/80 mt-2">
              {currentRequest.status === "pending" && "We are reviewing your payment. You will receive full access once confirmed."}
              {currentRequest.status === "approved" && `Your ${currentRequest.plan} membership is active.`}
              {currentRequest.status === "rejected" && "Your payment could not be verified. Please check the notes or try again."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 gap-4 py-3 border-t border-border/50">
              <div>
                <p className="text-muted-foreground mb-1">Plan</p>
                <p className="font-medium capitalize">{currentRequest.plan}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Amount</p>
                <p className="font-medium">£{(currentRequest.amountPence / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Submitted</p>
                <p className="font-medium">{format(new Date(currentRequest.submittedAt), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Reference</p>
                <p className="font-medium font-mono text-xs mt-0.5">{currentRequest.reference}</p>
              </div>
            </div>
            {currentRequest.reviewNote && (
              <div className="mt-4 p-3 bg-background rounded-md border text-muted-foreground">
                <strong>Admin Note:</strong> {currentRequest.reviewNote}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(!currentRequest || currentRequest.status === "rejected") && (
        <div className="space-y-6">
          <div className="p-4 bg-muted/50 rounded-xl border border-border">
            <p className="text-sm font-medium flex items-start gap-3 text-foreground/80 leading-relaxed">
              <CreditCard className="w-5 h-5 text-primary shrink-0" />
              <span>{verificationNote}</span>
            </p>
          </div>

          {!selectedOfferId ? (
            <div className="max-w-lg mx-auto">
              {offers.map(offer => (
                <Card key={offer.id} className="relative flex flex-col hover:border-primary/40 transition-colors">
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-2xl">{offer.label}</CardTitle>
                    <div className="mt-4 font-serif">
                      <span className="text-4xl font-bold tracking-tight">£{(offer.pricePence / 100).toFixed(2)}</span>
                      <span className="text-muted-foreground ml-1">/{offer.interval}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3 mt-6">
                      {['Full pathway access', 'Private community', 'Direct feedback', 'Early access to updates'].map(feature => (
                        <li key={feature} className="flex items-center text-sm">
                          <Check className="w-4 h-4 mr-3 text-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full h-12" 
                      onClick={() => setSelectedOfferId(offer.id)}
                    >
                      Select Plan
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="max-w-2xl mx-auto border-primary">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedOfferId(null)} className="-ml-3 h-8">
                    &larr; Change Plan
                  </Button>
                  <Badge variant="secondary" className="capitalize">
                    {selectedOffer?.interval}ly Plan
                  </Badge>
                </div>
                <CardTitle className="text-2xl">Confirm Payment</CardTitle>
                <CardDescription>
                  Follow these steps to activate your membership.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">1</div>
                    <div>
                      <p className="font-medium">Send Payment via Revolut</p>
                      {paymentLink ? (
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-sm hover:underline flex items-center mt-1"
                        >
                          Open Revolut Payment Link <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      ) : (
                        <p className="text-sm text-destructive mt-1">The secure payment link is temporarily unavailable.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold mt-1">2</div>
                    <div className="flex-1 space-y-4">
                      <p className="font-medium pt-1.5">Submit Confirmation Details</p>
                      <form id="payment-form" onSubmit={handleConfirmPayment} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reference">Unique Revolut Transfer Reference</Label>
                          <Input 
                            id="reference" 
                            required 
                            placeholder="Enter the exact reference for this transfer"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="note">Optional Note</Label>
                          <Textarea 
                            id="note" 
                            placeholder="Any details to help us identify your payment"
                            className="resize-none"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 p-6 border-t flex justify-end gap-3 rounded-b-xl">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedOfferId(null)}
                  disabled={createRequest.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  form="payment-form"
                  disabled={!reference || createRequest.isPending}
                  className="px-8"
                >
                  {createRequest.isPending ? "Submitting..." : "Submit for Verification"}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
