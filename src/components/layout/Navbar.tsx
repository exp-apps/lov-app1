import { Link, useLocation } from "react-router-dom";

const navItems = [
  { name: "Home", path: "/" },
  { name: "Upload Dataset", path: "/upload" },
  { name: "Dataset Library", path: "/datasets" },
  { name: "Evaluations", path: "/evals" },
  { name: "Domain Labelling", path: "/domain-labelling" },
  { name: "Settings", path: "/settings" }
];

export function Navbar() {
  const location = useLocation();
  
  return (
    <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="container flex h-12 items-center">
        <ul className="flex gap-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-zinc-300 px-3 py-2 rounded-md ${
                  location.pathname === item.path
                    ? "bg-indigo-900/50 text-indigo-200 border-b-2 border-indigo-500"
                    : "text-zinc-400 hover:bg-zinc-800/70"
                }`}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
