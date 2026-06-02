import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <EmptyState
        title="Page not found"
        illustration="☹️"
        text="The page you are looking for does not exist or has been moved"
        button={[
          <Button variant="secondary" onClick={() => navigate("/")}>
            <Home className="size-4" />
            Back to home
          </Button>,
        ]}
      />
    </div>
  );
}
