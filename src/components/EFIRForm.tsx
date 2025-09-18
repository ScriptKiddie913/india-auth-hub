/*  src/components/EFIRForm.tsx  */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadIcon } from "lucide-react";

const EFIRForm = () => {
  const { toast } = useToast();

  const [caseNumber, setCaseNumber] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let photoUrl = null;
      if (photo) {
        // Upload to supabase storage – replace bucket & public path as needed
        const { data, error: uploadErr } = await supabase.storage
          .from("efir-photos")
          .upload(`photos/${photo.name}`, photo);
        if (uploadErr) throw uploadErr;
        photoUrl = data?.Path;
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

      // reset form
      setCaseNumber("");
      setDescription("");
      setPhoto(null);
    } catch (err: any) {
      toast({
        title: "❌ Error",
        description: err.message,
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
        <Input
          label="Case Number"
          value={caseNumber}
          onChange={(e) => setCaseNumber(e.target.value)}
          required
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <FileUploadIcon className="w-4 h-4" />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="hidden"
          />
          {photo ? photo.name : "Attach a photo (optional)"}
        </label>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Submitting…" : "Submit e‑FIR"}
        </Button>
      </form>
    </Card>
  );
};

export default EFIRForm;
