"use client";

import { useState } from "react";
import { Check, Link2, Mail, Share2, MessageCircle, Globe, X } from "lucide-react";

/**
 * Share affordances for the PDP. Uses the native Web Share API when available;
 * otherwise a deterministic fallback: copy-link plus WhatsApp/Facebook/X/e-mail
 * deep-links (good SEO/UX without extra JS).
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const full = typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
  const encodedUrl = encodeURIComponent(full);
  const encodedTitle = encodeURIComponent(title);

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      // Clipboard API blocked — fall back to a transient textarea select/copy.
      const ta = document.createElement("textarea");
      ta.value = full;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url: full });
    } catch {
      // Aborted by the user — no-op.
    }
  }

  const social = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      className: "bg-[#25D366] hover:brightness-95",
      icon: MessageCircle,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      className: "bg-[#1877F2] hover:brightness-95",
      icon: Globe,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      className: "bg-slate-900 hover:bg-slate-800",
      icon: X,
    },
    {
      label: "E-mail",
      href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
      className: "bg-slate-500 hover:bg-slate-600",
      icon: Mail,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={canNativeShare ? nativeShare : copyLink}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
        {copied ? "Link copiado!" : "Compartilhar"}
      </button>

      {!canNativeShare && (
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Link2 className="h-4 w-4" />
          Copiar link
        </button>
      )}

      {social.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Compartilhar no ${s.label}`}
          title={`Compartilhar no ${s.label}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors ${s.className}`}
        >
          <s.icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}