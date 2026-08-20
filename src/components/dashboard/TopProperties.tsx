"use client";

import Link from "next/link";
import { ArrowUpRight, Eye, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyThumb } from "@/components/dashboard/PropertyThumb";
import type { TopPropertyView } from "@/components/dashboard/types";
import { formatCount, formatPct } from "@/components/dashboard/format";

interface TopPropertiesProps {
  top: TopPropertyView[];
  loading: boolean;
}

export function TopProperties({ top, loading }: TopPropertiesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          Destaques · 7 dias
        </CardTitle>
        <CardDescription>Os mais visitados do seu portfólio</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : top.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center">
            <p className="text-sm text-ink-300">Sem engajamento nesta janela ainda.</p>
            <p className="mt-1 text-xs text-ink-400">As visitas ao portal aparecem aqui em tempo real.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {top.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-ink-400">
                  {index + 1}
                </span>
                <PropertyThumb
                  url={item.coverImage}
                  title={item.title}
                  category={item.category}
                  className="h-11 w-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={item.slug ? `/imovel/${encodeURIComponent(item.slug)}` : "#"}
                      className="truncate text-sm font-medium text-ink-100 hover:text-brand-300"
                    >
                      {item.title}
                    </Link>
                    {item.slug && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
                  </div>
                  <p className="truncate text-xs text-ink-400">
                    {item.code}
                    {item.priceLabel ? ` · ${item.priceLabel.label}${item.priceLabel.period ?? ""}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="flex items-center gap-1 text-sm tabular-nums text-ink-200">
                    <Eye className="h-3.5 w-3.5 text-ink-500" />
                    {formatCount(item.views7d)}
                  </span>
                  {item.views7d > 0 ? (
                    <Badge variant="info" className="tabular-nums">
                      {formatPct(item.conversionRate)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-ink-500">—</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}