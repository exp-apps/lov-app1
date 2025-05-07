
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="border-b">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="sr-only">Handover Taxonomy</span>
            <span className="inline-block">Agent-Handover Taxonomy Labeller</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
