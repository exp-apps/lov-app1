import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-900">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="sr-only">Handover Taxonomy</span>
            <span className="inline-block bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Agent-Handover Taxonomy Labeller
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
