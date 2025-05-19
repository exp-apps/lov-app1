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
        <div className="flex items-center gap-4">
          {/* Dark mode badge */}
          <span className="text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded-full px-2 py-1 flex items-center">
            <svg 
              viewBox="0 0 24 24" 
              fill="none"
              className="h-3 w-3 mr-1"
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            Dark Mode
          </span>
        </div>
      </div>
    </header>
  );
}
