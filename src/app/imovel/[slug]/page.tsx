import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  BedDouble,
  Bath,
  Car,
  MapPin,
  Building2,
  Ruler,
  CalendarClock,
  Star,
  MessageCircle,
  Mail,
  Phone,
} from "lucide-react";
import { getPublicListing, listSimilar } from "@/lib/public/repository";
import { listingMetadata, listingJsonLd } from "@/lib/public/seo";
import { CATEGORY_LABELS } from "@/lib/public/types";
import { formatArea, locationLabel, priceFor } from "@/lib/public/format";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { Gallery } from "@/components/portal/Gallery";
import { VideoGallery } from "@/components/portal/VideoGallery";
import { PropertyCard } from "@/components/portal/PropertyCard";
import { ContactModal } from "@/components/portal/ContactModal";
import { ShareButtons } from "@/components/portal/ShareButtons";
import { FavoriteButton } from "@/components/portal/FavoriteButton";
import { ViewTracker } from "@/components/portal/ViewTracker";
import type { PublicProperty } from "@/lib/public/types";

export const revalidate = 300;

const ListingMap = dynamic(() => import("@/components/portal/ListingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 w-full animate-pulse items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-400">
      Carregando mapa…
    </div>
  ),
});

interface PDPProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PDPProps): Promise<Metadata> {
  const property = await getPublicListing(decodeURIComponent(params.slug));
  return property ? listingMetadata(property) : { title: "Imóvel não encontrado | imobFlow" };
}

function SpecItem({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
      <Icon className="mx-auto h-5 w-5 text-brand-600" />
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default async function PDP({ params }: PDPProps) {
  const property = await getPublicListing(decodeURIComponent(params.slug));
  if (!property) notFound();

  const similar = await listSimilar(params.slug, 3);
  const price = priceFor(property, { compact: true });
  const specItems = [
    { icon: BedDouble, label: "Quartos", value: property.bedrooms ?? "—" },
    { icon: Bath, label: "Banheiros", value: property.bathrooms ?? "—" },
    { icon: Car, label: "Vagas", value: property.parkingSpots ?? "—" },
    { icon: Ruler, label: "Área", value: property.area ? formatArea(property.area) : "—" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />
      <ViewTracker propertyId={property.id} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listingJsonLd(property)) }}
        />

        <Link
          href="/imoveis"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para busca
        </Link>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Gallery + main content */}
          <div className="lg:col-span-2">
            <Gallery images={property.images} title={property.title} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 pl-1 pr-3 text-sm font-medium text-slate-600">
                <FavoriteButton propertyId={property.id} />
                Favorito
              </div>
              <ShareButtons url={`/imovel/${encodeURIComponent(property.slug ?? "")}`} title={property.title} />
            </div>

            {property.videos.length > 0 && (
              <div className="mt-6">
                <VideoGallery videos={property.videos} poster={property.coverImage?.url} />
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPin className="h-4 w-4" />
                    {locationLabel(property, { withNeighborhood: true })}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{property.title}</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {CATEGORY_LABELS[property.category]} · Código {property.code}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold tracking-tight text-brand-600">
                    {price.label}
                    {price.period && <span className="text-base font-medium text-slate-400">{price.period}</span>}
                  </p>
                  {property.condoFee != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      Condomínio: R$ {Number(property.condoFee).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {specItems.map((s) => (
                  <SpecItem key={s.label} icon={s.icon} label={s.label} value={s.value} />
                ))}
              </div>
            </div>

            {property.description && (
              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-900">Descrição</h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{property.description}</p>
              </section>
            )}

            {(property.latitude && property.longitude) && (
              <section className="mt-6">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">Localização</h2>
                <ListingMap
                  latitude={Number(property.latitude)}
                  longitude={Number(property.longitude)}
                  title={property.title}
                />
              </section>
            )}
          </div>

          {/* Sidebar: broker card + contact */}
          <aside className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white shadow-lg">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100/80">Fale direto</h2>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-white">{property.broker?.name ?? property.tenantName}</p>
                  <p className="text-sm text-emerald-100/90">
                    {property.broker ? property.tenantName : "Imobiliária parceira"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {property.broker?.email && (
                  <a
                    href={`mailto:${property.broker.email}`}
                    className="flex items-center gap-2 text-emerald-50 transition-colors hover:text-white"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-white/70" />
                    <span className="truncate">{property.broker.email}</span>
                  </a>
                )}
                {property.broker?.phone && (
                  <a
                    href={`tel:${property.broker.phone}`}
                    className="flex items-center gap-2 text-emerald-50 transition-colors hover:text-white"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-white/70" />
                    {property.broker.phone}
                  </a>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/10 p-3 text-sm text-emerald-50 backdrop-blur-sm">
                <CalendarClock className="h-4 w-4 shrink-0 text-white/70" />
                Agende uma visita sem compromisso.
              </div>

              <div className="mt-5">
                <ContactModal property={property} />
              </div>
            </div>

            {property.isFurnished && (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <Star className="h-4 w-4 shrink-0" />
                Imóvel mobiliado e pronto para morar.
              </div>
            )}

            {property.suites != null && property.suites > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <MessageCircle className="h-4 w-4 shrink-0" />
                {property.suites} suíte{property.suites === 1 ? "" : "s"} neste imóvel.
              </div>
            )}
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="border-t border-slate-200 pt-10">
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">Imóveis semelhantes</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}