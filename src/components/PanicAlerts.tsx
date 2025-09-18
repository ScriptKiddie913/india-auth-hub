/*  src/components/PanicAlerts.tsx  */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MapPin, Clock, LogOut } from "lucide-react";

interface PanicAlert {
  id: string;
  user_id: string;
  message: string;
  latitude: number;
  longitude: number;
  status: "active" | "resolved";
  created_at: string;
  profiles?: { full_name: string };
}

const PanicAlerts = () => {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PanicAlert[]>([]);
  const [loading, setLoading] = useState(true);

  /* fetch initial data and build realtime channel */
  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from("panic_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setAlerts(data || []);
      setLoading(false);
    };

    fetchAlerts();

    /* realtime updates – new alerts */
    const channel = supabase
      .channel("panic-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "panic_alerts" },
        (payload) => {
          setAlerts((prev) => [payload.new as PanicAlert, ...prev]);
          toast({
            title: "🆕 Panic Alert!",
            description: `From User ${payload.new.user_id}`,
            variant: "destructive",
          });
        },
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [toast]);

  const handleResolve = async (id: string) => {
    const { error } = await supabase
      .from("panic_alerts")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)),
    );
    toast({ title: "Alert Resolved" });
  };

  if (loading) return null; // or skeleton

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <AlertTriangle className="h-6 w-6 inline mr-1 text-destructive" />
          Panic Alerts ({activeCount})
        </CardTitle>
        <CardDescription>
          React to emergencies in real time.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No panic alerts recorded.
          </p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.status === "active"
                  ? "border-destructive bg-destructive/5"
                  : "border-muted"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">
                    <strong>{alert.message}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    from&nbsp;
                    <span className="font-medium">
                      {alert.profiles?.full_name ?? "Unknown User"}
                    </span>
                    {" | "}
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {alert.latitude.toFixed(6)},{" "}
                    {alert.longitude.toFixed(6)}
                  </div>
                </div>

                {alert.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResolve(alert.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default PanicAlerts;
