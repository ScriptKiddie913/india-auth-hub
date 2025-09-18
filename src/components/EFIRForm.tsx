/* src/components/EFIRForm.tsx */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { Upload } from "lucide-react";   // <-- correct icon name

const EFIRForm: React.FC = () => {
  const { toast } = useToast();

  const [caseNumber, setCaseNumber] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let photoUrl: string | null = null;
      if (photo) {
        // Upload to Supabase storage (bucket “efir-photos”)
        const { data, error: uploadErr } = await supabase.storage
          .from("efir-photos")
          .upload(`photos/${photo.name}`, photo);
        if (uploadErr) throw uploadErr;
        photoUrl = data?.Path ?? null;
      }

      const { error: insertErr } = await supabase.from("efirs").insert({
        case_number: caseNumber,
        description,
        photo_url: photoUrl,
        officer_id: supabase.auth.user()?.id,
      });

      if (insertErr) throw insertErr;

      toast({
        title: "✅ e‑FIR Recorded",
        description: "The incident has been saved successfully.",
      });

      // Reset form
      setCaseNumber("");
      setDescription("");
      setPhoto(null);
    } catch (err: any) {
      toast({
        title: "❌ Error",
        description: err.message ?? "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>e‑FIR Recorder</CardTitle>
        <CardDescription>
          Fill in the details of the incident and press “Submit”.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        {/* Case Number – UI library uses a wrapper <label> so we just pass the id */}
        <div>
          <label htmlFor="caseNumber" className="block text-sm font-medium mb-1">
            Case Number
          </label>
          <Input
            id="caseNumber"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            required
            placeholder="e.g. CF-2025-001"
          />
        </div>

        {/* Incident description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description
          </label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Describe the incident..."
            rows={4}
          />
        </div>

        {/* Optional photo upload */}
        <div className="flex items-center gap-2 text-sm cursor-pointer">
          <Upload className="w-4 h-4" />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {photo ? photo.name : "Attach a photo (optional)"}
        </div>

        {/* Submit button */}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Submitting…" : "Submit e‑FIR"}
        </Button>
      </form>
    </Card>
  );
};

export default EFIRForm;
