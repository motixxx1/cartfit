"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, ChefHat, Scale, CheckSquare, BarChart3 } from "lucide-react";

const TABS = [
  { href: "/", label: "בית", icon: Home },
  { href: "/cart", label: "הסל", icon: ShoppingCart },
  { href: "/meal", label: "מצב שף", icon: ChefHat },
  { href: "/compare", label: "השוואה", icon: Scale },
  { href: "/checkout", label: "קנייה", icon: CheckSquare },
  { href: "/insights", label: "תובנות", icon: BarChart3 },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl justify-between px-2 py-1.5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link key={href} href={href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10.5px] transition-colors ${
                active ? "text-brand font-semibold" : "text-ink-muted"}`}>
              <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
