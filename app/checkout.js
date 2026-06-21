// ───────────────────────────────────────────────────────────────
// TackT Pro — checkout adapter (STUB)
//
// This is the ONLY file that should know about a payment provider.
// pro.js calls TacktCheckout.start(); everything else stays provider-agnostic.
//
// Today it's intentionally not configured — start() returns false, so the
// paywall falls back to a "notify me when Pro lands" capture. No payments,
// no keys, no API cost.
//
// TO GO LIVE (later):
//   1. Create a Stripe account + a "TackT Pro" Price; copy its price_id.
//   2. Deploy a Supabase edge function `stripe-checkout` that creates a
//      Checkout Session for the signed-in user and returns { url }.
//   3. Deploy `stripe-webhook` (service role) that, on checkout.session
//      .completed, upserts public.wo_entitlements -> tier='pro', source='stripe'.
//   4. Flip CONFIGURED to true and fill PRICE_ID / FN_URL below.
// ───────────────────────────────────────────────────────────────
window.TacktCheckout = (function () {
  const CONFIGURED = false;                 // ← flip to true when wired
  const PRICE_ID   = "";                    // ← Stripe price_id (e.g. price_123)
  const FN_URL     = "";                    // ← Supabase edge fn URL for checkout session

  // Returns true if a real checkout flow was launched, false if not configured.
  async function start(/* { userId, email, feature } */ ctx) {
    if (!CONFIGURED || !PRICE_ID || !FN_URL) return false;
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: PRICE_ID, user_id: ctx?.userId, email: ctx?.email }),
      });
      const { url } = await res.json();
      if (!url) return false;
      window.location.href = url;           // hand off to Stripe Checkout
      return true;
    } catch (e) {
      console.warn("[Tackt] checkout failed", e);
      return false;
    }
  }

  return { start, isConfigured: () => CONFIGURED };
})();
