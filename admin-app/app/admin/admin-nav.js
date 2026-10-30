"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { resources } from "../../lib/admin-resources";

const LINKS = [
  { href: "/admin", label: "Stats" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/captions", label: "Captions" },
  { href: "/admin/votes", label: "Votes" },
  ...Object.entries(resources).map(([slug, config]) => ({ href: `/admin/${slug}`, label: config.title })),
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            className={`admin-nav-link${active ? " is-active" : ""}`}
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
