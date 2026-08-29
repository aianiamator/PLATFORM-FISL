import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Users, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="FISL Logo" className="w-8 h-8" />
            <span className="font-serif font-bold text-xl tracking-tight">FISL</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="rounded-full px-5">Join Now</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="pt-32 pb-24 md:pt-48 md:pb-32 px-6">
          <div className="container mx-auto max-w-4xl text-center flex flex-col items-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Applications open for Cohort I
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 leading-tight font-serif">
              Master Practical AI. <br className="hidden md:block" />
              <span className="text-muted-foreground">Build the Future.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              FISL is a selective learning community for serious builders. Get structured pathways, real-world lessons, and a space for focused discussion.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="rounded-full px-8 h-12 text-base w-full sm:w-auto">
                  Start Your Journey <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-secondary/50 px-6">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-2xl bg-background border flex items-center justify-center shadow-sm">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Structured Pathways</h3>
                <p className="text-muted-foreground leading-relaxed">
                  No fluff. No generic advice. Follow a highly curated sequence of lessons designed to make you proficient in applied AI.
                </p>
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-2xl bg-background border flex items-center justify-center shadow-sm">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Practical Application</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Focus on what works in production today. Learn how to architect, build, and deploy systems that solve real problems.
                </p>
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-2xl bg-background border flex items-center justify-center shadow-sm">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Private Community</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Surround yourself with peers who are actually building. Share insights, ask questions, and grow together.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border px-6">
        <div className="container mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <img src="/logo.svg" alt="FISL Logo" className="w-5 h-5 opacity-50 grayscale" />
            <span>&copy; {new Date().getFullYear()} FISL Platform. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
