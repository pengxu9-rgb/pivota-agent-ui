'use client';

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { PromotionForm } from "@/components/promotions/PromotionForm";
import type { Promotion, PromotionStatus, PromotionType } from "@/types/promotion";
import { computePromotionStatus } from "@/types/promotion";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCcw, X } from "lucide-react";

type FilterStatus = "ALL" | PromotionStatus;
type FilterType = "ALL" | PromotionType;

interface PromotionApiResponse {
  promotions?: any[];
}

export default function PromotionsConsolePage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<FilterType>("ALL");
  const [creatorVisibleOnly, setCreatorVisibleOnly] = useState(false);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | undefined>(undefined);

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/promotions", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load promotions.");
      }
      const data = (await res.json()) as PromotionApiResponse;
      const normalized =
        data.promotions?.map((p) => {
          const merchantId =
            p.merchantId ||
            p.merchant_id ||
            p.scope?.merchantIds?.[0] ||
            p.scope?.merchant_ids?.[0] ||
            "—";
          return {
            humanReadableRule: p.humanReadableRule || p.human_readable_rule || "",
            allowedCreatorIds: p.allowedCreatorIds || p.allowed_creator_ids || [],
            exposeToCreators:
              p.exposeToCreators !== undefined
                ? p.exposeToCreators
                : p.expose_to_creators ?? true,
            ...p,
            merchantId,
            scope: {
              productIds: p.scope?.productIds || p.scope?.product_ids || [],
              categoryIds: p.scope?.categoryIds || p.scope?.category_ids || [],
              brandIds: p.scope?.brandIds || p.scope?.brand_ids || [],
              global: p.scope?.global ?? false,
              merchantIds: p.scope?.merchantIds || p.scope?.merchant_ids || [],
            },
          } as Promotion;
        }) || [];
      setPromotions(normalized);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load promotions.");
      toast.error("Failed to load promotions.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPromotions = useMemo(() => {
    return promotions.filter((p) => {
      const status = computePromotionStatus(p);
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
      if (creatorVisibleOnly && !p.exposeToCreators) return false;

      if (search.trim()) {
        const term = search.toLowerCase();
        const haystack = `${p.name} ${p.description || ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [promotions, statusFilter, typeFilter, creatorVisibleOnly, search]);

  const openCreate = () => {
    setFormMode("create");
    setSelectedPromotion(undefined);
    setShowForm(true);
  };

  const openEdit = (promotion: Promotion) => {
    setFormMode("edit");
    setSelectedPromotion(promotion);
    setShowForm(true);
  };

  const handleDelete = async (promotion: Promotion) => {
    const confirmDelete = window.confirm(
      `Delete "${promotion.name}"? This removes it from Creator Agents.`
    );
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/promotions/${promotion.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete promotion.");
      }
      toast.success("Promotion deleted.");
      loadPromotions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete promotion.");
    }
  };

  const handleEnd = async (promotion: Promotion) => {
    const confirmEnd = window.confirm(`End "${promotion.name}" now?`);
    if (!confirmEnd) return;
    try {
      const res = await fetch(`/api/promotions/${promotion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endAt: new Date().toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to end promotion.");
      }
      toast.success("Promotion ended.");
      loadPromotions();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to end promotion.");
    }
  };

  const renderStatusBadge = (promotion: Promotion) => {
    const status = computePromotionStatus(promotion);
    const styles: Record<PromotionStatus, string> = {
      ACTIVE: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
      UPCOMING: "bg-sky-500/15 text-sky-200 border border-sky-500/40",
      ENDED: "bg-slate-500/20 text-slate-200 border border-slate-500/40",
    };
    return (
      <span className={`px-3 py-1 text-xs rounded-full ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const scopeSummary = (promotion: Promotion) => {
    if (promotion.scope?.global) return "Global";
    const counts = [
      promotion.scope?.productIds?.length ? `${promotion.scope.productIds.length} products` : null,
      promotion.scope?.categoryIds?.length ? `${promotion.scope.categoryIds.length} categories` : null,
      promotion.scope?.brandIds?.length ? `${promotion.scope.brandIds.length} brands` : null,
    ].filter(Boolean);
    return counts.join(" · ") || "Scoped";
  };

  const creatorVisibility = (promotion: Promotion) => {
    if (!promotion.exposeToCreators) return "Off";
    if (promotion.allowedCreatorIds && promotion.allowedCreatorIds.length > 0) {
      return `On (${promotion.allowedCreatorIds.length} creators)`;
    }
    return "On (all creators)";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Promotions</h1>
            <p className="text-sm text-muted-foreground">
              Internal console for managing merchant deals used by creator agents.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={loadPromotions} disabled={isLoading}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="gradient" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New promotion
            </Button>
          </div>
        </div>

        <GlassCard className="p-5 bg-white/5">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="flex gap-2 items-center">
              {(["ALL", "ACTIVE", "UPCOMING", "ENDED"] as FilterStatus[]).map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={statusFilter === status ? "gradient" : "outline"}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "ALL" ? "All" : status}
                </Button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              {(["ALL", "FLASH_SALE", "MULTI_BUY_DISCOUNT"] as FilterType[]).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={typeFilter === type ? "secondary" : "outline"}
                  onClick={() => setTypeFilter(type)}
                >
                  {type === "ALL"
                    ? "All types"
                    : type === "FLASH_SALE"
                    ? "Flash sale"
                    : "Multi-buy"}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={creatorVisibleOnly}
                onChange={(e) => setCreatorVisibleOnly(e.target.checked)}
              />
              Creator-visible only
            </label>
            <div className="ml-auto w-full sm:w-64">
              <input
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="Search name or description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading promotions...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-destructive">{error}</div>
          ) : filteredPromotions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No promotions match these filters. Create one to start testing deals.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 text-left font-medium">Name</th>
                    <th className="py-3 text-left font-medium">Merchant</th>
                    <th className="py-3 text-left font-medium">Type</th>
                    <th className="py-3 text-left font-medium">Status</th>
                    <th className="py-3 text-left font-medium">Channels</th>
                    <th className="py-3 text-left font-medium">Scope</th>
                    <th className="py-3 text-left font-medium">Creator agents</th>
                    <th className="py-3 text-left font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredPromotions.map((promotion) => (
                    <tr key={promotion.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold">{promotion.name}</span>
                          {promotion.description && (
                            <span className="text-xs text-muted-foreground">
                              {promotion.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">{promotion.merchantId || "—"}</td>
                      <td className="py-3">
                        <Badge variant="outline">
                          {promotion.type === "FLASH_SALE" ? "Flash sale" : "Multi-buy"}
                        </Badge>
                      </td>
                      <td className="py-3">{renderStatusBadge(promotion)}</td>
                      <td className="py-3">
                        <div className="flex gap-1 flex-wrap">
                          {promotion.channels?.map((ch) => (
                            <Badge key={ch} variant="secondary" className="capitalize">
                              {ch.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {scopeSummary(promotion)}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {creatorVisibility(promotion)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(promotion)}>
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleEnd(promotion)}>
                            End
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(promotion)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-10 px-4">
          <div className="relative w-full max-w-5xl">
            <GlassCard className="p-6 bg-white/10 border-white/20">
              <div className="absolute right-4 top-4">
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <PromotionForm
                mode={formMode}
                initial={selectedPromotion}
                onSubmitSuccess={() => {
                  setShowForm(false);
                  loadPromotions();
                }}
                onCancel={() => setShowForm(false)}
              />
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
