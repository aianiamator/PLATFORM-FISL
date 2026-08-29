import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mb-6 border shadow-sm">
        <span className="text-3xl font-serif font-bold text-muted-foreground">404</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button size="lg" className="rounded-full">
          Return Home
        </Button>
      </Link>
    </div>
  );
}
