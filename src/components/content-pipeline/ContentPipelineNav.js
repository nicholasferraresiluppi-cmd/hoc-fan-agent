"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/content-pipeline", label: "Dashboard", exact: true },
  { href: "/content-pipeline/queue", label: "Queue" },
  { href: "/content-pipeline/creators", label: "Creators" },
  { href: "/content-pipeline/history", label: "History" },
  { href: "/content-pipeline/settings", label: "Settings" },
];

export default function ContentPipelineNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-[#1B1E26] bg-[#0B0D13]">
      <div className="max-w-6xl mx-auto px-6 py-3 flex gap-4 text-sm">
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                active
                  ? "text-[#D4AF7A] font-medium"
                  : "text-[#B9BDC7] hover:text-[#F5F6F8]"
              }
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
