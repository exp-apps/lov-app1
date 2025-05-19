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
    <nav className="border-b">
      <div className="container flex h-12 items-center">
        <ul className="flex gap-4">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-foreground/80 px-3 py-2 rounded-md ${
                  location.pathname === item.path
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/60"
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
