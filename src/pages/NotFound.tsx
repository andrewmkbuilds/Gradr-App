import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass, FileText, LayoutDashboard, MessageSquare, Target } from "lucide-react";
import { Badge, Card, CardDescription, CardTitle, Text } from "@/design-system/gradr-9b9b95";
import { Button } from "@/components/ds/Button";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";

/** Shortcuts offered instead of a dead end. Signed-out visitors only see sign-in. */
const SUGGESTIONS = [
  { to: "/", label: "Dashboard", description: "Your career command center", icon: LayoutDashboard },
  { to: "/resume", label: "Resume engine", description: "Score and rewrite your resume", icon: FileText },
  { to: "/match", label: "Job matching", description: "Check fit against a role", icon: Target },
  { to: "/interview", label: "Mock interview", description: "Practice with the AI coach", icon: MessageSquare },
] as const;

const NotFound = () => {
  const location = useLocation();
  const { user } = useAuth();
  const signedIn = !!user && user.is_anonymous !== true;

  useEffect(() => {
    // Kept as a warning (not an error) so the 404 doesn't trip error monitors.
    console.warn("404: no route matched", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <Seo
        title="Page not found"
        description="This Gradr page doesn't exist. Jump back to your dashboard or one of the career engines."
        path="/404"
        noindex
      />

      <Card variant="raised" padding="lg" className="w-full max-w-xl space-y-6 text-center">
        <div className="space-y-3">
          <Badge variant="neutral" className="gap-1">
            <Compass className="h-3 w-3" aria-hidden />
            Error 404
          </Badge>
          <CardTitle className="text-h3">This page took a different career path</CardTitle>
          <CardDescription>
            We couldn&apos;t find{" "}
            <span className="font-medium text-foreground">{location.pathname}</span>. It may have
            moved, or the link that brought you here is out of date.
          </CardDescription>
        </div>

        {signedIn ? (
          <div className="grid gap-2 text-left sm:grid-cols-2">
            {SUGGESTIONS.map(({ to, label, description, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-start gap-3 rounded-control border border-border p-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                <span>
                  <Text as="span" variant="body-sm" className="block font-medium text-foreground">
                    {label}
                  </Text>
                  <Text as="span" variant="caption" className="block text-muted-foreground">
                    {description}
                  </Text>
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link to="/">{signedIn ? "Back to dashboard" : "Sign in to Gradr"}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={signedIn ? "/settings" : "/pricing"}>
              {signedIn ? "Account settings" : "See pricing"}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
