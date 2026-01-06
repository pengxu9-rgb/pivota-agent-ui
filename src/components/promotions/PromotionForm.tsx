'use client';

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Promotion, PromotionConfig, PromotionType } from "@/types/promotion";
import { toast } from "sonner";

type PromotionFormMode = "create" | "edit";

interface PromotionFormProps {
  mode: PromotionFormMode;
  initial?: Partial<Promotion>;
  onSubmitSuccess: () => void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  description: string;
  merchantId: string;
  type: PromotionType;
  startAt: string; // datetime-local string
  endAt: string; // datetime-local string
  channels: string[];
  scopeGlobal: boolean;
  productIds: string;
  categoryIds: string;
  brandIds: string;
  exposeToCreators: boolean;
  allowedCreatorIds: string;
  config: {
    kind: PromotionConfig["kind"];
    flashPrice?: string;
    originalPrice?: string;
    stockLimit?: string;
    thresholdQuantity?: string;
    discountPercent?: string;
  };
}

const toInputValue = (iso?: string, fallbackMinutes = 0) => {
  const d = iso ? new Date(iso) : new Date();
  if (!iso && fallbackMinutes) {
    d.setMinutes(d.getMinutes() + fallbackMinutes);
  }
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const parseCsv = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function computeLabelPreview(values: {
  type?: PromotionType;
  config?: Partial<PromotionConfig>;
}): string {
  if (!values.type || !values.config) return "";

  if (values.type === "FLASH_SALE" && values.config.kind === "FLASH_SALE") {
    const f = (values.config as any).flashPrice;
    const o = (values.config as any).originalPrice;
    if (f && o) return `Flash deal: from $${o} to $${f}`;
    return "Flash deal";
  }

  if (
    values.type === "MULTI_BUY_DISCOUNT" &&
    values.config.kind === "MULTI_BUY_DISCOUNT"
  ) {
    const q = (values.config as any).thresholdQuantity;
    const d = (values.config as any).discountPercent;
    if (q && d) return `Buy ${q}, get ${d}% off`;
    return "Multi-buy discount";
  }

  return "";
}

export function PromotionForm({
  mode,
  initial,
  onSubmitSuccess,
  onCancel,
}: PromotionFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(() => {
    const defaultStart = toInputValue(undefined, 5);
    const defaultEnd = toInputValue(undefined, 60 * 24 * 7);

    return {
      name: "",
      description: "",
      merchantId: "",
      type: "MULTI_BUY_DISCOUNT",
      startAt: defaultStart,
      endAt: defaultEnd,
      channels: ["creator_agents"],
      scopeGlobal: false,
      productIds: "",
      categoryIds: "",
      brandIds: "",
      exposeToCreators: true,
      allowedCreatorIds: "",
      config: {
        kind: "MULTI_BUY_DISCOUNT",
        thresholdQuantity: "3",
        discountPercent: "10",
      },
    };
  });

  useEffect(() => {
    if (!initial) return;
    const isFlash = initial.type === "FLASH_SALE";
    const isBundle = initial.type === "MULTI_BUY_DISCOUNT";
    const cfg = initial.config as PromotionConfig | undefined;

    setForm({
      name: initial.name ?? "",
      description: initial.description ?? "",
      merchantId:
        initial.merchantId ||
        initial.scope?.merchantIds?.[0] ||
        "",
      type: (initial.type as PromotionType) || "MULTI_BUY_DISCOUNT",
      startAt: toInputValue(initial.startAt),
      endAt: toInputValue(initial.endAt),
      channels: initial.channels || [],
      scopeGlobal: initial.scope?.global === true,
      productIds: (initial.scope?.productIds || []).join(", "),
      categoryIds: (initial.scope?.categoryIds || []).join(", "),
      brandIds: (initial.scope?.brandIds || []).join(", "),
      exposeToCreators: initial.exposeToCreators ?? true,
      allowedCreatorIds: (initial.allowedCreatorIds || []).join(", "),
      config: {
        kind: cfg?.kind || (isFlash ? "FLASH_SALE" : "MULTI_BUY_DISCOUNT"),
        flashPrice: isFlash && cfg && "flashPrice" in cfg ? String(cfg.flashPrice ?? "") : "",
        originalPrice:
          isFlash && cfg && "originalPrice" in cfg ? String(cfg.originalPrice ?? "") : "",
        stockLimit:
          isFlash && cfg && "stockLimit" in cfg && cfg.stockLimit !== undefined
            ? String(cfg.stockLimit)
            : "",
        thresholdQuantity:
          isBundle && cfg && "thresholdQuantity" in cfg
            ? String(cfg.thresholdQuantity ?? "")
            : "3",
        discountPercent:
          isBundle && cfg && "discountPercent" in cfg
            ? String(cfg.discountPercent ?? "")
            : "10",
      },
    });
  }, [initial]);

  const labelPreview = useMemo(
    () =>
      computeLabelPreview({
        type: form.type,
        config:
          form.type === "FLASH_SALE"
            ? {
                kind: "FLASH_SALE",
                flashPrice: Number(form.config.flashPrice),
                originalPrice: Number(form.config.originalPrice),
              }
            : {
                kind: "MULTI_BUY_DISCOUNT",
                thresholdQuantity: Number(form.config.thresholdQuantity),
                discountPercent: Number(form.config.discountPercent),
              },
      }),
    [form]
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleChannel = (channel: string) => {
    setForm((prev) => {
      const exists = prev.channels.includes(channel);
      const channels = exists
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel];
      return { ...prev, channels };
    });
  };

  const handleSubmit = async () => {
    setFormError(null);
    const errors: string[] = [];

    if (!form.name.trim()) errors.push("Name is required.");
    if (!form.merchantId.trim()) errors.push("Merchant ID is required.");
    if (!form.startAt) errors.push("Start time is required.");
    if (!form.endAt) errors.push("End time is required.");
    if (form.channels.length === 0) errors.push("Please select at least one channel.");

    const startDate = form.startAt ? new Date(form.startAt) : null;
    const endDate = form.endAt ? new Date(form.endAt) : null;
    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
      errors.push("End time must be after start time.");
    }

    if (form.type === "FLASH_SALE") {
      const flash = Number(form.config.flashPrice);
      const original = Number(form.config.originalPrice);
      if (!flash || flash <= 0) errors.push("Flash price must be greater than 0.");
      if (!original || original < flash) errors.push("Original price must be >= flash price.");
    } else {
      const qty = Number(form.config.thresholdQuantity);
      const disc = Number(form.config.discountPercent);
      if (!qty || qty < 1) errors.push("Threshold quantity must be at least 1.");
      if (!disc || disc < 1 || disc > 100) {
        errors.push("Discount percent must be between 1 and 100.");
      }
    }

    if (errors.length) {
      setFormError(errors[0]);
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
      merchantId: form.merchantId.trim(),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      channels: form.channels,
      scope: {
        global: form.scopeGlobal,
        merchantIds: form.merchantId.trim() ? [form.merchantId.trim()] : [],
        productIds: form.scopeGlobal ? [] : parseCsv(form.productIds),
        categoryIds: form.scopeGlobal ? [] : parseCsv(form.categoryIds),
        brandIds: form.scopeGlobal ? [] : parseCsv(form.brandIds),
      },
      config:
        form.type === "FLASH_SALE"
          ? {
              kind: "FLASH_SALE",
              flashPrice: Number(form.config.flashPrice),
              originalPrice: Number(form.config.originalPrice),
              ...(form.config.stockLimit
                ? { stockLimit: Number(form.config.stockLimit) }
                : {}),
            }
          : {
              kind: "MULTI_BUY_DISCOUNT",
              thresholdQuantity: Number(form.config.thresholdQuantity),
              discountPercent: Number(form.config.discountPercent),
            },
      exposeToCreators: form.exposeToCreators,
      allowedCreatorIds: form.exposeToCreators
        ? parseCsv(form.allowedCreatorIds)
        : [],
    };

    setSubmitting(true);
    try {
      const res = await fetch(
        mode === "create"
          ? "/api/promotions"
          : `/api/promotions/${initial?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save promotion.");
      }

      toast.success(
        mode === "create"
          ? "Promotion created."
          : "Promotion updated."
      );
      onSubmitSuccess();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Failed to save promotion. Please try again.");
      toast.error("Failed to save promotion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">
            {mode === "create" ? "New promotion" : "Edit promotion"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure a promotion used by creator agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {formError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Hoodie bundle"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Internal notes"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start</label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
                value={form.startAt}
                onChange={(e) => updateField("startAt", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End</label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
                value={form.endAt}
                onChange={(e) => updateField("endAt", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Merchant ID</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              value={form.merchantId}
              onChange={(e) => updateField("merchantId", e.target.value)}
              placeholder="merch_xxx"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-2">
              {(["FLASH_SALE", "MULTI_BUY_DISCOUNT"] as PromotionType[]).map((t) => (
                <Button
                  key={t}
                  variant={form.type === t ? "gradient" : "outline"}
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      type: t,
                      config:
                        t === "FLASH_SALE"
                          ? {
                              kind: "FLASH_SALE",
                              flashPrice: "",
                              originalPrice: "",
                              stockLimit: "",
                            }
                          : {
                              kind: "MULTI_BUY_DISCOUNT",
                              thresholdQuantity: "",
                              discountPercent: "",
                            },
                    }))
                  }
                >
                  {t === "FLASH_SALE" ? "Flash sale" : "Multi-buy discount"}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Channels</label>
            <div className="flex flex-wrap gap-2">
              {(["web", "app", "creator_agents"] as const).map((channel) => (
                <Badge
                  key={channel}
                  variant={form.channels.includes(channel) ? "gradient" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleChannel(channel)}
                >
                  {channel}
                </Badge>
              ))}
            </div>
            {form.channels.length === 0 && (
              <p className="text-xs text-destructive">Please select at least one channel.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Scope</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.scopeGlobal}
                  onChange={(e) => updateField("scopeGlobal", e.target.checked)}
                />
                Global
              </label>
            </div>
            {!form.scopeGlobal && (
              <div className="space-y-2">
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Product IDs (comma separated)"
                  value={form.productIds}
                  onChange={(e) => updateField("productIds", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Category IDs (comma separated)"
                  value={form.categoryIds}
                  onChange={(e) => updateField("categoryIds", e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Brand IDs (comma separated)"
                  value={form.brandIds}
                  onChange={(e) => updateField("brandIds", e.target.value)}
                />
              </div>
            )}
            {form.scopeGlobal && (
              <p className="text-xs text-muted-foreground">
                Global scope ignores product/category/brand filters.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-border bg-card/50 p-4">
            <label className="text-sm font-medium">Config</label>
            {form.type === "FLASH_SALE" ? (
              <div className="grid grid-cols-3 gap-3">
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Flash price"
                  value={form.config.flashPrice || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...prev.config, flashPrice: e.target.value },
                    }))
                  }
                />
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Original price"
                  value={form.config.originalPrice || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...prev.config, originalPrice: e.target.value },
                    }))
                  }
                />
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Stock limit (optional)"
                  value={form.config.stockLimit || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...prev.config, stockLimit: e.target.value },
                    }))
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Threshold quantity"
                  value={form.config.thresholdQuantity || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...prev.config, thresholdQuantity: e.target.value },
                    }))
                  }
                />
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Discount percent"
                  value={form.config.discountPercent || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...prev.config, discountPercent: e.target.value },
                    }))
                  }
                />
              </div>
            )}
            <div className="rounded-xl bg-muted/20 border border-border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Label preview</p>
              {labelPreview ? (
                <p className="font-medium">{labelPreview}</p>
              ) : (
                <p className="text-muted-foreground">Configure the promotion to see a preview.</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Creator exposure</label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.exposeToCreators}
                  onChange={(e) => updateField("exposeToCreators", e.target.checked)}
                />
                Visible to creator agents
              </label>
            </div>
            {form.exposeToCreators ? (
              <div className="space-y-2">
                <input
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Allowed creator IDs (comma separated, optional)"
                  value={form.allowedCreatorIds}
                  onChange={(e) => updateField("allowedCreatorIds", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to expose to all creators. Fill to restrict.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                This promotion will not be used by Creator Agents.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
