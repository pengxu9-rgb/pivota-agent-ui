export function shouldAllowLegacyProductDetailBroadScan(args: {
  productId?: string | null;
  merchantId?: string | null;
  entryPoint?: string | null;
}): boolean {
  const productId = String(args.productId || "").trim().toLowerCase();
  const merchantId = String(args.merchantId || "").trim().toLowerCase();
  const entryPoint = String(args.entryPoint || "").trim().toLowerCase();

  if (merchantId === "external_seed") return true;
  if (productId.startsWith("ext_") || productId.startsWith("ext:")) return true;
  if (entryPoint === "creator_pdp_alias") return true;
  return false;
}
