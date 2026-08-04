/**
 * payment.service.ts
 * Server-side gateway verification for bKash, Nagad, and SSLCommerz.
 *
 * All credentials are read from environment variables — never hardcoded.
 * Sandbox / production is controlled by PAYMENT_SANDBOX=true|false.
 *
 * Flow per gateway:
 *   1. initiate()   → create payment session on gateway, return payment URL
 *   2. User pays on gateway page
 *   3. Gateway calls our webhook (IPN)
 *   4. verify()     → confirm with gateway API that the payment is genuine
 *   5. Wallet is credited only after verify() returns success
 */

import { logger } from "./logger";

const SANDBOX = process.env["PAYMENT_SANDBOX"] !== "false"; // default true in dev

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type GatewayName = "bkash" | "nagad" | "sslcommerz";

export interface InitiateResult {
  gatewayPaymentId: string;
  paymentUrl: string;
}

export interface VerifyResult {
  success: boolean;
  gatewayRef: string;       // final transaction ID from gateway
  paidAmountBDT: number;    // amount the gateway actually collected
  rawResponse: unknown;     // stored for audit
  failureReason?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   bKash Tokenized Checkout
   Docs: https://developer.bka.sh/docs/tokenized-payment-integration
   ═══════════════════════════════════════════════════════════════════════════ */

const BKASH = {
  appKey: process.env["BKASH_APP_KEY"] ?? "",
  appSecret: process.env["BKASH_APP_SECRET"] ?? "",
  username: process.env["BKASH_USERNAME"] ?? "",
  password: process.env["BKASH_PASSWORD"] ?? "",
  baseUrl: SANDBOX
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout",
};

/** In-memory token cache. TTL ~55 minutes (tokens expire in 60 min). */
let bkashToken: { token: string; expiresAt: number } | null = null;

async function bkashGrantToken(): Promise<string> {
  if (bkashToken && bkashToken.expiresAt > Date.now()) {
    return bkashToken.token;
  }

  const res = await fetch(`${BKASH.baseUrl}/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: BKASH.username,
      password: BKASH.password,
    },
    body: JSON.stringify({
      app_key: BKASH.appKey,
      app_secret: BKASH.appSecret,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || !data["id_token"]) {
    logger.error({ data }, "bKash token grant failed");
    throw new Error(`bKash token grant failed: ${JSON.stringify(data)}`);
  }

  const token = data["id_token"] as string;
  bkashToken = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

export async function bkashInitiate(params: {
  orderId: string;
  amountBDT: number;
  callbackUrl: string;
}): Promise<InitiateResult> {
  const token = await bkashGrantToken();

  const res = await fetch(`${BKASH.baseUrl}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: token,
      "x-app-key": BKASH.appKey,
    },
    body: JSON.stringify({
      mode: "0011",
      payerReference: params.orderId,
      callbackURL: params.callbackUrl,
      amount: params.amountBDT.toFixed(2),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: params.orderId,
    }),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || data["statusCode"] !== "0000") {
    throw new Error(`bKash create failed: ${JSON.stringify(data)}`);
  }

  return {
    gatewayPaymentId: data["paymentID"] as string,
    paymentUrl: data["bkashURL"] as string,
  };
}

export async function bkashVerify(params: {
  paymentId: string;
  expectedAmountBDT: number;
}): Promise<VerifyResult> {
  const token = await bkashGrantToken();

  // Execute the payment first (bKash requires explicit execute after callback)
  const execRes = await fetch(`${BKASH.baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: token,
      "x-app-key": BKASH.appKey,
    },
    body: JSON.stringify({ paymentID: params.paymentId }),
  });

  const execData = (await execRes.json()) as Record<string, unknown>;

  // If already executed, query instead
  if (execData["statusCode"] === "2023") {
    return bkashQuery({ paymentId: params.paymentId, expectedAmountBDT: params.expectedAmountBDT });
  }

  if (!execRes.ok || execData["statusCode"] !== "0000") {
    return {
      success: false,
      gatewayRef: "",
      paidAmountBDT: 0,
      rawResponse: execData,
      failureReason: `Execute failed: ${execData["statusMessage"] ?? "unknown"}`,
    };
  }

  const paidAmount = Number(execData["amount"]);
  if (Math.abs(paidAmount - params.expectedAmountBDT) > 0.01) {
    return {
      success: false,
      gatewayRef: execData["trxID"] as string ?? "",
      paidAmountBDT: paidAmount,
      rawResponse: execData,
      failureReason: `Amount mismatch: expected ${params.expectedAmountBDT}, got ${paidAmount}`,
    };
  }

  return {
    success: true,
    gatewayRef: execData["trxID"] as string,
    paidAmountBDT: paidAmount,
    rawResponse: execData,
  };
}

async function bkashQuery(params: {
  paymentId: string;
  expectedAmountBDT: number;
}): Promise<VerifyResult> {
  const token = await bkashGrantToken();

  const res = await fetch(`${BKASH.baseUrl}/payment/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: token,
      "x-app-key": BKASH.appKey,
    },
    body: JSON.stringify({ paymentID: params.paymentId }),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (data["transactionStatus"] !== "Completed") {
    return {
      success: false,
      gatewayRef: data["trxID"] as string ?? "",
      paidAmountBDT: 0,
      rawResponse: data,
      failureReason: `Payment not completed: ${data["transactionStatus"]}`,
    };
  }

  const paidAmount = Number(data["amount"]);
  if (Math.abs(paidAmount - params.expectedAmountBDT) > 0.01) {
    return {
      success: false,
      gatewayRef: data["trxID"] as string ?? "",
      paidAmountBDT: paidAmount,
      rawResponse: data,
      failureReason: `Amount mismatch: expected ${params.expectedAmountBDT}, got ${paidAmount}`,
    };
  }

  return {
    success: true,
    gatewayRef: data["trxID"] as string,
    paidAmountBDT: paidAmount,
    rawResponse: data,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Nagad
   Docs: https://nagad.com.bd/developer
   ═══════════════════════════════════════════════════════════════════════════ */

const NAGAD = {
  merchantId: process.env["NAGAD_MERCHANT_ID"] ?? "",
  merchantKey: process.env["NAGAD_MERCHANT_KEY"] ?? "",
  baseUrl: SANDBOX
    ? "https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0"
    : "https://api.mynagad.com/api/dfs",
};

export async function nagadInitiate(params: {
  orderId: string;
  amountBDT: number;
  callbackUrl: string;
}): Promise<InitiateResult> {
  // Step 1: Get challenge from Nagad
  const challengeRes = await fetch(
    `${NAGAD.baseUrl}/check-out/initialize/${NAGAD.merchantId}/${params.orderId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KM-IP-V4": "127.0.0.1", "X-KM-Client-Type": "PC", "X-KM-Api-Version": "v-0.2.0" },
      body: JSON.stringify({
        dateTime: new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14),
        sensitiveData: await nagadEncrypt({
          merchantId: NAGAD.merchantId,
          datetime: new Date().toISOString(),
          orderId: params.orderId,
          challenge: "",
        }),
        signature: await nagadSign(params.orderId),
      }),
    },
  );

  const challengeData = (await challengeRes.json()) as Record<string, unknown>;

  if (!challengeRes.ok || !challengeData["sensitiveData"]) {
    throw new Error(`Nagad init failed: ${JSON.stringify(challengeData)}`);
  }

  // Step 2: Complete checkout
  const checkoutRes = await fetch(
    `${NAGAD.baseUrl}/check-out/complete/${NAGAD.merchantId}/${params.orderId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KM-IP-V4": "127.0.0.1", "X-KM-Client-Type": "PC", "X-KM-Api-Version": "v-0.2.0" },
      body: JSON.stringify({
        sensitiveData: await nagadEncrypt({
          merchantId: NAGAD.merchantId,
          orderId: params.orderId,
          amount: params.amountBDT.toFixed(2),
          currencyCode: "050",
          challenge: challengeData["sensitiveData"] as string,
          callbackURL: params.callbackUrl,
          additionalMerchantInfo: {},
        }),
        signature: await nagadSign(params.orderId),
        merchantCallbackURL: params.callbackUrl,
      }),
    },
  );

  const checkoutData = (await checkoutRes.json()) as Record<string, unknown>;

  if (!checkoutRes.ok || !checkoutData["callBackUrl"]) {
    throw new Error(`Nagad checkout failed: ${JSON.stringify(checkoutData)}`);
  }

  return {
    gatewayPaymentId: params.orderId,
    paymentUrl: checkoutData["callBackUrl"] as string,
  };
}

export async function nagadVerify(params: {
  paymentRefId: string;
  expectedAmountBDT: number;
}): Promise<VerifyResult> {
  const res = await fetch(
    `${NAGAD.baseUrl}/verify/payment/${params.paymentRefId}`,
    {
      method: "GET",
      headers: { "X-KM-Api-Version": "v-0.2.0" },
    },
  );

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || data["status"] !== "Success") {
    return {
      success: false,
      gatewayRef: data["merchantOrderId"] as string ?? "",
      paidAmountBDT: 0,
      rawResponse: data,
      failureReason: `Nagad verify failed: ${data["status"]}`,
    };
  }

  const paidAmount = Number(data["amount"]);
  if (Math.abs(paidAmount - params.expectedAmountBDT) > 0.01) {
    return {
      success: false,
      gatewayRef: data["bankTxnId"] as string ?? "",
      paidAmountBDT: paidAmount,
      rawResponse: data,
      failureReason: `Amount mismatch: expected ${params.expectedAmountBDT}, got ${paidAmount}`,
    };
  }

  return {
    success: true,
    gatewayRef: data["bankTxnId"] as string,
    paidAmountBDT: paidAmount,
    rawResponse: data,
  };
}

/** Nagad requires RSA encryption of sensitive data with merchant public key. */
async function nagadEncrypt(data: unknown): Promise<string> {
  // Real implementation: RSA-PKCS1 encrypt with Nagad's public key
  // Placeholder returns base64 of JSON (replace with actual crypto in production)
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/** Nagad requires RSA signature with merchant private key. */
async function nagadSign(data: string): Promise<string> {
  // Real implementation: SHA256withRSA sign with merchant private key
  // Placeholder (replace with actual crypto in production)
  return Buffer.from(data + NAGAD.merchantKey).toString("base64").slice(0, 32);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SSLCommerz
   Docs: https://developer.sslcommerz.com
   ═══════════════════════════════════════════════════════════════════════════ */

const SSL = {
  storeId: process.env["SSLCOMMERZ_STORE_ID"] ?? "",
  storePasswd: process.env["SSLCOMMERZ_STORE_PASSWD"] ?? "",
  baseUrl: SANDBOX
    ? "https://sandbox.sslcommerz.com"
    : "https://securepay.sslcommerz.com",
};

export async function sslInitiate(params: {
  orderId: string;
  amountBDT: number;
  callbackUrl: string;
  customerName: string;
  customerEmail: string;
}): Promise<InitiateResult> {
  const body = new URLSearchParams({
    store_id: SSL.storeId,
    store_passwd: SSL.storePasswd,
    total_amount: params.amountBDT.toFixed(2),
    currency: "BDT",
    tran_id: params.orderId,
    success_url: params.callbackUrl,
    fail_url: params.callbackUrl,
    cancel_url: params.callbackUrl,
    ipn_url: params.callbackUrl.replace("/callback", "/webhook/sslcommerz"),
    cus_name: params.customerName,
    cus_email: params.customerEmail,
    cus_phone: "01700000000",
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    product_name: "Ludo Coins",
    product_category: "Gaming",
    product_profile: "general",
  });

  const res = await fetch(`${SSL.baseUrl}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || data["status"] !== "SUCCESS") {
    throw new Error(`SSLCommerz init failed: ${JSON.stringify(data)}`);
  }

  return {
    gatewayPaymentId: params.orderId,
    paymentUrl: data["GatewayPageURL"] as string,
  };
}

export async function sslVerify(params: {
  valId: string;
  expectedAmountBDT: number;
}): Promise<VerifyResult> {
  const url = new URL(`${SSL.baseUrl}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", params.valId);
  url.searchParams.set("store_id", SSL.storeId);
  url.searchParams.set("store_passwd", SSL.storePasswd);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok || (data["status"] !== "VALID" && data["status"] !== "VALIDATED")) {
    return {
      success: false,
      gatewayRef: data["tran_id"] as string ?? "",
      paidAmountBDT: 0,
      rawResponse: data,
      failureReason: `SSLCommerz status: ${data["status"]}`,
    };
  }

  const paidAmount = Number(data["amount"]);
  if (Math.abs(paidAmount - params.expectedAmountBDT) > 0.01) {
    return {
      success: false,
      gatewayRef: data["bank_tran_id"] as string ?? "",
      paidAmountBDT: paidAmount,
      rawResponse: data,
      failureReason: `Amount mismatch: expected ${params.expectedAmountBDT}, got ${paidAmount}`,
    };
  }

  return {
    success: true,
    gatewayRef: data["bank_tran_id"] as string,
    paidAmountBDT: paidAmount,
    rawResponse: data,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Webhook signature verification
   Each gateway sends a signature we must verify to reject spoofed webhooks.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createHmac } from "crypto";

/**
 * Verify a bKash webhook signature.
 * bKash signs using HMAC-SHA256 with the app secret.
 * Header: x-bkash-signature
 */
export function verifyBkashSignature(payload: string, signature: string): boolean {
  if (!BKASH.appSecret) return false;
  const expected = createHmac("sha256", BKASH.appSecret)
    .update(payload)
    .digest("hex");
  return timingSafeEqual(expected, signature);
}

/**
 * SSLCommerz IPN verification: they send verify_sign in the POST body.
 * Rebuild MD5 hash and compare.
 */
export function verifySslIpnSignature(body: Record<string, string>): boolean {
  const { verify_sign, verify_key } = body;
  if (!verify_sign || !verify_key) return false;

  const keys = verify_key.split(",");
  const parts: string[] = [SSL.storePasswd];
  for (const key of keys) {
    parts.push(`${key}=${body[key] ?? ""}`);
  }

  const { createHash } = require("crypto");
  const hash = createHash("md5").update(parts.join("&")).digest("hex");
  return hash === verify_sign;
}

/** Timing-safe string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const { timingSafeEqual: tse } = require("crypto");
  return tse(Buffer.from(a), Buffer.from(b));
}

/* ─── Dispatcher ───────────────────────────────────────────────────────────── */

export async function initiatePayment(
  gateway: GatewayName,
  params: {
    orderId: string;
    amountBDT: number;
    callbackUrl: string;
    customerName?: string;
    customerEmail?: string;
  },
): Promise<InitiateResult> {
  switch (gateway) {
    case "bkash":
      return bkashInitiate(params);
    case "nagad":
      return nagadInitiate(params);
    case "sslcommerz":
      return sslInitiate({
        ...params,
        customerName: params.customerName ?? "Player",
        customerEmail: params.customerEmail ?? "player@ludo.app",
      });
    default:
      throw new Error(`Unknown gateway: ${gateway}`);
  }
}
