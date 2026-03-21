"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background px-4 py-2 flex items-center gap-2">
      <span className="font-semibold mr-4">Time Tracker</span>
      <Link href="/">
        <Button
          variant={pathname === "/" ? "secondary" : "ghost"}
          size="sm"
        >
          Timesheet
        </Button>
      </Link>
      <Link href="/reports">
        <Button
          variant={pathname === "/reports" ? "secondary" : "ghost"}
          size="sm"
        >
          Reports
        </Button>
      </Link>
    </nav>
  );
}
