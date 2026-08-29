import assert from "node:assert/strict";
import test from "node:test";

import {
  CreatePaymentRequestBody,
  GetMembershipResponse,
  ListAdminPaymentRequestsResponse,
  ListPaymentRequestsResponse,
  ReviewPaymentRequestResponse,
} from "../../../lib/api-zod/src/generated/api.ts";

const annualPayment = {
  id: 42,
  plan: "year",
  amountPence: 24000,
  currency: "GBP",
  paidAt: "2026-01-10T12:00:00.000Z",
  reference: "legacy-annual",
  note: null,
  status: "pending",
  submittedAt: "2026-01-10T12:05:00.000Z",
  reviewedAt: null,
  reviewNote: null,
};

test("new payment confirmations accept only the £5 monthly plan", () => {
  assert.equal(CreatePaymentRequestBody.safeParse({
    plan: "month",
    amountPence: 500,
    paidAt: "2026-08-28T12:00:00.000Z",
    reference: "monthly-reference",
  }).success, true);

  assert.equal(CreatePaymentRequestBody.safeParse({
    plan: "year",
    amountPence: 24000,
    paidAt: "2026-08-28T12:00:00.000Z",
    reference: "annual-reference",
  }).success, false);
});

test("historical annual payments remain valid in membership and history responses", () => {
  assert.doesNotThrow(() => GetMembershipResponse.parse({
    provider: "revolut",
    currency: "GBP",
    offers: [{
      id: "builder-monthly",
      label: "Builder Monthly",
      interval: "month",
      pricePence: 500,
      currency: "GBP",
      paymentLink: "https://checkout.revolut.com/pay/example",
    }],
    verificationNote: "Admin verification required.",
    currentRequest: annualPayment,
  }));

  assert.doesNotThrow(() => ListPaymentRequestsResponse.parse([annualPayment]));
});

test("historical annual payments remain valid in admin list and review responses", () => {
  const adminPayment = {
    ...annualPayment,
    memberId: 7,
    memberName: "Legacy Annual Member",
    memberEmail: "legacy-annual@example.com",
  };

  assert.doesNotThrow(() => ListAdminPaymentRequestsResponse.parse([adminPayment]));
  assert.doesNotThrow(() => ReviewPaymentRequestResponse.parse({
    ...adminPayment,
    status: "approved",
    reviewedAt: "2026-08-28T12:00:00.000Z",
  }));
});