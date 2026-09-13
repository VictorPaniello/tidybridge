import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <span className="font-semibold tracking-tight">
            tidy<span className="text-ring">bridge</span>
          </span>
          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}
