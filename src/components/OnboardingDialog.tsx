import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BadgePercent, Loader2, Sparkles } from "lucide-react";
import { ONBOARDING_IDENTITIES } from "@/config/eligibility";
import { VerificationDialog } from "@/components/VerificationDialog";

const COUNTRIES = [
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "in", label: "India" },
  { code: "nl", label: "Netherlands" },
];

interface Props {
  open: boolean;
  onComplete: (prefs: { what: string; where: string; country: string; remoteOnly: boolean; salaryMin: number | null }) => void;
}

export function OnboardingDialog({ open, onComplete }: Props) {
  const { user } = useAuth();
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("us");
  const [remote, setRemote] = useState<"any" | "remote" | "onsite">("any");
  const [salaryMin, setSalaryMin] = useState("");
  const [experience, setExperience] = useState<"entry" | "mid" | "senior" | "lead">("mid");
  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Only identities tied to a verifiable category unlock the discount offer.
  const eligibleIdentity = ONBOARDING_IDENTITIES.find(
    (i) => i.value === identity && i.eligibilityType,
  );

  const submit = async () => {
    if (!user || !role.trim()) return;
    setSaving(true);
    const minSalary = salaryMin ? parseInt(salaryMin, 10) : null;
    await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        target_role: role.trim(),
        locations: location.trim() ? [location.trim()] : [],
        country,
        remote_preference: remote,
        salary_min: minSalary,
        experience_level: experience,
        onboarded: true,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    onComplete({
      what: role.trim(),
      where: location.trim(),
      country,
      remoteOnly: remote === "remote",
      salaryMin: minSalary,
    });
    // Offer verification once the essentials are saved, so setup never stalls.
    if (eligibleIdentity) setVerifyOpen(true);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Let's tailor your job search
          </DialogTitle>
          <DialogDescription>
            Tell us what you're looking for — we'll auto-run a search and start scoring matches against your resume.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>What best describes you?</Label>
            <Select value={identity} onValueChange={setIdentity}>
              <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent>
                {ONBOARDING_IDENTITIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligibleIdentity && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" />
                You may qualify for a verified discount — we'll offer it after setup.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Target role *</Label>
            <Input id="role" placeholder="e.g. Senior Product Designer" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="loc">Preferred location</Label>
              <Input id="loc" placeholder="City or region" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Remote preference</Label>
              <Select value={remote} onValueChange={(v: typeof remote) => setRemote(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Open to any</SelectItem>
                  <SelectItem value="remote">Remote only</SelectItem>
                  <SelectItem value="onsite">On-site only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Experience</Label>
              <Select value={experience} onValueChange={(v: typeof experience) => setExperience(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry level</SelectItem>
                  <SelectItem value="mid">Mid-level</SelectItem>
                  <SelectItem value="senior">Senior</SelectItem>
                  <SelectItem value="lead">Lead / Principal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sal">Minimum salary (annual)</Label>
            <Input id="sal" type="number" placeholder="e.g. 90000" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!role.trim() || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Save & search jobs
          </Button>
        </DialogFooter>
      </DialogContent>
      <VerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        defaultType={eligibleIdentity?.eligibilityType ?? null}
      />
    </Dialog>
  );
}
